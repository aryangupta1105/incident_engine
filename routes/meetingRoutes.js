/**
 * PHASE C: MANUAL CONFIRMATION (TRUTH LAYER)
 * 
 * Meeting checkin API
 * Allows users to manually confirm if they joined or missed a meeting
 * 
 * This is intentionally simple and respectful:
 * - Privacy-safe (no tracking)
 * - Platform-agnostic
 * - User-trusted
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const pool = require('../db');
const alertService = require('../services/alertService');
const incidentService = require('../services/incidentService');

const router = express.Router();

/**
 * POST /meetings/:eventId/checkin
 * 
 * User confirms if they joined or missed the meeting
 * 
 * @param {string} eventId - Event UUID from calendar sync
 * @param {object} body - Request body
 * @param {string} body.userId - User UUID
 * @param {string} body.status - "JOINED" or "MISSED"
 * 
 * @returns {object} Confirmation result
 */
router.post('/:eventId/checkin', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId, status } = req.body;

    // Validation
    if (!userId || !eventId) {
      return res.status(400).json({
        success: false,
        error: 'userId and eventId are required'
      });
    }

    if (!['JOINED', 'MISSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be JOINED or MISSED'
      });
    }

    console.log(`[CHECKIN] User ${userId} confirms meeting ${eventId}: ${status}`);

    // Get event details
    const eventRes = await pool.query(
      'SELECT id, occurred_at FROM events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (!eventRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    const event = eventRes.rows[0];

    // Record the checkin
    const checkinRes = await pool.query(
      `INSERT INTO meeting_checkins (id, user_id, event_id, status, confirmed_at, confirmation_source)
       VALUES ($1, $2, $3, $4, NOW(), 'API')
       RETURNING *`,
      [uuid(), userId, eventId, status]
    );

    const checkin = checkinRes.rows[0];

    // Handle based on status
    let result;
    if (status === 'JOINED') {
      result = await handleJoined(userId, eventId, checkin);
    } else {
      result = await handleMissed(userId, eventId, checkin, event);
    }

    console.log(`[CHECKIN] Confirmation processed: ${result.action}`);

    return res.status(200).json({
      success: true,
      checkinId: checkin.id,
      status,
      action: result.action,
      message: result.message
    });
  } catch (err) {
    console.error('[CHECKIN] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Handle JOINED confirmation
 * Cancel all pending alerts, prevent incident creation
 * 
 * @private
 */
async function handleJoined(userId, eventId, checkin) {
  console.log(`[CHECKIN_JOINED] Cancelling alerts for event ${eventId}`);

  // Cancel all pending alerts for this event
  await pool.query(
    `UPDATE alerts SET status = 'CANCELLED' 
     WHERE event_id = $1 AND status = 'PENDING'`,
    [eventId]
  );

  // Resolve any open incident for this event
  const incidentRes = await pool.query(
    `SELECT id FROM incidents 
     WHERE event_id = $1 AND state IN ('OPEN', 'ESCALATING')
     LIMIT 1`,
    [eventId]
  );

  let resolvedIncidentId = null;
  if (incidentRes.rows.length > 0) {
    const incidentId = incidentRes.rows[0].id;
    await pool.query(
      `UPDATE incidents 
       SET state = 'RESOLVED', resolved_at = NOW(), resolution_note = 'User confirmed meeting joined'
       WHERE id = $1`,
      [incidentId]
    );
    resolvedIncidentId = incidentId;

    // Cancel escalation steps for this incident
    await pool.query(
      `UPDATE escalation_steps 
       SET status = 'SKIPPED'
       WHERE incident_id = $1 AND status = 'PENDING'`,
      [incidentId]
    );
  }

  return {
    action: 'JOINED_CONFIRMED',
    message: 'Great! All alerts cancelled. Meeting confirmed as joined.',
    alertsCancelled: true,
    incidentResolved: resolvedIncidentId ? true : false,
    incidentId: resolvedIncidentId
  };
}

/**
 * Handle MISSED confirmation
 * Create incident if not exists, trigger escalation
 * 
 * @private
 */
async function handleMissed(userId, eventId, checkin, event) {
  console.log(`[CHECKIN_MISSED] Creating incident for missed meeting ${eventId}`);

  // Check if incident already exists
  const existingIncident = await pool.query(
    `SELECT id FROM incidents 
     WHERE event_id = $1 AND category = 'MEETING'
     LIMIT 1`,
    [eventId]
  );

  let incidentId;
  if (existingIncident.rows.length > 0) {
    incidentId = existingIncident.rows[0].id;
    console.log(`[CHECKIN_MISSED] Using existing incident: ${incidentId}`);
  } else {
    // Create new incident
    const incidentRes = await pool.query(
      `INSERT INTO incidents (id, user_id, event_id, category, type, severity, state, description, created_at, updated_at)
       VALUES ($1, $2, $3, 'MEETING', 'MISSED_MEETING', 'HIGH', 'OPEN', $4, NOW(), NOW())
       RETURNING id`,
      [
        uuid(),
        userId,
        eventId,
        `Meeting was missed. User confirmed on ${new Date().toISOString()}`
      ]
    );
    incidentId = incidentRes.rows[0].id;
    console.log(`[CHECKIN_MISSED] Created incident: ${incidentId}`);
  }

  // Schedule escalation steps (Email → SMS → Call)
  const escalationSteps = [
    {
      stepNumber: 1,
      stepType: 'EMAIL',
      delayMinutes: 0 // Immediately
    },
    {
      stepNumber: 2,
      stepType: 'SMS',
      delayMinutes: 2 // After 2 minutes
    },
    {
      stepNumber: 3,
      stepType: 'CALL',
      delayMinutes: 5 // After 5 minutes
    }
  ];

  for (const step of escalationSteps) {
    const scheduledAt = new Date(Date.now() + step.delayMinutes * 60 * 1000);
    await pool.query(
      `INSERT INTO escalation_steps 
       (id, incident_id, user_id, step_number, step_type, scheduled_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW(), NOW())`,
      [
        uuid(),
        incidentId,
        userId,
        step.stepNumber,
        step.stepType,
        scheduledAt
      ]
    );
  }

  return {
    action: 'MISSED_CONFIRMED',
    message: 'Incident created for missed meeting. Recovery escalation ladder activated.',
    incidentCreated: !existingIncident.rows.length,
    incidentId,
    escalationStepsScheduled: escalationSteps.length
  };
}

module.exports = router;
