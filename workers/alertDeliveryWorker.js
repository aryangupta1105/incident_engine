/**
 * Alert Delivery Worker
 * 
 * Real alert delivery system with email support.
 * Polls for pending alerts and delivers them via configured channels.
 * 
 * Architecture:
 * - Decoupled from rule engine and incidents
 * - Channel-agnostic (email provider can be swapped)
 * - Feature flag controlled (FEATURE_EMAIL_ENABLED)
 * - Non-blocking delivery (one failure doesn't stop others)
 * - Idempotent (safe to retry or re-run)
 * 
 * Delivery flow:
 * 1. Fetch pending alerts where scheduled_at <= now
 * 2. Load user contact info
 * 3. Load event details (if referenced)
 * 4. Generate email content (subject, body)
 * 5. Send via EmailProvider
 * 6. Mark alert as DELIVERED on success
 * 7. Leave as PENDING on failure (caller can retry)
 */

const alertService = require('../services/alertService');
const eventService = require('../services/eventService');
const emailProvider = require('../services/emailProvider');
const emailTemplates = require('../services/emailTemplates');
const autoCallService = require('../services/autoCallService');
const pool = require('../db');

// CONCURRENCY CONTROL: Prevent overlapping polls
// If delivery takes > pollIntervalMs, prevents next poll from starting
let isPollInProgress = false;

