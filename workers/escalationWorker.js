/**
 * Escalation Worker
 * 
 * Background process that:
 * 1. Polls Redis for pending escalations
 * 2. Executes escalations when due
 * 3. Checks incident state (abort if RESOLVED/CANCELLED)
 * 4. Enqueues next escalation level
 * 5. Handles crashes gracefully (DB is source of truth)
 * 
 * CRITICAL: This runs in a loop, not via cron or timeouts.
 */

const pool = require('../db');
const scheduler = require('../services/escalationScheduler');
const { ESCALATION_POLICY } = require('../config/escalationPolicy');

// TASK 3: Hard gate Redis based on feature flag
const FEATURE_ESCALATION_ENABLED = process.env.FEATURE_ESCALATION_ENABLED === 'true';
let redisManager = null;

function getRedisManager() {
  // TASK 3A: Only load Redis if feature is explicitly enabled
  if (!FEATURE_ESCALATION_ENABLED) {
    return null;
  }
  
  if (!redisManager) {
    try {
      redisManager = require('../services/redis');
    } catch (err) {
      console.error('[WORKER] Redis required but failed to load:', err.message);
      // If escalation is enabled but Redis fails, this is critical
      throw err;
    }
  }
  return redisManager;
}

let isRunning = false;
let workerLoopTimeout = null;

/**
 * Main worker loop
 * Runs continuously, polling Redis for escalations
 * TASK 3: Only runs if FEATURE_ESCALATION_ENABLED is true
 */
async function workerLoop() {
  try {
    // TASK 3A: Enforce feature flag at loop entry
    if (!isRunning || !FEATURE_ESCALATION_ENABLED) {
      return;
    }

    const redisM = getRedisManager();

    // TASK 3B: If escalation is enabled, Redis MUST be available
    if (!redisM || !redisM.isRedisConnected()) {
      console.error('[WORKER] Redis not connected (required for escalation), retrying...');
      scheduleNextLoop(10000); // Retry after 10s
      return;
    }

    // Fetch pending escalations that are ready to execute
    const escalationIds = await scheduler.getPendingEscalations(10);

    if (escalationIds.length === 0) {
      // No escalations ready yet, schedule next check
      scheduleNextLoop(ESCALATION_POLICY.workerPollIntervalMs);
      return;
    }

    console.log(`[WORKER] Found ${escalationIds.length} escalation(s) ready to execute`);

    // Execute each escalation
    for (const escalationId of escalationIds) {
      await executeEscalation(escalationId);
    }

    // Schedule next check
    scheduleNextLoop(ESCALATION_POLICY.workerPollIntervalMs);
  } catch (err) {
    console.error('[WORKER] Error in worker loop:', err.message);
    // Reschedule even on error to avoid stopping
    scheduleNextLoop(ESCALATION_POLICY.workerPollIntervalMs);
  }
}

/**
 * Execute a single escalation
 * 
 * @param {string} escalationId - Escalation UUID
 */
