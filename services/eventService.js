/**
 * Event Service
 * 
 * Generalized event creation and retrieval.
 * Supports multiple categories and sources.
 * Events are FACTS only - no incident logic.
 * 
 * Categories: MEETING, FINANCE, HEALTH, DELIVERY, SECURITY, OTHER
 * Sources: CALENDAR, EMAIL, API, MANUAL, WEBHOOK
 */

const pool = require('../db');
const { v4: uuid } = require('uuid');

/**
 * Valid event sources
 */
const EVENT_SOURCES = {
  CALENDAR: 'CALENDAR',
  EMAIL: 'EMAIL',
  API: 'API',
  MANUAL: 'MANUAL',
  WEBHOOK: 'WEBHOOK'
};

/**
 * Valid event categories
 */
const EVENT_CATEGORIES = {
  MEETING: 'MEETING',
  FINANCE: 'FINANCE',
  HEALTH: 'HEALTH',
  DELIVERY: 'DELIVERY',
  SECURITY: 'SECURITY',
  OTHER: 'OTHER'
};

/**
 * Create a new event
 * 
 * @param {object} options
 * @param {string} options.userId - User UUID
 * @param {string} options.source - Event source (CALENDAR, EMAIL, API, MANUAL, WEBHOOK)
 * @param {string} options.category - Event category (MEETING, FINANCE, HEALTH, etc)
 * @param {string} options.type - Event type (e.g., MEETING_SCHEDULED, PAYMENT_FAILED)
 * @param {object} options.payload - Event data (JSON)
 * @param {Date} options.occurredAt - When event occurred
 * @returns {object} Created event
 * @throws {Error} If validation fails
 */
async function createEvent(options) {
  const {
    userId,
    source,
    category,
    type,
    payload = {},
    occurredAt = new Date()
  } = options;

  try {
    // Validation
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!source || !EVENT_SOURCES[source]) {
      throw new Error(`Invalid source. Must be one of: ${Object.keys(EVENT_SOURCES).join(', ')}`);
    }

    if (!category || !EVENT_CATEGORIES[category]) {
      throw new Error(`Invalid category. Must be one of: ${Object.keys(EVENT_CATEGORIES).join(', ')}`);
    }

    if (!type || typeof type !== 'string' || !type.trim()) {
      throw new Error('Event type is required and must be a non-empty string');
    }

    if (!occurredAt || !(occurredAt instanceof Date)) {
      throw new Error('occurredAt must be a valid Date');
    }

    // Insert event
    const result = await pool.query(
      `INSERT INTO events (
        id, user_id, source, category, type, payload, occurred_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        uuid(),
        userId,
        source,
        category,
        type,
        JSON.stringify(payload),
        occurredAt,
        new Date(),
        new Date()
      ]
    );

    const event = result.rows[0];
    
    // Parse payload back to object
    event.payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

    console.log(`[EVENT] Created: ${category}/${type} for user ${userId}`);
    return event;
  } catch (err) {
    console.error('[EVENT] Creation failed:', err.message);
    throw err;
  }
}

/**
 * Get event by ID
 * 
 * @param {string} eventId - Event UUID
 * @returns {object|null} Event or null if not found
 */
async function getEventById(eventId) {
  try {
    const result = await pool.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const event = result.rows[0];
    event.payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    return event;
  } catch (err) {
    console.error('[EVENT] Get by ID failed:', err.message);
    throw err;
  }
}

/**
 * Get upcoming events by category and user
 * 
 * Useful for fetching calendar events, scheduled deliveries, etc.
 * 
 * @param {string} userId - User UUID
 * @param {string} category - Event category (MEETING, FINANCE, etc)
 * @param {object} options
 * @param {Date} options.after - Get events after this time
 * @param {Date} options.before - Get events before this time
 * @param {number} options.limit - Max results (default 100)
 * @returns {array} Array of events
 */
async function getUpcomingEventsByCategory(userId, category, options = {}) {
  const {
    after = new Date(),
    before = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    limit = 100
  } = options;

  try {
    // Validation
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!category || !EVENT_CATEGORIES[category]) {
      throw new Error(`Invalid category. Must be one of: ${Object.keys(EVENT_CATEGORIES).join(', ')}`);
    }

    // Query
    const result = await pool.query(
      `SELECT * FROM events
       WHERE user_id = $1
         AND category = $2
         AND occurred_at >= $3
         AND occurred_at <= $4
       ORDER BY occurred_at ASC
       LIMIT $5`,
      [userId, category, after, before, limit]
    );

    // Parse payloads
    const events = result.rows.map(event => ({
      ...event,
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
    }));

    return events;
  } catch (err) {
    console.error('[EVENT] Get upcoming failed:', err.message);
    throw err;
  }
}

/**
 * Get recent events by category and user
 * 
 * Useful for auditing, checking history, etc.
 * 
 * @param {string} userId - User UUID
 * @param {string} category - Event category
 * @param {object} options
 * @param {number} options.limit - Max results (default 50)
 * @param {number} options.offset - Pagination offset (default 0)
 * @returns {array} Array of events
 */
async function getRecentEventsByCategory(userId, category, options = {}) {
  const {
    limit = 50,
    offset = 0
  } = options;

  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!category || !EVENT_CATEGORIES[category]) {
      throw new Error(`Invalid category. Must be one of: ${Object.keys(EVENT_CATEGORIES).join(', ')}`);
    }

    const result = await pool.query(
      `SELECT * FROM events
       WHERE user_id = $1
         AND category = $2
       ORDER BY occurred_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, category, limit, offset]
    );

    const events = result.rows.map(event => ({
      ...event,
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
    }));

    return events;
  } catch (err) {
    console.error('[EVENT] Get recent failed:', err.message);
    throw err;
  }
}

/**
 * Get all event types that exist for a user
 * 
 * Useful for admin dashboards and introspection
 * 
 * @param {string} userId - User UUID
 * @returns {array} Array of {category, type, count}
 */
async function getEventTypeStats(userId) {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    const result = await pool.query(
      `SELECT category, type, COUNT(*) as count
       FROM events
       WHERE user_id = $1
       GROUP BY category, type
       ORDER BY category, type`,
      [userId]
    );

    return result.rows;
  } catch (err) {
    console.error('[EVENT] Get stats failed:', err.message);
    throw err;
  }
}

module.exports = {
  // Constants
  EVENT_SOURCES,
  EVENT_CATEGORIES,

  // Service methods
  createEvent,
  getEventById,
  getUpcomingEventsByCategory,
  getRecentEventsByCategory,
  getEventTypeStats
};