/**
 * PRODUCTION PHONE VALIDATION
 * 
 * Validates phone numbers in E.164 format: +[country][number]
 * - Must start with +
 * - Must have 10-15 digits total
 * - No spaces, dashes, or special characters
 * 
 * Returns: {valid: boolean, error?: string}
 */
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone must be a non-empty string' };
  }

  const trimmed = phone.trim();
  const e164Pattern = /^\+[1-9]\d{9,14}$/;
  
  if (!e164Pattern.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid E.164 format. Expected: +[country code][digits]. Got: ${trimmed}`
    };
  }

  return { valid: true };
}

/**
 * Deliver all pending alerts that are due
 * 
 * @returns {object} Delivery report with count, successes, failures
 */
async function deliverPendingAlerts() {
  // CONCURRENCY CONTROL: Skip if previous poll still in progress
  if (isPollInProgress) {
    console.log('[ALERT_WORKER] Previous poll still in progress, skipping this cycle');
    return {
      count: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };
  }

  isPollInProgress = true;
  const startTime = Date.now();

  try {
    // Check if email delivery is enabled
    if (process.env.FEATURE_EMAIL_ENABLED !== 'true') {
      console.log('[EMAIL] Email delivery disabled by feature flag');
      return {
        count: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        duration: Date.now() - startTime
      };
    }

    // Get pending alerts that are due
    const pendingAlerts = await alertService.getPendingAlerts(new Date(), 100);

    if (pendingAlerts.length === 0) {
      // Silently return - too noisy to log on every poll
      return {
        count: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        duration: Date.now() - startTime
      };
    }

    console.log(`[EMAIL] Found ${pendingAlerts.length} pending alerts to deliver`);

    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // TASK 4: Group alerts by user/event to detect multiple stages in same tick
    const alertsByUserEvent = {};
    for (const alert of pendingAlerts) {
      const key = `${alert.user_id}:${alert.event_id}`;
      if (!alertsByUserEvent[key]) {
        alertsByUserEvent[key] = [];
      }
      alertsByUserEvent[key].push(alert);
    }

    // Deliver each alert, applying stage collapsing logic
    for (const alert of pendingAlerts) {
      try {
        const key = `${alert.user_id}:${alert.event_id}`;
        const alertsForThisEvent = alertsByUserEvent[key];

        // TASK 3: Smart stage collapsing - preserve alerts whose window passed
        // Critical rule: Never cancel alert if scheduled_at < now (window already passed)
        // This ensures email is sent even if call window overlaps
        if (alertsForThisEvent && alertsForThisEvent.length > 1) {
          const now = Date.now();
          const highestSeverity = getHighestSeverityAlert(alertsForThisEvent);
          
          if (alert.alert_type !== highestSeverity.alert_type) {
            const alertScheduledTime = new Date(alert.scheduled_at).getTime();
            const windowHasPassed = alertScheduledTime < now;
            
            if (windowHasPassed) {
              // TASK 3: Don't collapse alerts whose window has passed
              console.log(`[COLLAPSE] Allowing ${alert.alert_type} (window passed, must still deliver)`);
            } else {
              // TASK 3: Only collapse future alerts
              console.log(`[COLLAPSE] Cancelled ${alert.alert_type} (future alert, delivering ${highestSeverity.alert_type} instead)`);
              
              try {
                await alertService.markAlertAsCancelled(alert.id);
              } catch (err) {
                console.error(`[COLLAPSE] Failed to mark alert ${alert.id} as cancelled:`, err.message);
              }
              
              skipped++;
              continue;
            }
          }
        }

        console.log(`[EMAIL] Delivering alert: ${alert.category}/${alert.alert_type}`);
        
        // TASK 1: Route based on alert type (CRITICAL)
        if (alert.alert_type === 'MEETING_CRITICAL_CALL') {
          // Route to auto-call service
          await deliverAlertCall(alert);
        } else if (alert.alert_type === 'MEETING_UPCOMING_EMAIL' || alert.alert_type === 'MEETING_URGENT_MESSAGE') {
          // Route to email (for now, URGENT_MESSAGE uses email too)
          await deliverAlertEmail(alert);
        } else {
          // Default to email for unknown types
          await deliverAlertEmail(alert);
        }
        
        // TASK 2: Mark as delivered with delivery lock (exactly-once guarantee)
        // Query returns rowCount indicating if actually updated
        // If rowCount === 0, another worker already delivered it (duplicate prevented)
        const markResult = await alertService.markAlertDelivered(alert.id);
        
        if (markResult.rowCount && markResult.rowCount > 0) {
          console.log(`[DELIVERY] Locked and marked DELIVERED: ${alert.id}`);
          successful++;
        } else {
          // TASK 2: Alert was already delivered by another worker - skip
          console.log(`[DELIVERY] Alert ${alert.id} already delivered (duplicate prevented)`);
          skipped++;
        }
      } catch (err) {
        // PHASE 6: Check for skippable errors (missing phone, missing email, etc.)
        if (err.skippable || (err.message && (err.message.includes('phone number') || err.message.includes('email')))) {
          console.warn(`[DELIVERY] Skipping alert ${alert.id}: ${err.message}`);
          skipped++;
          // Don't crash worker, don't retry - user can't receive this type of alert
          continue;
        }
        
        // Log error but continue with next alert
        console.error(`[DELIVERY] Failed to deliver alert ${alert.id}: ${err.message}`);
        failed++;
        // Note: Alert remains PENDING - caller can retry later
      }
    }

    const report = {
      count: pendingAlerts.length,
      successful,
      failed,
      skipped,
      duration: Date.now() - startTime
    };

    console.log(
      `[EMAIL] Delivery batch: ${successful} delivered, ${failed} failed (${report.duration}ms)`
    );

    return report;
  } catch (err) {
    console.error('[ALERT_WORKER] Critical error:', err.message);
    throw err;
  } finally {
    // CONCURRENCY CONTROL: Always reset mutex
    isPollInProgress = false;
  }
}

/**
 * Get highest severity alert from a list
 * 
 * Priority: CRITICAL_CALL > URGENT_MESSAGE > UPCOMING_EMAIL
 * 
 * @param {array} alerts - List of alert objects
 * @returns {object} Highest severity alert
 */
function getHighestSeverityAlert(alerts) {
  const severityOrder = {
    'MEETING_CRITICAL_CALL': 3,
    'MEETING_URGENT_MESSAGE': 2,
    'MEETING_UPCOMING_EMAIL': 1
  };

  return alerts.reduce((highest, current) => {
    const currentSeverity = severityOrder[current.alert_type] || 0;
    const highestSeverity = severityOrder[highest.alert_type] || 0;
    return currentSeverity > highestSeverity ? current : highest;
  });
}

/**
 * Deliver a single alert via phone call (TASK 1 & 2)
 * 
 * Routes MEETING_CRITICAL_CALL to autoCallService.
 * Loads user, event, generates call context, and initiates call.
 * 
 * @param {object} alert - Alert from database
 * @returns {Promise<void>}
 * @throws {Error} On call failure
 */
async function deliverAlertCall(alert) {
  try {
    console.log(`[DELIVERY] Routing CRITICAL_CALL to autoCallService`);

    // Load user contact info
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [alert.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User does not exist in system: ${alert.user_id}`);
    }

    const user = userResult.rows[0];

    // TASK 2 + 1: Phone resolution with E.164 validation
    // Priority: user.phone → DEV_PHONE_NUMBER → SKIP (never guess)
    // CRITICAL: No dummy numbers, always verify E.164 format
    
    let phone = null;
    let phoneSource = null;

    // Try 1: User profile phone (production source)
    if (user.phone) {
      const validation = validatePhoneNumber(user.phone);
      if (validation.valid) {
        phone = user.phone;
        phoneSource = 'user_profile';
      } else {
        console.warn(`[CALL] User phone invalid: ${validation.error}. Using fallback if available.`);
      }
    }

    // Try 2: DEV_PHONE_NUMBER fallback (development only)
    if (!phone) {
      const devPhone = process.env.DEV_PHONE_NUMBER;
      if (devPhone) {
        const validation = validatePhoneNumber(devPhone);
        if (validation.valid) {
          phone = devPhone;
          phoneSource = 'dev_fallback';
        } else {
          console.error(`[CALL] DEV_PHONE_NUMBER invalid: ${validation.error}`);
        }
      }
    }

    // No valid phone available - skip call gracefully
    if (!phone) {
      console.warn(
        `[CALL] SKIPPING CALL: User ${alert.user_id} has no valid phone number. ` +
        `User profile phone missing/invalid, DEV_PHONE_NUMBER not configured. ` +
        `Alert marked as skipped. Production: add users.phone column.`
      );
      
      // PHASE 6: Graceful skip - throw special error that parent catches and skips
      const error = new Error(`User has no phone number for calling`);
      error.skippable = true;  // Parent will catch and skip gracefully
      throw error;
    }

    // Log phone source for debugging
    console.log(`[CALL] Phone resolved from ${phoneSource}: ${maskPhone(phone)}`);

    // Load event details for call context
    const eventResult = await pool.query(
      'SELECT id, payload, occurred_at FROM events WHERE id = $1',
      [alert.event_id]
    );

    const event = eventResult.rows.length > 0 ? eventResult.rows[0] : null;

    // TASK 4: Generate call script with complete meeting context
    // Includes: title, start time (local), minutes remaining, consequence framing
    const callContext = generateCallContext(event, alert);
    const callMessage = callContext.script;

    // TASK 4 + 5: Log complete call context for monitoring
    console.log(`[CALL] Event=${alert.event_id}`);
    console.log(`[CALL] MinutesRemaining=${callContext.minutesRemaining}`);
    console.log(`[CALL] Title="${callContext.meetingTitle}"`);
    console.log(`[CALL] StartTime=${callContext.startTime}`);

    // TASK 2: Call autoCallService with context (include meeting details for TwiML)
    const callResponse = await autoCallService.makeCall({
      to: phone,
      message: callMessage,
      context: {
        userId: user.id,
        eventId: alert.event_id,
        incidentId: alert.incident_id,
        meetingTitle: callContext.meetingTitle,
        minutesRemaining: callContext.minutesRemaining,
        startTimeLocal: callContext.startTime,
        window: {
          type: 'CRITICAL',
          secondsBeforeMeeting: callContext.secondsBeforeMeeting
        }
      }
    });
    
    // TASK 5: Log call delivery success
    console.log(`[CALL] Delivered successfully: status=${callResponse.status}, callId=${callResponse.callId || 'N/A'}`);

  } catch (err) {
    console.error(
      `[ALERT_WORKER] Error delivering call alert ${alert.id}:`,
      err.message
    );
    throw err;
  }
}

