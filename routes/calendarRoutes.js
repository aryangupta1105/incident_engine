const express = require('express');
const router = express.Router();
const { syncMeetings } = require('../services/calendarService');
const { v4: validate } = require('uuid');

/**
 * POST /calendar/sync
 * 
 * DEV-ONLY endpoint to manually trigger Google Calendar sync for a user.
 * 
 * This endpoint:
 * - Validates that FEATURE_CALENDAR_ENABLED is true
 * - Accepts userId (UUID) from request body
 * - Calls CalendarService.syncMeetings()
 * - Lets RuleEngine decide alerts/incidents
 * - Returns clean JSON response with event count
 * 
 * Feature Flag: FEATURE_CALENDAR_ENABLED === 'true'
 * 
 * Request Body:
 * {
 *   "userId": "<uuid>"
 * }
 * 
 * Response (200):
 * {
 *   "success": true,
 *   "userId": "<uuid>",
 *   "eventsProcessed": <number>,
 *   "eventsSkipped": <number>,
 *   "message": "Calendar sync completed"
 * }
 */
router.post('/sync', async (req, res) => {
  try {
    // Check feature flag
    if (process.env.FEATURE_CALENDAR_ENABLED !== 'true') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Calendar integration is disabled',
        feature: 'FEATURE_CALENDAR_ENABLED'
      });
    }

    // Validate userId from request body
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'userId is required in request body'
      });
    }

    // Validate UUID format
    if (!isValidUUID(userId)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'userId must be a valid UUID',
        received: userId
      });
    }

    console.log(`[CALENDAR_API] Sync requested for user ${userId}`);

    // Call CalendarService to sync meetings
    const syncResult = await syncMeetings(userId);

    // If sync failed (OAuth not connected, token expired, etc.)
    if (!syncResult.success) {
      console.error(`[CALENDAR_API] Sync failed for user ${userId}: ${syncResult.error}`);
      
      // Return 409 if OAuth not connected
      if (syncResult.error && syncResult.error.includes('not connected')) {
        return res.status(409).json({
          error: 'Conflict',
          message: syncResult.error,
          reason: 'OAUTH_NOT_CONNECTED'
        });
      }

      // Return 409 if token expired
      if (syncResult.error && syncResult.error.includes('expired')) {
        return res.status(409).json({
          error: 'Conflict',
          message: syncResult.error,
          reason: 'OAUTH_TOKEN_EXPIRED'
        });
      }

      // Generic 500 for other errors
      return res.status(500).json({
        error: 'Internal Server Error',
        message: syncResult.error
      });
    }

    console.log(`[CALENDAR_API] Sync completed: ${syncResult.events_created} events created, ${syncResult.events_skipped} skipped`);

    // Return success response
    res.status(200).json({
      success: true,
      userId,
      eventsProcessed: syncResult.events_created,
      eventsSkipped: syncResult.events_skipped,
      message: 'Calendar sync completed',
      ruleDecisions: syncResult.rule_decisions || []
    });
  } catch (err) {
    console.error('[CALENDAR_API] Unhandled error during sync:', err.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An error occurred during calendar sync' 
        : err.message
    });
  }
});

/**
 * Validate UUID format
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

module.exports = router;
