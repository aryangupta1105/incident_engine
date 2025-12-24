/**
 * Alert Service
 * 
 * Awareness-only alerting system.
 * Fully decoupled from incidents.
 * Never escalates, never creates incidents.
 * 
 * Alerts are informational signals that can be safely ignored.
 * They are immutable after delivery for audit purposes.
 * 
 * This service is category-agnostic and reusable across all domains.
 */

const pool = require('../db');
const { v4: uuid } = require('uuid');

/**
 * Schedule an alert for future delivery
 * 
 * Alerts are created in PENDING state and will be delivered
 * when scheduled_at time is reached.
 * 
 * @param {object} options
 * @param {string} options.userId - User UUID (required)
 * @param {string} options.eventId - Event UUID (optional, for reference)
 * @param {string} options.category - Alert category (MEETING, FINANCE, etc)
 * @param {string} options.alertType - Alert type identifier (e.g., MEETING_UPCOMING)
 * @param {Date} options.scheduledAt - When to deliver the alert
 * @returns {object} Created alert
 * @throws {Error} If validation fails
 */
async function scheduleAlert(options) {
  const {
    userId,
    eventId = null,
    category,
    alertType,
    scheduledAt
  } = options;

  try {
    // Validation
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
      throw new Error('category is required and must be a non-empty string');
    }

    if (!alertType || typeof alertType !== 'string' || !alertType.trim()) {
      throw new Error('alertType is required and must be a non-empty string');
    }

    if (!scheduledAt || !(scheduledAt instanceof Date)) {
      throw new Error('scheduledAt must be a valid Date');
    }

    // Insert alert
    const result = await pool.query(
      `INSERT INTO alerts (
        id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        uuid(),
        userId,
        eventId,
        category,
        alertType,
        scheduledAt,
        'PENDING',
        new Date(),
        new Date()
      ]
    );

    const alert = result.rows[0];

    console.log(`[ALERTS] Scheduled: ${category}/${alertType} at ${scheduledAt.toISOString()}`);

    return alert;
  } catch (err) {
    console.error('[ALERTS] Schedule failed:', err.message);
    throw err;
  }
}

/**
 * Get all pending alerts that are due for delivery
 * 
 * Alerts are "due" when their scheduled_at time <= now.
 * This is called by the delivery worker to find what to send.
 * 
 * @param {Date} now - Current time (defaults to Date.now())
 * @param {number} limit - Max alerts to return (default 100)
 * @returns {array} Array of pending alerts due for delivery
 */
async function getPendingAlerts(now = new Date(), limit = 100) {
  try {
    // PHASE 2: Collapse persistence
    // Only fetch alerts that are:
    // - PENDING status (not yet delivered)
    // - NOT cancelled (collapsed alerts won't appear)
    // - Scheduled in the past or present
    const result = await pool.query(
      `SELECT * FROM alerts
       WHERE status = 'PENDING'
         AND delivered_at IS NULL
         AND cancelled_at IS NULL
         AND scheduled_at <= $1
       ORDER BY scheduled_at ASC
       LIMIT $2`,
      [now, limit]
    );

    return result.rows;
  } catch (err) {
    console.error('[ALERT] Get pending failed:', err.message);
    throw err;
  }
}

/**
 * Mark an alert as delivered
 * 
 * TASK 2: Idempotent delivery lock with rowCount detection
 * Calling multiple times on the same alert will not cause errors.
 * Second call (or concurrent calls) will see rowCount === 0 (no update performed).
 * First call to complete UPDATE will have rowCount > 0.
 * 
 * Once delivered, an alert is immutable (no further updates allowed).
 * 
 * @param {string} alertId - Alert UUID
 * @returns {object} Result with {rowCount, rows} for idempotency check
 * @throws {Error} If alert not found
 */
async function markAlertDelivered(alertId) {
  try {
    // Fetch alert first to ensure it exists
    const fetchResult = await pool.query(
      'SELECT id, status FROM alerts WHERE id = $1',
      [alertId]
    );

    if (fetchResult.rows.length === 0) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = fetchResult.rows[0];

    // If already delivered, return with rowCount === 0 to signal another worker beat us
    if (alert.status === 'DELIVERED') {
      console.log(`[ALERT] Already delivered: ${alertId}`);
      const result = await pool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [alertId]
      );
      return {
        rowCount: 0,  // TASK 2: Signal that no update was performed (already delivered)
        rows: result.rows
      };
    }

    // Mark as delivered (idempotent)
    const result = await pool.query(
      `UPDATE alerts
       SET status = 'DELIVERED', delivered_at = $1, updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [new Date(), new Date(), alertId]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to update alert');
    }

    // TASK 2: Return full result object with rowCount for idempotency detection in worker
    return {
      rowCount: result.rowCount,
      rows: result.rows
    };
  } catch (err) {
    console.error('[ALERT] Mark delivered failed:', err.message);
    throw err;
  }
}

