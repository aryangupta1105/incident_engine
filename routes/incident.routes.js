const express = require('express');
const router = express.Router();
const { getIncidentById, transitionIncidentState, getIncidents } = require('../services/incidentService');
const { INCIDENT_STATES } = require('../services/incidentStateHelper');

/**
 * POST /incidents/:id/acknowledge
 * 
 * Acknowledge an incident (transition from OPEN to ACKNOWLEDGED).
 * 
 * Response: 200 (success) or 409 (invalid transition)
 */
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).json({
        error: 'Not found',
        details: `Incident ${id} not found`
      });
    }

    const updatedIncident = await transitionIncidentState(id, INCIDENT_STATES.ACKNOWLEDGED);

    res.status(200).json({
      success: true,
      incident: updatedIncident,
      message: 'Incident acknowledged successfully'
    });
  } catch (err) {
    if (err.message.includes('Invalid state transition')) {
      return res.status(409).json({
        error: 'Conflict',
        details: err.message
      });
    }

    console.error('Error acknowledging incident:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while acknowledging the incident' 
        : err.message
    });
  }
});

/**
 * POST /incidents/:id/escalate
 * 
 * Escalate an incident (transition from OPEN to ESCALATING).
 * 
 * Response: 200 (success) or 409 (invalid transition)
 */
router.post('/:id/escalate', async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).json({
        error: 'Not found',
        details: `Incident ${id} not found`
      });
    }

    const updatedIncident = await transitionIncidentState(id, INCIDENT_STATES.ESCALATING);

    res.status(200).json({
      success: true,
      incident: updatedIncident,
      message: 'Incident escalated successfully'
    });
  } catch (err) {
    if (err.message.includes('Invalid state transition')) {
      return res.status(409).json({
        error: 'Conflict',
        details: err.message
      });
    }

    console.error('Error escalating incident:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while escalating the incident' 
        : err.message
    });
  }
});

/**
 * POST /incidents/:id/resolve
 * 
 * Resolve an incident with a resolution note.
 * 
 * Request body:
 * {
 *   "resolution_note": "Paid EMI manually"
 * }
 * 
 * Response: 200 (success), 400 (missing note), 404 (not found), 409 (invalid state)
 */
router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.body) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Request body is required'
      });
    }

    const { resolution_note } = req.body;

    if (!resolution_note || typeof resolution_note !== 'string' || !resolution_note.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'resolution_note is required and must be a non-empty string'
      });
    }

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).json({
        error: 'Not found',
        details: `Incident ${id} not found`
      });
    }

    if (incident.state === INCIDENT_STATES.RESOLVED) {
      return res.status(409).json({
        error: 'Conflict',
        details: 'Incident is already resolved'
      });
    }

    if (incident.state === INCIDENT_STATES.CANCELLED) {
      return res.status(409).json({
        error: 'Conflict',
        details: 'Cannot resolve a cancelled incident'
      });
    }

    const updatedIncident = await transitionIncidentState(id, INCIDENT_STATES.RESOLVED, resolution_note);

    res.status(200).json({
      success: true,
      incident: updatedIncident,
      message: 'Incident resolved successfully'
    });
  } catch (err) {
    if (err.message.includes('Invalid state transition')) {
      return res.status(409).json({
        error: 'Conflict',
        details: err.message
      });
    }

    console.error('Error resolving incident:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while resolving the incident' 
        : err.message
    });
  }
});

/**
 * POST /incidents/:id/cancel
 * 
 * Cancel an incident (terminal state).
 * 
 * Request body:
 * {
 *   "cancellation_reason": "False alarm"
 * }
 * 
 * Response: 200 (success), 400 (missing reason), 404 (not found), 409 (invalid state)
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.body) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Request body is required'
      });
    }

    const { cancellation_reason } = req.body;

    if (!cancellation_reason || typeof cancellation_reason !== 'string' || !cancellation_reason.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'cancellation_reason is required and must be a non-empty string'
      });
    }

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).json({
        error: 'Not found',
        details: `Incident ${id} not found`
      });
    }

    const updatedIncident = await transitionIncidentState(id, INCIDENT_STATES.CANCELLED, cancellation_reason);

    res.status(200).json({
      success: true,
      incident: updatedIncident,
      message: 'Incident cancelled successfully'
    });
  } catch (err) {
    if (err.message.includes('Invalid state transition')) {
      return res.status(409).json({
        error: 'Conflict',
        details: err.message
      });
    }

    console.error('Error cancelling incident:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while cancelling the incident' 
        : err.message
    });
  }
});

/**
 * GET /incidents/:id
 * 
 * Get a single incident by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const incident = await getIncidentById(req.params.id);
    
    if (!incident) {
      return res.status(404).json({
        error: 'Not found',
        details: `Incident ${req.params.id} not found`
      });
    }

    res.status(200).json(incident);
  } catch (err) {
    console.error('Error fetching incident:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while fetching the incident' 
        : err.message
    });
  }
});

/**
 * GET /incidents
 * 
 * Get all incidents with optional filtering and pagination.
 * 
 * Query parameters:
 * - state: Filter by state (OPEN, ACKNOWLEDGED, ESCALATING, RESOLVED, CANCELLED)
 * - limit: Number of results (default: 50, max: 1000)
 * - offset: Pagination offset (default: 0)
 */
router.get('/', async (req, res) => {
  try {
    const { state, limit = 50, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    const filters = {
      limit: parsedLimit,
      offset: parsedOffset
    };

    if (state) {
      if (!Object.values(INCIDENT_STATES).includes(state)) {
        return res.status(400).json({
          error: 'Validation failed',
          details: `Invalid state: ${state}. Allowed: ${Object.values(INCIDENT_STATES).join(', ')}`
        });
      }
      filters.state = state;
    }

    const incidents = await getIncidents(filters);

    res.status(200).json({
      incidents,
      count: incidents.length,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (err) {
    console.error('Error fetching incidents:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while fetching incidents' 
        : err.message
    });
  }
});

/**
 * GET /escalations/:incidentId
 * 
 * Fetch all escalations for an incident
 * Useful for audit trail and debugging
 */
router.get('/escalations/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const pool = require('../db');

    const result = await pool.query(
      `SELECT * FROM escalations WHERE incident_id = $1 ORDER BY escalation_level ASC`,
      [incidentId]
    );

    res.status(200).json({
      escalations: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching escalations:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while fetching escalations' 
        : err.message
    });
  }
});

module.exports = router;
