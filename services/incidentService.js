const pool = require('../db');
const { v4: uuid } = require('uuid');
const { validateTransition } = require('./incidentStateHelper');
const escalationScheduler = require('./escalationScheduler');
const rules = require('../rules/rules');

/**
 * Create a new incident from an event
 * 
 * @param {object} event - Event object
 * @returns {object|null} Created incident or null if no rule matched
 */
async function evaluateEvent(event) {
  try {
    // Find matching rule
    const rule = rules.find(r => r.match.test(event.text));
    if (!rule) return null;

    const incidentId = uuid();
    
    // Insert into database with initial OPEN state
    const result = await pool.query(
      `INSERT INTO incidents (
        id, category, type, severity, consequence, state, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        incidentId,
        rule.incident.category,
        rule.incident.type,
        rule.incident.severity,
        rule.incident.consequence,
        'OPEN',
        new Date()
      ]
    );

    const incident = result.rows[0];

    // Don't automatically start escalation here
    // User must explicitly transition to ESCALATING state
    return incident;
  } catch (err) {
    console.error('Error evaluating event:', err);
    throw err;
  }
}

/**
 * Get an incident by ID
 * 
 * @param {string} id - Incident UUID
 * @returns {object|null} Incident object or null if not found
 */
async function getIncidentById(id) {
  try {
    const result = await pool.query(
      'SELECT * FROM incidents WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Error fetching incident:', err);
    throw err;
  }
}

/**
 * Transition an incident to a new state
 * 
 * Enforces state machine rules and validates transitions.
 * Production-grade with audit logging.
 * 
 * @param {string} incidentId - Incident UUID
 * @param {string} toState - Target state
 * @param {string} resolutionNote - Optional resolution note (required for RESOLVED)
 * @returns {object} Updated incident
 * @throws {Error} If transition is invalid or incident not found
 */
async function transitionIncidentState(incidentId, toState, resolutionNote = null) {
  try {
    // Fetch current incident
    const incident = await getIncidentById(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const currentState = incident.state;

    // Validate transition
    validateTransition(currentState, toState);

    // Build query based on target state
    let query;
    let params;

    if (toState === 'RESOLVED') {
      if (!resolutionNote) {
        throw new Error('Resolution note is required when resolving an incident');
      }
      query = `UPDATE incidents 
               SET state = $1, resolved_at = $2, resolution_note = $3
               WHERE id = $4 
               RETURNING *`;
      params = [toState, new Date(), resolutionNote, incidentId];
    } else if (toState === 'CANCELLED') {
      // For cancelled, store reason in resolution_note
      if (resolutionNote) {
        query = `UPDATE incidents 
                 SET state = $1, resolution_note = $2
                 WHERE id = $3 
                 RETURNING *`;
        params = [toState, resolutionNote, incidentId];
      } else {
        query = `UPDATE incidents 
                 SET state = $1
                 WHERE id = $2 
                 RETURNING *`;
        params = [toState, incidentId];
      }
    } else {
      // For other states (ACKNOWLEDGED, ESCALATING)
      query = `UPDATE incidents 
               SET state = $1
               WHERE id = $2 
               RETURNING *`;
      params = [toState, incidentId];
    }

    // Execute update
    const result = await pool.query(query, params);
    if (!result.rows[0]) {
      throw new Error('Failed to update incident');
    }

    const updatedIncident = result.rows[0];

    // Audit log
    console.log(
      `[AUDIT] Incident ${incidentId} transitioned: ${currentState} → ${toState}`
    );

    // Phase 3: Handle escalation side-effects
    try {
      if (toState === 'ESCALATING') {
        // When entering ESCALATING, schedule first escalation job
        await escalationScheduler.scheduleEscalation(incidentId);
      } else if (toState === 'RESOLVED' || toState === 'CANCELLED') {
        // When leaving ESCALATING (to RESOLVED or CANCELLED), cancel all pending escalations
        await escalationScheduler.cancelPendingEscalations(incidentId);
      }
    } catch (escalationErr) {
      // Don't fail the state transition if escalation scheduler has issues
      // Log the error but continue - DB state change is what matters
      console.error(`[ESCALATION] Error handling escalation for state change:`, escalationErr.message);
    }

    return updatedIncident;
  } catch (err) {
    console.error('Error transitioning incident:', err);
    throw err;
  }
}

/**
 * Get all incidents with optional filtering and pagination
 * 
 * @param {object} filters - Optional filters {state, limit, offset}
 * @returns {array} Array of incidents
 */
async function getIncidents(filters = {}) {
  try {
    let query = 'SELECT * FROM incidents';
    const params = [];

    if (filters.state) {
      query += ` WHERE state = $${params.length + 1}`;
      params.push(filters.state);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Error fetching incidents:', err);
    throw err;
  }
}

/**
 * Create a new incident directly from parameters
 * 
 * This is called by the RuleEngine to create incidents based on rules.
 * Sets initial state to OPEN, does NOT escalate.
 * 
 * @param {object} options
 * @param {string} options.userId - User UUID
 * @param {string} options.eventId - Event UUID (can reference source event)
 * @param {string} options.category - Incident category
 * @param {string} options.type - Incident type
 * @param {string} options.severity - Incident severity (LOW, MEDIUM, HIGH, CRITICAL)
 * @param {string} options.consequence - Impact consequence
 * @returns {object} Created incident
 * @throws {Error} If validation fails
 */
async function createIncident(options) {
  try {
    const {
      userId,
      eventId,
      category,
      type,
      severity,
      consequence
    } = options;

    // Validation
    if (!userId) throw new Error('userId is required');
    if (!category) throw new Error('category is required');
    if (!type) throw new Error('type is required');
    if (!severity) throw new Error('severity is required');
    if (!consequence) throw new Error('consequence is required');

    const incidentId = uuid();

    // Insert incident with initial OPEN state
    const result = await pool.query(
      `INSERT INTO incidents (
        id, user_id, event_id, category, type, severity, consequence, 
        state, created_at, escalation_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        incidentId,
        userId,
        eventId || null,
        category,
        type,
        severity,
        consequence,
        'OPEN', // Initial state
        new Date(),
        0 // No escalations yet
      ]
    );

    const incident = result.rows[0];
    console.log(`[INCIDENT] Created: ${incident.id} (${category}/${type}, severity=${severity})`);

    return incident;
  } catch (err) {
    console.error('[INCIDENT] Creation failed:', err.message);
    throw err;
  } 
}

module.exports = {
  evaluateEvent,
  getIncidentById,
  transitionIncidentState,
  getIncidents,
  createIncident
};
