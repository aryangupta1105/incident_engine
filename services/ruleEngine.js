/**
 * Rule Engine
 * 
 * Deterministic, config-driven decision engine.
 * 
 * Evaluates events against rules and returns decisions:
 * - Should we schedule alerts?
 * - Should we create an incident?
 * 
 * PRINCIPLE: Rules decide. Services act.
 * 
 * This engine:
 * - Makes decisions only
 * - Returns decision reports
 * - Calls AlertService for alert scheduling
 * - Calls IncidentService for incident creation
 * - Never escalates
 * - Never resolves incidents
 * - Never contains side effects beyond service calls
 */

const pool = require('../db');
const alertService = require('./alertService');
const incidentService = require('./incidentService');
const {
  ALERT_RULES,
  INCIDENT_RULES,
  CONDITION_OPERATORS
} = require('../rules/ruleConfig');
const { v4: uuid } = require('uuid');

/**
 * Normalize date to UTC for consistent comparison
 * Prevents timezone-related bugs in time-window calculations
 * 
 * @param {Date|null} date - Date to normalize
 * @returns {Date|null} UTC date or null
 */
function normalizeToUTC(date) {
  if (!date) return null;
  if (!(date instanceof Date)) {
    try {
      date = new Date(date);
    } catch {
      return null;
    }
  }
  if (isNaN(date.getTime())) return null;
  // Return as UTC
  return new Date(date.getTime());
}

/**
 * Evaluate an event against all applicable rules
 * 
 * This is the main entry point. It:
 * 1. Loads rules for the event's category
 * 2. Evaluates alert rules
 * 3. Evaluates incident rules
 * 4. Returns a decision report
 * 
 * @param {object} event - Event object from database
 * @returns {object} Decision report with:
 *   - alerts_scheduled: array of scheduled alert objects
 *   - incident_created: boolean
 *   - incident_id: string (if created)
 *   - reason: string explaining decisions
 *   - evaluatedAlertRules: array of alert rule evaluations
 *   - evaluatedIncidentRule: incident rule evaluation
 * 
 * @throws {Error} If event is invalid or category has no rules
 */
async function evaluateEvent(event) {
  try {
    // Validate event
    if (!event || !event.id || !event.user_id || !event.category) {
      throw new Error('Invalid event: missing id, user_id, or category');
    }

    const eventCategory = event.category;

    console.log(`[RULE_ENGINE] Evaluating ${event.type} (${eventCategory})`);

    // Check if category has rules
    if (!ALERT_RULES[eventCategory] && !INCIDENT_RULES[eventCategory]) {
      throw new Error(`No rules defined for category: ${eventCategory}`);
    }

    // Evaluate alert rules
    console.log(`[RULE_ENGINE] Checking ${ALERT_RULES[eventCategory]?.length || 0} alert rules`);
    const alertResults = await evaluateAlertRules(event, eventCategory);

    // Evaluate incident rules
    console.log(`[RULE_ENGINE] Checking incident rule`);
    const incidentResult = await evaluateIncidentRules(event, eventCategory);

    // Build decision report
    const report = {
      event_id: event.id,
      event_category: eventCategory,
      alerts_scheduled: alertResults.alerts,
      alert_rules_evaluated: alertResults.count,
      incident_created: incidentResult.created,
      incident_id: incidentResult.id || null,
      incident_rule_evaluated: incidentResult.ruleName,
      reason: buildReason(alertResults, incidentResult),
      timestamp: new Date(),
      evaluatedAlertRules: alertResults.details,
      evaluatedIncidentRule: incidentResult.details
    };

    console.log(`[RULE_ENGINE] Decision: ${alertResults.count} alert rules, ` +
                `incident=${incidentResult.created}, ` +
                `alerts_to_schedule=${alertResults.alerts.length}`);

    return report;
  } catch (err) {
    console.error('[RULE_ENGINE] Evaluation failed:', err.message);
    throw err;
  }
}

/**
 * Evaluate all alert rules for a category
 * 
 * Alert rules are about awareness - scheduling notifications for users.
 * Multiple alert rules can match and trigger.
 * 
 * @param {object} event - Event to evaluate
 * @param {string} category - Event category
 * @returns {object} { alerts: [], count: number, details: [] }
 */
