/**
 * Escalation Policy Configuration
 * 
 * Defines when and how incidents escalate.
 * Completely configurable - change here, not in business logic.
 */

const ESCALATION_POLICY = {
  // Whether escalation is enabled
  enabled: true,

  // Maximum number of escalation levels
  maxLevels: 3,

  // Escalation levels with timing (in milliseconds)
  levels: [
    {
      level: 1,
      delayMs: 5 * 60 * 1000,      // 5 minutes
      description: 'First escalation check'
    },
    {
      level: 2,
      delayMs: 15 * 60 * 1000,     // 15 minutes
      description: 'Second escalation check'
    },
    {
      level: 3,
      delayMs: 60 * 60 * 1000,     // 60 minutes (1 hour)
      description: 'Final escalation check'
    }
  ],

  // Log escalation execution
  logEscalations: true,

  // Worker polling interval (check Redis every X ms)
  // Don't set too low (high DB load), don't set too high (delayed execution)
  workerPollIntervalMs: 5 * 1000,  // 5 seconds

  // Redis cleanup: max age of completed escalations (in seconds)
  // They're still in DB for audit trail, but removed from active Redis tracking
  cleanupIntervalMs: 60 * 1000     // 60 seconds
};

/**
 * Get escalation delay for a given level
 * @param {number} level - Escalation level (1, 2, 3, etc.)
 * @returns {number} Delay in milliseconds, or null if level doesn't exist
 */
function getDelayForLevel(level) {
  const levelConfig = ESCALATION_POLICY.levels.find(l => l.level === level);
  return levelConfig ? levelConfig.delayMs : null;
}

/**
 * Get next escalation level
 * @param {number} currentLevel - Current escalation level
 * @returns {number|null} Next level or null if max reached
 */
function getNextLevel(currentLevel) {
  if (currentLevel >= ESCALATION_POLICY.maxLevels) {
    return null;
  }
  return currentLevel + 1;
}

/**
 * Check if a level is valid
 * @param {number} level - Escalation level
 * @returns {boolean}
 */
function isValidLevel(level) {
  return level > 0 && level <= ESCALATION_POLICY.maxLevels;
}

module.exports = {
  ESCALATION_POLICY,
  getDelayForLevel,
  getNextLevel,
  isValidLevel
};
