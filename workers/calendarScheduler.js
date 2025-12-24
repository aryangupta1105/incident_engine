/**
 * PHASE A: CRON-BASED SCHEDULER (TIME ENGINE)
 * 
 * Purpose: Time must move even if the user does nothing
 * 
 * Runs every 1 minute and:
 * 1. Fetches all users with calendar integration enabled
 * 2. Triggers calendar sync for each user
 * 3. Passes current timestamp to rule engine
 * 4. Never blocks on a single user failure
 * 
 * Feature-flag controlled: FEATURE_SCHEDULER_ENABLED
 */

const cron = require('node-cron');
const pool = require('../db');
const calendarService = require('../services/calendarService');
const ruleEngine = require('../services/ruleEngine');

let scheduler = null;
let isRunning = false;

// Statistics tracking
const stats = {
  ticksProcessed: 0,
  usersProcessed: 0,
  usersFailed: 0,
  lastTickTime: null
};

/**
 * Start the scheduler
 * Runs every minute (0 seconds of every minute)
 * 
 * @returns {void}
 */
function startScheduler() {
  const enabled = process.env.FEATURE_SCHEDULER_ENABLED === 'true';
  
  if (!enabled) {
    console.log('[SCHEDULER] Scheduler disabled by feature flag (FEATURE_SCHEDULER_ENABLED)');
    return;
  }

  // Prevent multiple scheduler instances
  if (scheduler) {
    console.warn('[SCHEDULER] Scheduler already running, skipping restart');
    return;
  }

  console.log('[SCHEDULER] Starting calendar scheduler (1-minute tick)');

  // Schedule to run every minute at 0 seconds
  scheduler = cron.schedule('0 * * * * *', async () => {
    if (isRunning) {
      console.warn('[SCHEDULER] Previous tick still running, skipping this tick');
      return;
    }

    isRunning = true;
    const tickStartTime = Date.now();
    stats.lastTickTime = new Date().toISOString();

    try {
      console.log(`[SCHEDULER] Tick started at ${stats.lastTickTime}`);

      // TASK 1: ONLY query calendar_credentials - NO assumptions about other columns
      // This is the ONLY authoritative source of truth for calendar users
      const usersRes = await pool.query(
        `SELECT DISTINCT user_id 
         FROM calendar_credentials 
         WHERE provider = 'google'`
      );

      const userCount = usersRes.rows.length;
      console.log(`[SCHEDULER] Found ${userCount} user(s) with calendar enabled`);

      // TASK 5: Defensive check - exit cleanly if zero users
      if (userCount === 0) {
        console.log('[SCHEDULER] No users with calendar enabled, tick complete');
        stats.ticksProcessed++;
        isRunning = false;
        return;
      }

      const users = usersRes.rows;
      stats.usersProcessed = 0;
      stats.usersFailed = 0;

      // TASK 2: Process each user with complete failure isolation
      for (const row of users) {
        const userId = row.user_id;
        try {
          console.log(`[SCHEDULER] Syncing calendar for user ${userId}`);
          const syncResult = await processUserSync(userId);
          stats.usersProcessed++;
          
          // TASK 6: Temp debug visibility
          console.log(`[SCHEDULER_DEBUG] User ${userId}: ${syncResult.events_created || 0} events created, ${syncResult.events_skipped || 0} skipped`);
          console.log(`[SCHEDULER] Calendar sync completed for user ${userId}`);
        } catch (err) {
          stats.usersFailed++;
          console.error(`[SCHEDULER] Calendar sync failed for user ${userId}: ${err.message}`);
          // TASK 2: Continue processing other users - NEVER crash entire tick
        }
      }

      stats.ticksProcessed++;
      const tickDuration = Date.now() - tickStartTime;
      console.log(`[SCHEDULER] Tick completed: ${stats.usersProcessed} succeeded, ${stats.usersFailed} failed, ${tickDuration}ms`);
    } catch (err) {
      // TASK 2: Catch-all for any unhandled tick errors - never crash
      console.error('[SCHEDULER] Tick failed with critical error:', err.message);
    } finally {
      isRunning = false;
    }
  });

  console.log('[SCHEDULER] Scheduler started successfully');
}

/**
 * Discover users with calendar credentials
 * Source of truth: calendar_credentials table ONLY
 * 
 * @returns {Promise<Array>} User IDs with active calendar integrations
 */
async function getUsersWithCalendarEnabled() {
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_id 
       FROM calendar_credentials 
       WHERE provider = 'google'`
    );
    return result.rows.map(row => row.user_id);
  } catch (err) {
    console.error('[SCHEDULER] Failed to discover calendar users:', err.message);
    return [];
  }
}

/**
 * Process calendar sync for a single user
 * Idempotent: safe to call multiple times
 * 
 * @param {string} userId - User UUID
 * @returns {Promise<object>} Sync result
 */
async function processUserSync(userId) {
  try {
    // Trigger calendar sync (idempotent)
    const syncResult = await calendarService.syncMeetings(userId);

    // TASK 5: Defensive check - handle unexpected responses gracefully
    if (!syncResult || typeof syncResult !== 'object') {
      console.log(`[SCHEDULER_DEBUG] syncMeetings returned unexpected result for user ${userId}`);
      return { success: true, events_created: 0, events_skipped: 0 };
    }

    // TASK 6: Debug visibility - show what was synced
    const created = syncResult.events_created || 0;
    const skipped = syncResult.events_skipped || 0;
    console.log(`[SCHEDULER_DEBUG] User ${userId}: ${created} events created, ${skipped} skipped`);

    // Note: Rule engine evaluation happens inside syncMeetings
    // No need to call evaluateEvent here

    return {
      userId,
      success: true,
      events_created: created,
      events_skipped: skipped
    };
  } catch (err) {
    // Re-throw for caller to handle
    throw err;
  }
}

/**
 * Stop the scheduler
 * @returns {void}
 */
function stopScheduler() {
  if (scheduler) {
    console.log('[SCHEDULER] Stopping scheduler...');
    scheduler.stop();
    scheduler = null;
    console.log('[SCHEDULER] Scheduler stopped');
  }
}

/**
 * Get scheduler statistics
 * @returns {object} Stats object
 */
function getStats() {
  return {
    enabled: process.env.FEATURE_SCHEDULER_ENABLED === 'true',
    ticksProcessed: stats.ticksProcessed,
    usersProcessed: stats.usersProcessed,
    usersFailed: stats.usersFailed,
    lastTickTime: stats.lastTickTime,
    isRunning
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getStats,
  getUsersWithCalendarEnabled, // TASK 1: Helper for DB-driven discovery
  processUserSync // Export for testing
};