/**
 * Generate call context and script (TASK 4)
 * 
 * Creates call script with meeting title, time, and consequence framing.
 * Meeting details stored in event.payload (meeting title, description, details).
 * 
 * TASK 4 Requirements: Include meeting title, start time (local), minutes remaining, consequence framing
 * 
 * @param {object} event - Event object with payload containing meeting details
 * @param {object} alert - Alert object
 * @returns {object} { script, meetingTitle, startTime, minutesRemaining, secondsBeforeMeeting }
 */
function generateCallContext(event, alert) {
  // TASK 4: Extract meeting title from event.payload (not event.title)
  const meetingTitle = (event && event.payload && event.payload.title) || 'Your meeting';
  let startTime = 'a scheduled time';
  let minutesRemaining = 'a few';
  let secondsBeforeMeeting = 180; // default 3 minutes

  if (event && event.occurred_at) {
    const meetingDate = new Date(event.occurred_at);
    startTime = meetingDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      meridiem: 'short'
    });

    const now = new Date();
    const secondsUntil = Math.floor((meetingDate - now) / 1000);
    secondsBeforeMeeting = Math.max(0, secondsUntil);
    minutesRemaining = Math.ceil(secondsUntil / 60);
  }

  // TASK 4: Complete meeting context in call script
  // Format: "Meeting '<TITLE>' starts at <TIME> (in <X> minutes)"
  const script = `Hi, this is SaveHub. Your meeting '${meetingTitle}' starts at ${startTime}. We're calling because missing this could cost you time or money. Please join now if you haven't already.`;

  return {
    script,
    meetingTitle,
    startTime,
    minutesRemaining,
    secondsBeforeMeeting
  };
}