async function evaluateAlertRules(event, category) {
  const results = {
    alerts: [],
    count: 0,
    details: []
  };

  // Get alert rules for this category
  const categoryRules = ALERT_RULES[category] || [];

  console.log(`[RULE_ENGINE] Evaluating ${categoryRules.length} alert rule(s) for ${category}`);

  for (const rule of categoryRules) {
    // Skip disabled rules
    if (!rule.enabled) {
      results.details.push({
        ruleName: rule.name,
        matched: false,
        reason: 'Rule disabled'
      });
      continue;
    }

    // Evaluate rule conditions
    const conditionsMet = evaluateConditions(rule.conditions || [], event);

    if (!conditionsMet) {
      results.details.push({
        ruleName: rule.name,
        matched: false,
        reason: 'Conditions not met'
      });
      continue;
    }

    // Conditions matched - attempt to schedule alert
    try {
      const result = await scheduleAlertFromRule(event, rule);

      // result now includes { alert, decision }
      if (result.alert && result.decision.scheduled) {
        results.alerts.push(result.alert);
        results.count++;

        results.details.push({
          ruleName: rule.name,
          matched: true,
          alertId: result.alert.id,
          alertType: result.alert.alert_type,
          scheduledAt: result.alert.scheduled_at,
          reason: result.decision.reason
        });

        console.log(`[RULE_ENGINE] ✓ Alert scheduled: ${rule.name} (${result.alert.alert_type}) — ${result.decision.reason}`);
      } else {
        // Decision was to not schedule (but no error)
        results.details.push({
          ruleName: rule.name,
          matched: true,
          alertId: null,
          reason: result.decision.reason
        });

        console.log(`[RULE_ENGINE] ◯ Alert not scheduled: ${rule.name} — ${result.decision.reason}`);
      }
    } catch (err) {
      console.error(`[RULE_ENGINE] Failed to schedule alert for rule ${rule.name}:`, err.message);

      results.details.push({
        ruleName: rule.name,
        matched: true,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Schedule an alert based on rule
 * 
 * TASK 2 — MAKE TIME WINDOWS EXPLICIT
 * TASK 3 — HANDLE LATE-BUT-VALID WINDOWS
 * TASK 4 — PREVENT DUPLICATE ALERTS
 * TASK 5 — ADD MINIMUM ACTIONABILITY GUARD
 * TASK 7 — EXPLAIN DECISION
 * TASK 8 — ADD DEBUG LOG
 * 
 * Time window logic for alerts:
 * - ALERT_WINDOW_START = event.occurred_at - alert_before_minutes
 * - ALERT_WINDOW_END = event.occurred_at
 * - Current time (now) MUST be within this window
 * - Alert must not have been scheduled already
 * - Meeting must be actionable (at least 1-2 min away)
 * 
 * @param {object} event - Event object with occurred_at
 * @param {object} rule - Alert rule object with alert.offsetMinutes
 * @returns {object} { alert, decision: { scheduled, reason } }
 */
async function scheduleAlertFromRule(event, rule) {
  const now = normalizeToUTC(new Date());
  const meetingStart = normalizeToUTC(event.occurred_at);
  
  // Constants
  const MIN_ACTIONABLE_MINUTES = 0.5; // Don't alert if < 30 seconds away
  const alertBeforeMinutes = Math.abs(rule.alert.offsetMinutes);
  
  // TASK 2 — MAKE TIME WINDOWS EXPLICIT
  const alertWindowStart = new Date(meetingStart.getTime() - alertBeforeMinutes * 60 * 1000);
  const alertWindowEnd = meetingStart;
  
  // Calculate minutes until meeting starts
  const minutesUntilStart = (meetingStart.getTime() - now.getTime()) / (1000 * 60);
  
  // TASK 8 — DEBUG LOG
  const debugInfo = {
    now: now.toISOString(),
    meeting_start: meetingStart.toISOString(),
    minutesUntilStart: minutesUntilStart.toFixed(2),
    alert_window_start: alertWindowStart.toISOString(),
    alert_window_end: alertWindowEnd.toISOString(),
    alert_before_minutes: alertBeforeMinutes,
    min_actionable_minutes: MIN_ACTIONABLE_MINUTES
  };
  
  console.log(`[RULE_DEBUG] ${JSON.stringify(debugInfo)}`);
  
  // TASK 5 — ADD MINIMUM ACTIONABILITY GUARD
  // If meeting is too close to start (< 30 seconds), don't alert
  // But allow 1-minute-away meetings to trigger alerts
  if (minutesUntilStart < MIN_ACTIONABLE_MINUTES) {
    return {
      alert: null,
      decision: {
        scheduled: false,
        reason: `meeting too close to start to be actionable (${minutesUntilStart.toFixed(1)}min away, need at least ${MIN_ACTIONABLE_MINUTES}min)`
      }
    };
  }
  
  // TASK 3 — HANDLE LATE-BUT-VALID WINDOWS
  // Check if current time is within alert window
  if (now < alertWindowStart || now > alertWindowEnd) {
    return {
      alert: null,
      decision: {
        scheduled: false,
        reason: `meeting outside alert window [${alertWindowStart.toISOString()}, ${alertWindowEnd.toISOString()}]`
      }
    };
  }
  
  // TASK 4 — PREVENT DUPLICATE ALERTS
  // Check if alert already exists for this event and type
  try {
    const existingAlert = await pool.query(
      `SELECT id FROM alerts 
       WHERE event_id = $1 AND alert_type = $2 AND status IN ('PENDING', 'DELIVERED')`,
      [event.id, rule.alert.alertType]
    );
    
    if (existingAlert.rows.length > 0) {
      return {
        alert: null,
        decision: {
          scheduled: false,
          reason: `alert already scheduled earlier for this event (id: ${existingAlert.rows[0].id})`
        }
      };
    }
  } catch (checkErr) {
    console.warn(`[RULE_ENGINE] Failed to check existing alerts:`, checkErr.message);
    // Continue with scheduling (better to have duplicate than miss alert)
  }
  
  // TASK 7 — EXPLAIN DECISION
  const scheduledAt = calculateScheduledTime(event.occurred_at, rule.alert.offsetMinutes);
  
  try {
    // Schedule alert via AlertService
    const alert = await alertService.scheduleAlert({
      userId: event.user_id,
      eventId: event.id,
      category: event.category,
      alertType: rule.alert.alertType,
      scheduledAt
    });

    return {
      alert,
      decision: {
        scheduled: true,
        reason: `meeting inside alert window — alert scheduled (starts at ${meetingStart.toISOString()}, ${minutesUntilStart.toFixed(1)}min away)`
      }
    };
  } catch (scheduleErr) {
    return {
      alert: null,
      decision: {
        scheduled: false,
        reason: `failed to schedule alert: ${scheduleErr.message}`
      }
    };
  }
}

/**
 * Calculate alert scheduled time based on offset from event occurrence
 * 
 * Offsets:
 * - Positive: X minutes after event occurred
 * - Negative: X minutes before event occurred
 * - Zero: immediately
 * 
 * Example:
 * - event.occurred_at = 2025-12-20 15:00:00
 * - offsetMinutes = -30
 * - scheduledAt = 2025-12-20 14:30:00 (30 min before)
 * 
 * @param {Date} occurredAt - Event occurrence time
 * @param {number} offsetMinutes - Minutes offset (positive=after, negative=before)
 * @returns {Date} Calculated scheduled time
 */
function calculateScheduledTime(occurredAt, offsetMinutes = 0) {
  const date = new Date(occurredAt);
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date;
}

/**
 * Evaluate incident rule for a category
 * 
 * Incident rules are strict and binary - either the condition matches or it doesn't.
 * At most one incident rule per category (though only triggered if enabled).
 * 
 * @param {object} event - Event to evaluate
 * @param {string} category - Event category
 * @returns {object} { created: boolean, id: string|null, ruleName: string, details: object }
 */
async function evaluateIncidentRules(event, category) {
  const result = {
    created: false,
    id: null,
    ruleName: null,
    details: {
      ruleName: null,
      matched: false,
      reason: null,
      incidentId: null
    }
  };

  // Get incident rule for this category
  const categoryRule = INCIDENT_RULES[category];

  if (!categoryRule) {
    result.details.reason = `No incident rule for category: ${category}`;
    return result;
  }

  result.details.ruleName = categoryRule.trigger?.name || 'unknown';

  // Check if rule is enabled
  if (!categoryRule.enabled) {
    console.log(`[RULE_ENGINE] Incident rule disabled for ${category}`);
    result.details.reason = 'Incident rule disabled';
    return result;
  }

  // No trigger defined - this category doesn't create incidents
  if (!categoryRule.trigger) {
    result.details.reason = 'No trigger defined for category';
    return result;
  }

  // Evaluate incident rule conditions
  const conditionsMet = evaluateConditions(categoryRule.trigger.conditions || [], event);

  if (!conditionsMet) {
    result.details.matched = false;
    result.details.reason = 'Incident trigger conditions not met';
    console.log(`[RULE_ENGINE] Incident rule not triggered for ${category}`);
    return result;
  }

  // Conditions matched - create incident
  try {
    const incident = await createIncidentFromRule(event, categoryRule);

    result.created = true;
    result.id = incident.id;
    result.details.matched = true;
    result.details.incidentId = incident.id;
    result.details.reason = `Incident created: ${categoryRule.trigger.name}`;

    console.log(`[RULE_ENGINE] ✓ Incident created: ${incident.id} (${incident.type})`);

    return result;
  } catch (err) {
    console.error(`[RULE_ENGINE] Failed to create incident for ${category}:`, err.message);

    result.details.matched = true;
    result.details.error = err.message;
    result.details.reason = `Failed to create incident: ${err.message}`;

    return result;
  }
}

/**
 * Create an incident based on rule
 * 
 * Calls IncidentService.createIncident with rule configuration.
 * Sets initial severity and consequence.
 * Does NOT escalate.
 * 
 * @param {object} event - Event object
 * @param {object} rule - Incident rule object
 * @returns {object} Created incident
 */
async function createIncidentFromRule(event, rule) {
  // Create incident via IncidentService
  const incident = await incidentService.createIncident({
    userId: event.user_id,
    eventId: event.id,
    category: event.category,
    type: rule.incident.type,
    severity: rule.incident.severity,
    consequence: rule.incident.consequence
  });

  return incident;
}

/**
 * Evaluate a set of conditions against an event
 * 
 * All conditions must be true (AND logic).
 * Returns false if any condition is false.
 * 
 * Condition format:
 * {
 *   field: 'payload.status' or 'occurred_at' or 'type', etc.
 *   operator: 'equals', 'greater_than', 'exists', etc.
 *   value: expected value (optional for exists/not_exists)
 * }
 * 
 * @param {array} conditions - Array of condition objects
 * @param {object} event - Event to evaluate
 * @returns {boolean} True if all conditions match
 */
function evaluateConditions(conditions, event) {
  if (!conditions || conditions.length === 0) {
    return true; // No conditions = always true
  }

  for (const condition of conditions) {
    const { field, operator, value } = condition;

    // Get field value from event (supports nested paths like payload.status)
    const fieldValue = getNestedValue(event, field);

    // Get operator function
    const operatorFunc = CONDITION_OPERATORS[operator];
    if (!operatorFunc) {
      console.warn(`[RULE_ENGINE] Unknown operator: ${operator}`);
      return false;
    }

    // Evaluate condition
    let result;
    if (value !== undefined) {
      result = operatorFunc(fieldValue, value);
    } else {
      result = operatorFunc(fieldValue);
    }

    // If any condition fails, return false (AND logic)
    if (!result) {
      return false;
    }
  }

  // All conditions passed
  return true;
}

/**
 * Get nested value from object using dot notation
 * 
 * Examples:
 * - getNestedValue(event, 'type') → event.type
 * - getNestedValue(event, 'payload.status') → event.payload.status
 * - getNestedValue(event, 'payload.amount_usd') → event.payload.amount_usd
 * 
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-notation path
 * @returns {any} Value at path, or undefined if not found
 */
function getNestedValue(obj, path) {
  if (!path || !obj) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Build human-readable reason string for decision
 * 
 * Explains why alerts were scheduled and/or incidents created
 * 
 * @param {object} alertResults - Results from alert rule evaluation
 * @param {object} incidentResult - Results from incident rule evaluation
 * @returns {string} Human-readable reason
 */
function buildReason(alertResults, incidentResult) {
  const parts = [];

  if (alertResults.count > 0) {
    parts.push(`scheduled ${alertResults.count} alert(s)`);
  } else {
    parts.push('no alerts triggered');
  }

  if (incidentResult.created) {
    parts.push(`created incident (${incidentResult.details.incidentId})`);
  } else {
    parts.push('no incident created');
  }

  return parts.join('; ');
}

module.exports = {
  evaluateEvent,
  evaluateAlertRules,
  evaluateIncidentRules,
  evaluateConditions,
  getNestedValue,
  calculateScheduledTime
};
