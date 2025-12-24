/**
 * PHASE D: MISSED MEETING INCIDENT + ESCALATION LADDER
 * 
 * Escalation Service
 * 
 * Responsibilities:
 * 1. Detect missed meetings (after grace period)
 * 2. Create incidents automatically
 * 3. Execute escalation ladder progressively
 * 4. Stop escalation on resolution
 * 
 * Escalation Ladder:
 * +0 min: Email notification
 * +2 min: WhatsApp/SMS message
 * +5 min: Auto-call
 * +10 min (optional): Repeat call or notify emergency contact
 */

const pool = require('../db');
const { v4: uuid } = require('uuid');
const autoCallService = require('./autoCallService');
const nodemailer = require('nodemailer');

const GRACE_PERIOD_MINUTES = 5; // Minutes after meeting start to detect as missed

/**
 * Check for missed meetings and create incidents
 * Called periodically by a worker (e.g., every 1 minute)
 * 
 * @returns {Promise<object>} Result summary
 */
async function detectAndCreateMissedIncidents() {
  try {
    console.log('[ESCALATION_ENGINE] Checking for missed meetings...');

    const cutoffTime = new Date(Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000);

    // Find meetings that:
    // 1. Started more than GRACE_PERIOD_MINUTES ago
    // 2. Have status SCHEDULED (not yet confirmed as joined)
    // 3. Don't have an open incident
    const missedMeetingsRes = await pool.query(
      `SELECT DISTINCT e.id, e.user_id, e.category, e.type, e.payload, e.occurred_at
       FROM events e
       WHERE e.category = 'MEETING'
       AND e.type = 'MEETING_SCHEDULED'
       AND e.occurred_at < $1
       AND e.payload->>'status' = 'SCHEDULED'
       AND NOT EXISTS (
         SELECT 1 FROM meeting_checkins mc
         WHERE mc.event_id = e.id AND mc.status = 'JOINED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM incidents i
         WHERE i.event_id = e.id AND i.state IN ('OPEN', 'ESCALATING')
       )
       LIMIT 100`,
      [cutoffTime.toISOString()]
    );

    const missedMeetings = missedMeetingsRes.rows;
    console.log(`[ESCALATION_ENGINE] Found ${missedMeetings.length} missed meetings`);

    const results = await Promise.allSettled(
      missedMeetings.map(meeting => createMissedIncident(meeting))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[ESCALATION_ENGINE] Missed incidents: ${succeeded} created, ${failed} failed`);

    return {
      missedDetected: missedMeetings.length,
      incidentsCreated: succeeded,
      incidentsFailed: failed
    };
  } catch (err) {
    console.error('[ESCALATION_ENGINE] Detection failed:', err.message);
    throw err;
  }
}

/**
 * Create incident for a single missed meeting
 * @private
 */
async function createMissedIncident(meeting) {
  const { id: eventId, user_id: userId, payload } = meeting;

  console.log(`[ESCALATION_ENGINE] Creating incident for missed meeting ${eventId}`);

  // Create incident
  const incidentRes = await pool.query(
    `INSERT INTO incidents (id, user_id, event_id, category, type, severity, state, description, created_at, updated_at)
     VALUES ($1, $2, $3, 'MEETING', 'MISSED_MEETING', 'HIGH', 'ESCALATING', $4, NOW(), NOW())
     RETURNING id`,
    [
      uuid(),
      userId,
      eventId,
      `Meeting "${payload.title}" was missed. Automatic detection at ${new Date().toISOString()}`
    ]
  );

  const incidentId = incidentRes.rows[0].id;

  // Schedule escalation steps
  const escalationSteps = [
    {
      stepNumber: 1,
      stepType: 'EMAIL',
      delayMinutes: 0
    },
    {
      stepNumber: 2,
      stepType: 'SMS',
      delayMinutes: 2
    },
    {
      stepNumber: 3,
      stepType: 'CALL',
      delayMinutes: 5
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

  console.log(`[ESCALATION_ENGINE] Incident created: ${incidentId}, ${escalationSteps.length} escalation steps scheduled`);

  return {
    incidentId,
    eventId,
    escalationStepsCount: escalationSteps.length
  };
}

/**
 * Execute pending escalation steps
 * Called periodically to process escalation ladder
 * 
 * @returns {Promise<object>} Execution result
 */
async function executeEscalationSteps() {
  try {
    console.log('[ESCALATION_EXECUTOR] Checking for pending escalation steps...');

    // Find pending steps that are due
    const pendingRes = await pool.query(
      `SELECT es.id, es.incident_id, es.user_id, es.step_number, es.step_type, es.scheduled_at, i.event_id
       FROM escalation_steps es
       JOIN incidents i ON es.incident_id = i.id
       WHERE es.status = 'PENDING'
       AND es.scheduled_at <= NOW()
       ORDER BY es.scheduled_at ASC
       LIMIT 50`
    );

    const pendingSteps = pendingRes.rows;
    console.log(`[ESCALATION_EXECUTOR] Found ${pendingSteps.length} pending steps to execute`);

    const results = await Promise.allSettled(
      pendingSteps.map(step => executeEscalationStep(step))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[ESCALATION_EXECUTOR] Execution: ${succeeded} succeeded, ${failed} failed`);

    return {
      stepsExecuted: succeeded,
      stepsFailed: failed
    };
  } catch (err) {
    console.error('[ESCALATION_EXECUTOR] Execution failed:', err.message);
    throw err;
  }
}