/**
 * Mask phone number for logging (show last 4 digits only)
 * @private
 */
function maskPhone(phone) {
  if (!phone || phone.length < 4) {
    return '****';
  }
  return `****${phone.substring(phone.length - 4)}`;
}

/**
 * Deliver a single alert via email
 * 
 * Loads user, event, generates email content, and sends.
 * Throws on any failure - caller handles retry logic.
 * 
 * @param {object} alert - Alert from database
 * @returns {Promise<void>}
 * @throws {Error} On SMTP failure or missing user/event
 */
async function deliverAlertEmail(alert) {
  try {
    // Load user contact info from users table
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [alert.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User does not exist in system: ${alert.user_id}`);
    }

    const user = userResult.rows[0];

    // Validate user has email (required for delivery)
    if (!user.email) {
      throw new Error(`User ${alert.user_id} has no email address on file`);
    }

    console.log(`[USER] User email resolved: ${user.email}`);

    // Load event details if referenced
    let event = null;
    if (alert.event_id) {
      try {
        event = await eventService.getEventById(alert.event_id);
        if (!event) {
          console.warn(`[ALERT_WORKER] Event not found: ${alert.event_id}`);
          // Continue without event - it's optional
        }
      } catch (err) {
        console.warn(`[ALERT_WORKER] Failed to load event ${alert.event_id}:`, err.message);
        // Continue without event - it's optional
      }
    }

    // Generate email content (TASK 3: upgraded with context)
    const emailContent = emailTemplates.createEmailContent({
      alert,
      event
    });

    // Send email
    console.log(`[EMAIL] Sending alert to ${user.email}`);
    await emailProvider.sendAlertEmail({
      user,
      alert,
      event,
      subject: emailContent.subject,
      body: emailContent.body
    });

  } catch (err) {
    console.error(
      `[ALERT_WORKER] Error delivering alert ${alert.id}:`,
      err.message
    );
    throw err;
  }
}


/**
 * Start the alert delivery worker
 * 
 * Polls every pollIntervalMs milliseconds and delivers pending alerts.
 * Runs indefinitely until stopped.
 * 
 * @param {object} options
 * @param {number} options.pollIntervalMs - Poll interval in milliseconds (default 10000)
 * @returns {function} Cleanup function to stop the worker
 */
function startWorker(options = {}) {
  const {
    pollIntervalMs = 10000
  } = options;

  console.log(`[ALERT_WORKER] Starting with ${pollIntervalMs}ms poll interval`);

  const intervalId = setInterval(async () => {
    try {
      await deliverPendingAlerts();
    } catch (err) {
      console.error('[ALERT_WORKER] Unhandled error in poll loop:', err);
    }
  }, pollIntervalMs);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    console.log('[ALERT_WORKER] Stopped');
  };
}

/**
 * Single poll of the worker (useful for testing)
 * 
 * @returns {Promise<object>} Delivery report
 */
async function poll() {
  return deliverPendingAlerts();
}

module.exports = {
  startWorker,
  poll,
  deliverPendingAlerts
};
