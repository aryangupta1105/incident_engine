/**
 * Incident State Machine Helper
 * 
 * Enforces strict state transitions for incidents.
 * This is a critical safety mechanism.
 */

// Define all valid incident states
const INCIDENT_STATES = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  ESCALATING: 'ESCALATING',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED'
};

/**
 * Valid state transitions map
 * 
 * Maps current state → array of allowed next states
 */
const VALID_TRANSITIONS = {
  [INCIDENT_STATES.OPEN]: [
    INCIDENT_STATES.ACKNOWLEDGED,
    INCIDENT_STATES.ESCALATING,
    INCIDENT_STATES.CANCELLED
  ],
  [INCIDENT_STATES.ACKNOWLEDGED]: [
    INCIDENT_STATES.RESOLVED
  ],
  [INCIDENT_STATES.ESCALATING]: [
    INCIDENT_STATES.RESOLVED,
    INCIDENT_STATES.CANCELLED
  ],
  [INCIDENT_STATES.RESOLVED]: [],      // Terminal state
  [INCIDENT_STATES.CANCELLED]: []      // Terminal state
};

/**
 * Validates if a state transition is allowed
 * 
 * @param {string} currentState - Current incident state
 * @param {string} nextState - Desired next state
 * @returns {boolean} true if transition is valid
 * @throws {Error} if transition is invalid
 */
function validateTransition(currentState, nextState) {
  // Validate inputs
  if (!currentState || !nextState) {
    throw new Error('Current state and next state are required');
  }

  if (!INCIDENT_STATES[currentState]) {
    throw new Error(`Invalid current state: ${currentState}`);
  }

  if (!INCIDENT_STATES[nextState]) {
    throw new Error(`Invalid next state: ${nextState}`);
  }

  // Check if transition is allowed
  const allowedNextStates = VALID_TRANSITIONS[currentState];
  
  if (!allowedNextStates.includes(nextState)) {
    throw new Error(
      `Invalid state transition: ${currentState} → ${nextState}. ` +
      `Allowed transitions from ${currentState}: ${allowedNextStates.join(', ') || 'NONE (terminal state)'}`
    );
  }

  return true;
}

/**
 * Get allowed next states for a given state
 * 
 * @param {string} currentState - Current incident state
 * @returns {string[]} Array of allowed next states
 */
function getAllowedTransitions(currentState) {
  if (!INCIDENT_STATES[currentState]) {
    throw new Error(`Invalid state: ${currentState}`);
  }
  return VALID_TRANSITIONS[currentState] || [];
}

/**
 * Check if a state is terminal (no further transitions possible)
 * 
 * @param {string} state - Incident state
 * @returns {boolean}
 */
function isTerminalState(state) {
  return VALID_TRANSITIONS[state]?.length === 0;
}

module.exports = {
  INCIDENT_STATES,
  VALID_TRANSITIONS,
  validateTransition,
  getAllowedTransitions,
  isTerminalState
};