async function executeEscalation(escalationId) {
  const client = pool;

  try {
    // Fetch escalation from DB
    const escalationResult = await pool.query(
      `SELECT id, incident_id, escalation_level, status FROM escalations WHERE id = $1`,
      [escalationId]
    );

    if (!escalationResult.rows.length) {
      console.warn(`[WORKER] Escalation ${escalationId} not found in DB`);
      return;
    }

    const escalation = escalationResult.rows[0];

    // Safety check: if already executed, skip
    if (escalation.status !== 'PENDING') {
      console.log(`[WORKER] Escalation ${escalationId} already ${escalation.status}, skipping`);
      await scheduler.removeFromPending(escalationId);
      return;
    }

    // Fetch incident to check state
    const incidentResult = await pool.query(
      `SELECT id, state FROM incidents WHERE id = $1`,
      [escalation.incident_id]
    );

    if (!incidentResult.rows.length) {
      console.error(`[WORKER] Incident ${escalation.incident_id} not found`);
      // Mark escalation as executed (can't escalate non-existent incident)
      await pool.query(
        `UPDATE escalations SET status = 'EXECUTED', executed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [escalationId]
      );
      await scheduler.removeFromPending(escalationId);
      return;
    }

    const incident = incidentResult.rows[0];

    // CRITICAL SAFETY CHECK: If incident is resolved or cancelled, don't escalate
    if (incident.state === 'RESOLVED' || incident.state === 'CANCELLED') {
      console.log(`[WORKER] Incident ${escalation.incident_id} is ${incident.state}, not escalating`);
      
      // Update escalation to CANCELLED (since incident is no longer escalating)
      await pool.query(
        `UPDATE escalations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [escalationId]
      );
      
      await scheduler.removeFromPending(escalationId);
      return;
    }

    // If not in ESCALATING state anymore, cancel this escalation
    if (incident.state !== 'ESCALATING') {
      console.log(`[WORKER] Incident ${escalation.incident_id} is ${incident.state}, not ESCALATING, cancelling escalation`);
      
      await pool.query(
        `UPDATE escalations SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [escalationId]
      );
      
      await scheduler.removeFromPending(escalationId);
      return;
    }

    // Execute escalation (for now, just log it - in Phase 4 this would send notifications)
    console.log(`[ESCALATION] ⏱️ EXECUTING Level ${escalation.escalation_level} for incident ${escalation.incident_id}`);

    // Mark as executed in DB (atomic)
    await pool.query(
      `UPDATE escalations SET status = 'EXECUTED', executed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [escalationId]
    );

    // Remove from Redis pending queue
    await scheduler.removeFromPending(escalationId);

    // Enqueue next escalation level
    const nextEscalation = await scheduler.enqueueNextEscalation(escalationId);

    if (nextEscalation) {
      console.log(`[WORKER] Enqueued next escalation level ${nextEscalation.escalation_level}`);
    } else {
      console.log(`[WORKER] Max escalation level reached for incident ${escalation.incident_id}`);
    }
  } catch (err) {
    console.error(`[WORKER] Error executing escalation ${escalationId}:`, err.message);
    // Don't crash - will retry on next loop
    // This is safe because DB is source of truth
  }
}

/**
 * Schedule next worker loop iteration
 * 
 * @param {number} delayMs - Delay in milliseconds
 */
function scheduleNextLoop(delayMs) {
  if (!isRunning) return;

  workerLoopTimeout = setTimeout(() => {
    workerLoop();
  }, delayMs);
}

/**
 * Start the escalation worker
 * TASK 3: Only starts if FEATURE_ESCALATION_ENABLED is true
 */
async function start() {
  try {
    // TASK 3A: Hard enforce feature flag
    if (!FEATURE_ESCALATION_ENABLED) {
      console.log('[WORKER] Escalation worker disabled by feature flag (FEATURE_ESCALATION_ENABLED=false)');
      return;
    }

    console.log('[WORKER] Starting Escalation Worker (feature enabled)...');

    // Initialize Redis connection (required for escalation)
    const redisM = getRedisManager();
    if (!redisM) {
      throw new Error('Redis manager not available (required for escalation)');
    }

    try {
      await redisM.initializeRedis();
      console.log('[WORKER] Redis connected successfully');
    } catch (redisErr) {
      console.error('[WORKER] Redis connection failed (critical for escalation):', redisErr.message);
      throw redisErr; // Fail if escalation is enabled but Redis fails
    }

    isRunning = true;

    // Start worker loop
    workerLoop();

    console.log('[WORKER] Escalation Worker started successfully');
  } catch (err) {
    console.error('[WORKER] Failed to start escalation worker:', err.message);
    isRunning = false;
    throw err;
  }
}

/**
 * Stop the escalation worker gracefully
 */
async function stop() {
  try {
    console.log('[WORKER] Stopping Escalation Worker...');

    isRunning = false;

    // Clear pending timeout
    if (workerLoopTimeout) {
      clearTimeout(workerLoopTimeout);
      workerLoopTimeout = null;
    }

    // Shutdown Redis if available
    const redisM = getRedisManager();
    if (redisM) {
      try {
        await redisM.shutdown();
      } catch (err) {
        console.warn('[WORKER] Error shutting down Redis:', err.message);
      }
    }

    console.log('[WORKER] Escalation Worker stopped');
  } catch (err) {
    console.error('[WORKER] Error during shutdown:', err.message);
    throw err;
  }
}

/**
 * Health check
 * @returns {object} Worker status
 */
async function getStatus() {
  const redisM = getRedisManager();
  return {
    running: isRunning,
    redisConnected: redisM && redisM.isRedisConnected()
  };
}

module.exports = {
  start,
  stop,
  getStatus
};