/**
 * Execute a single escalation step
 * @private
 */
async function executeEscalationStep(step) {
  const { id: stepId, incident_id: incidentId, user_id: userId, step_type: stepType, step_number: stepNumber } = step;

  try {
    console.log(`[ESCALATION_EXECUTOR] Executing step ${stepNumber} (${stepType}) for incident ${incidentId}`);

    // Check if incident is still open (might have been resolved)
    const incidentCheck = await pool.query(
      'SELECT state FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (!incidentCheck.rows.length || incidentCheck.rows[0].state !== 'ESCALATING') {
      console.log(`[ESCALATION_EXECUTOR] Incident no longer escalating, skipping step ${stepId}`);
      await pool.query(
        'UPDATE escalation_steps SET status = $1, executed_at = NOW() WHERE id = $2',
        ['SKIPPED', stepId]
      );
      return;
    }

    let success = false;
    let errorMessage = null;

    switch (stepType) {
      case 'EMAIL':
        success = await sendEscalationEmail(userId, incidentId);
        break;
      case 'SMS':
        success = await sendEscalationSMS(userId, incidentId);
        break;
      case 'CALL':
        success = await sendEscalationCall(userId, incidentId);
        break;
      default:
        throw new Error(`Unknown step type: ${stepType}`);
    }

    if (success) {
      await pool.query(
        'UPDATE escalation_steps SET status = $1, executed_at = NOW() WHERE id = $2',
        ['EXECUTED', stepId]
      );
      console.log(`[ESCALATION_EXECUTOR] Step ${stepNumber} executed successfully`);
    } else {
      await pool.query(
        'UPDATE escalation_steps SET status = $1, error_message = $2 WHERE id = $3',
        ['FAILED', errorMessage || 'Execution failed', stepId]
      );
      console.warn(`[ESCALATION_EXECUTOR] Step ${stepNumber} failed`);
    }

    return { stepId, success };
  } catch (err) {
    console.error(`[ESCALATION_EXECUTOR] Step execution error: ${err.message}`);
    await pool.query(
      'UPDATE escalation_steps SET status = $1, error_message = $2 WHERE id = $3',
      ['FAILED', err.message, stepId]
    );
    throw err;
  }
}

/**
 * Send escalation email
 * @private
 */
async function sendEscalationEmail(userId, incidentId) {
  try {
    const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return false;

    const email = userRes.rows[0].email;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'SaveHub: Meeting may have been missed',
      text: 'It looks like a meeting may have been missed. We\'re here to help you recover quickly. Please confirm if you joined the meeting or if we can help with next steps.'
    });

    console.log(`[ESCALATION] Email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`[ESCALATION] Email failed: ${err.message}`);
    return false;
  }
}

/**
 * Send escalation SMS/WhatsApp
 * @private
 */
async function sendEscalationSMS(userId, incidentId) {
  try {
    console.log(`[ESCALATION] SMS step for user ${userId} (mock implementation)`);
    // Real implementation would integrate with Twilio/Exotel WhatsApp API
    return true;
  } catch (err) {
    console.error(`[ESCALATION] SMS failed: ${err.message}`);
    return false;
  }
}

/**
 * Send escalation call
 * @private
 */
async function sendEscalationCall(userId, incidentId) {
  try {
    const userRes = await pool.query('SELECT phone FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length || !userRes.rows[0].phone) {
      console.warn(`[ESCALATION] No phone number for user ${userId}`);
      return false;
    }

    const phone = userRes.rows[0].phone;

    const result = await autoCallService.makeCall({
      to: phone,
      message: 'This is SaveHub checking in. A meeting may have been missed. Please take action to avoid consequences.',
      context: {
        incidentId,
        userId,
        escalationType: 'missed_meeting'
      }
    });

    console.log(`[ESCALATION] Call initiated: ${result.callId}`);
    return true;
  } catch (err) {
    console.error(`[ESCALATION] Call failed: ${err.message}`);
    return false;
  }
}

// Legacy function for backward compatibility
async function startEscalation(incident) {
  console.log(`🚨 INCIDENT CREATED: ${incident.type}`);
  return incident;
}

module.exports = {
  startEscalation,
  detectAndCreateMissedIncidents,
  executeEscalationSteps,
  GRACE_PERIOD_MINUTES
};