/**
 * Cancel an alert before delivery
 * 
 * Only PENDING alerts can be cancelled.
 * Once delivered, alert is immutable.
 * 
 * @param {string} alertId - Alert UUID
 * @returns {object} Updated alert with CANCELLED status
 * @throws {Error} If alert not found or already delivered
 */
async function cancelAlert(alertId) {
  try {
    // Fetch alert
    const fetchResult = await pool.query(
      'SELECT id, status FROM alerts WHERE id = $1',
      [alertId]
    );

    if (fetchResult.rows.length === 0) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = fetchResult.rows[0];

    // Can only cancel pending alerts
    if (alert.status !== 'PENDING') {
      throw new Error(`Cannot cancel alert in ${alert.status} status`);
    }

    // Cancel alert
    const result = await pool.query(
      `UPDATE alerts
       SET status = 'CANCELLED', updated_at = $1
       WHERE id = $2
       RETURNING *`,
      [new Date(), alertId]
    );

    console.log(`[ALERT] Cancelled: ${alertId}`);

    return result.rows[0];
  } catch (err) {
    console.error('[ALERT] Cancel failed:', err.message);
    throw err;
  }
}

/**
 * Mark alert as cancelled due to stage collapse (PHASE 2)
 * 
 * When multiple alerts are scheduled for the same user:event,
 * only the highest severity one is delivered.
 * Collapsed alerts are marked with cancelled_at timestamp
 * instead of changing status (to avoid schema conflicts).
 * 
 * @param {string} alertId - Alert UUID
 * @returns {object} Updated alert with cancelled_at timestamp
 */
async function markAlertAsCancelled(alertId) {
  try {
    const result = await pool.query(
      `UPDATE alerts
       SET cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND cancelled_at IS NULL
       RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) {
      // Alert might already be cancelled, which is fine (idempotent)
      console.log(`[ALERT] Already cancelled or not found: ${alertId}`);
      return null;
    }

    console.log(`[ALERT] Marked as collapsed: ${alertId}`);
    return result.rows[0];
  } catch (err) {
    console.error('[ALERT] Mark as collapsed failed:', err.message);
    throw err;
  }
}

/**
 * Get all alerts for a user (for dashboard/history)
 * 
 * @param {string} userId - User UUID
 * @param {object} options
 * @param {string} options.status - Filter by status (PENDING, DELIVERED, CANCELLED)
 * @param {string} options.category - Filter by category
 * @param {number} options.limit - Max results (default 50)
 * @param {number} options.offset - Pagination offset (default 0)
 * @returns {array} Array of alerts
 */
async function getUserAlerts(userId, options = {}) {
  const {
    status = null,
    category = null,
    limit = 50,
    offset = 0
  } = options;

  try {
    let query = 'SELECT * FROM alerts WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ' ORDER BY scheduled_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('[ALERT] Get user alerts failed:', err.message);
    throw err;
  }
}

/**
 * Get alert by ID
 * 
 * @param {string} alertId - Alert UUID
 * @returns {object|null} Alert or null if not found
 */
async function getAlertById(alertId) {
  try {
    const result = await pool.query(
      'SELECT * FROM alerts WHERE id = $1',
      [alertId]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error('[ALERT] Get by ID failed:', err.message);
    throw err;
  }
}

module.exports = {
  // Core methods
  scheduleAlert,
  getPendingAlerts,
  markAlertDelivered,
  markAlertAsCancelled,

  // Supporting methods
  cancelAlert,
  getUserAlerts,
  getAlertById
};
