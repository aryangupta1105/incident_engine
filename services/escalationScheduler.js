/**
 * Escalation Scheduler
 * 
 * Manages enqueueing and cancelling escalations in Redis.
 * Uses Redis sorted sets where score = execution timestamp.
 * 
 * This is NOT the executor - just the scheduler.
 * PostgreSQL is the source of truth for escalation state.
 */

const pool = require('../db');
let redisManager = null;
const { getNextLevel, getDelayForLevel } = require('../config/escalationPolicy');
const { v4: uuid } = require('uuid');

// Lazy load Redis manager to handle missing Redis gracefully
function getRedisManager() {
  if (!redisManager) {
    try {
      redisManager = require('./redis');
    } catch (err) {
      console.warn('[ESCALATION] Redis module not available:', err.message);
      redisManager = null;
    }
  }
  return redisManager;
}

/**
 * Schedule first escalation for an incident
 * Called when incident transitions to ESCALATING
 * 
 * @param {string} incidentId - Incident UUID
 * @returns {object} Escalation record
 */
async function scheduleEscalation(incidentId) {
  try {
    const redisM = getRedisManager();
    const client = redisM?.getClient();
    if (!redisM || !redisM.isRedisConnected()) {
      console.warn('[ESCALATION] Redis not available, escalation will be skipped');
      // Still return a fake escalation record for DB consistency
      const level = 1;
      const delayMs = getDelayForLevel(level);
      const scheduledAt = new Date(Date.now() + delayMs);

      const escalationResult = await pool.query(
        `INSERT INTO escalations (
          id, incident_id, escalation_level, status, scheduled_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          uuid(),
          incidentId,
          level,
          'PENDING',
          scheduledAt,
          new Date(),
          new Date()
        ]
      );
      
      console.log(`[ESCALATION] Created escalation record (Redis unavailable)`);
      return escalationResult.rows[0];
    }

    // Get incident to verify it's in ESCALATING state
    const incidentResult = await pool.query(
      'SELECT id, state FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (!incidentResult.rows.length) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const incident = incidentResult.rows[0];
    if (incident.state !== 'ESCALATING') {
      throw new Error(`Cannot schedule escalation: incident state is ${incident.state}, not ESCALATING`);
    }

    // Start with level 1
    const level = 1;
    const delayMs = getDelayForLevel(level);
    const scheduledAt = new Date(Date.now() + delayMs);

    // Insert escalation record in DB (source of truth)
    const escalationResult = await pool.query(
      `INSERT INTO escalations (
        id, incident_id, escalation_level, status, scheduled_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        uuid(),
        incidentId,
        level,
        'PENDING',
        scheduledAt,
        new Date(),
        new Date()
      ]
    );

    const escalation = escalationResult.rows[0];

    // Enqueue in Redis sorted set
    // Key: "escalations:pending" | Score: timestamp | Value: escalation ID
    const redisKey = 'escalations:pending';
    const scoreTimestamp = scheduledAt.getTime();

    await client.zAdd(redisKey, {
      score: scoreTimestamp,
      value: escalation.id
    });

    console.log(`[ESCALATION] Scheduled level ${level} for incident ${incidentId} at ${scheduledAt.toISOString()}`);

    return escalation;
  } catch (err) {
    console.error('[ESCALATION] Schedule failed:', err.message);
    throw err;
  }
}

/**
 * Cancel all pending escalations for an incident
 * Called when incident transitions to RESOLVED or CANCELLED
 * 
 * @param {string} incidentId - Incident UUID
 * @returns {number} Number of escalations cancelled
 */
async function cancelPendingEscalations(incidentId) {
  try {
    const redisM = getRedisManager();

    // Get all pending escalations for this incident
    const result = await pool.query(
      `SELECT id FROM escalations 
       WHERE incident_id = $1 AND status = 'PENDING'`,
      [incidentId]
    );

    const pendingEscalations = result.rows;

    if (pendingEscalations.length === 0) {
      console.log(`[ESCALATION] No pending escalations to cancel for incident ${incidentId}`);
      return 0;
    }

    // Update all pending escalations to CANCELLED
    const escalationIds = pendingEscalations.map(e => e.id);
    
    await pool.query(
      `UPDATE escalations 
       SET status = 'CANCELLED', updated_at = NOW() 
       WHERE id = ANY($1)`,
      [escalationIds]
    );

    // Remove from Redis if connected
    if (redisM && redisM.isRedisConnected()) {
      const client = redisM.getClient();
      const redisKey = 'escalations:pending';
      for (const esc of pendingEscalations) {
        await client.zRem(redisKey, esc.id);
      }
    }

    console.log(`[ESCALATION] Cancelled ${pendingEscalations.length} pending escalation(s) for incident ${incidentId}`);

    return pendingEscalations.length;
  } catch (err) {
    console.error('[ESCALATION] Cancellation failed:', err.message);
    throw err;
  }
}

/**
 * Enqueue next escalation level
 * Called by worker after executing current level
 * 
 * @param {string} escalationId - Current escalation ID (already executed)
 * @returns {object|null} New escalation record or null if max level reached
 */
async function enqueueNextEscalation(escalationId) {
  try {
    const redisM = getRedisManager();
    if (!redisM || !redisM.isRedisConnected()) {
      console.warn('[ESCALATION] Redis not available, skipping next escalation enqueueing');
      return null;
    }

    const client = redisM.getClient();

    // Get current escalation
    const escalationResult = await pool.query(
      `SELECT incident_id, escalation_level FROM escalations WHERE id = $1`,
      [escalationId]
    );

    if (!escalationResult.rows.length) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    const currentEscalation = escalationResult.rows[0];
    const { incident_id, escalation_level } = currentEscalation;

    // Check if incident is still in ESCALATING state
    const incidentResult = await pool.query(
      'SELECT state FROM incidents WHERE id = $1',
      [incident_id]
    );

    if (!incidentResult.rows.length) {
      throw new Error(`Incident ${incident_id} not found`);
    }

    const incident = incidentResult.rows[0];
    if (incident.state !== 'ESCALATING') {
      console.log(`[ESCALATION] Incident ${incident_id} is ${incident.state}, not enqueueing next level`);
      return null;
    }

    // Get next level
    const nextLevel = escalation_level + 1;
    const delayMs = getDelayForLevel(nextLevel);

    if (!delayMs) {
      console.log(`[ESCALATION] Max escalation level reached for incident ${incident_id}`);
      return null;
    }

    // Insert next escalation
    const scheduledAt = new Date(Date.now() + delayMs);

    const newEscalationResult = await pool.query(
      `INSERT INTO escalations (
        id, incident_id, escalation_level, status, scheduled_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        uuid(),
        incident_id,
        nextLevel,
        'PENDING',
        scheduledAt,
        new Date(),
        new Date()
      ]
    );

    const newEscalation = newEscalationResult.rows[0];

    // Enqueue in Redis
    const redisKey = 'escalations:pending';
    const scoreTimestamp = scheduledAt.getTime();

    await client.zAdd(redisKey, {
      score: scoreTimestamp,
      value: newEscalation.id
    });

    console.log(`[ESCALATION] Enqueued level ${nextLevel} for incident ${incident_id} at ${scheduledAt.toISOString()}`);

    return newEscalation;
  } catch (err) {
    console.error('[ESCALATION] Enqueue next failed:', err.message);
    throw err;
  }
}

/**
 * Get pending escalations ready to execute
 * Called by worker to fetch jobs
 * 
 * @param {number} limit - Max escalations to fetch
 * @returns {string[]} Array of escalation IDs
 */
async function getPendingEscalations(limit = 10) {
  try {
    const redisM = getRedisManager();
    if (!redisM || !redisM.isRedisConnected()) {
      return [];
    }

    const client = redisM.getClient();
    const redisKey = 'escalations:pending';
    const now = Date.now();

    // Get all escalations where score (timestamp) <= now
    const escalationIds = await client.zRangeByScore(
      redisKey,
      '-inf',
      now,
      { LIMIT: { offset: 0, count: limit } }
    );

    return escalationIds || [];
  } catch (err) {
    console.error('[ESCALATION] Get pending failed:', err.message);
    throw err;
  }
}

async function removeFromPending(escalationId) {
  try {
    const redisM = getRedisManager();
    if (!redisM || !redisM.isRedisConnected()) {
      return;
    }

    const client = redisM.getClient();
    const redisKey = 'escalations:pending';
    await client.zRem(redisKey, escalationId);
  } catch (err) {
    console.error('[ESCALATION] Remove from pending failed:', err.message);
    throw err;
  }
}

module.exports = {
  scheduleEscalation,
  cancelPendingEscalations,
  enqueueNextEscalation,
  getPendingEscalations,
  removeFromPending
};
