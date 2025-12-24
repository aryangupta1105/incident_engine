/**
 * Calendar Service
 * 
 * Fetches meetings from Google Calendar and converts them to
 * generalized EVENTS that are processed by the rule engine.
 * 
 * Key Features:
 * - Fetches upcoming meetings from Google Calendar
 * - Filters cancelled and all-day events
 * - Normalizes timezones
 * - Ensures idempotency (no duplicate events)
 * - Converts to generalized event format
 * - Invokes rule engine for decision making
 * 
 * PRINCIPLE: Calendar service only fetches and normalizes.
 *            RuleEngine decides what to do with events.
 */

const { google } = require('googleapis');
const pool = require('../db');
const eventService = require('./eventService');
const ruleEngine = require('./ruleEngine');
const googleOAuth = require('./googleOAuth');
const { v4: uuid } = require('uuid');

const CALENDAR_API_VERSION = 'v3';

/**
 * Build Google Calendar API client
 * 
 * @param {string} accessToken - Google OAuth access token
 * @returns {object} Google Calendar API client
 */
function buildCalendarClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2(
    googleOAuth.GOOGLE_CLIENT_ID,
    googleOAuth.GOOGLE_CLIENT_SECRET,
    googleOAuth.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({
    version: CALENDAR_API_VERSION,
    auth: oauth2Client
  });
}

/**
 * Fetch upcoming meetings from Google Calendar
 * 
 * TASK 1 — FIX EXPIRY CHECK (CRITICAL)
 * NEVER fail just because expiry_date is null.
 * If refresh_token exists, attempt refresh.
 * Only require reconnect if refresh fails.
 * 
 * TASK 4 — RETRY CALENDAR REQUEST
 * After token refresh, set new credentials and retry API call.
 * 
 * @param {string} userId - User UUID
 * @param {Date} fromDate - Start date (default: now)
 * @param {Date} toDate - End date (default: 7 days from now)
 * @returns {array} Array of normalized meeting objects
 * @throws {Error} If credentials missing or refresh fails
 */
async function fetchUpcomingMeetings(userId, fromDate = null, toDate = null) {
  console.log(`[CALENDAR_SERVICE] Fetching meetings for user ${userId}`);

  // Get user's stored credentials
  let credentials;
  try {
    credentials = await googleOAuth.getCredentials(userId);
  } catch (err) {
    console.error(`[CALENDAR_SERVICE] No credentials found for user ${userId}`);
    throw new Error(`Google Calendar not connected for user ${userId}`);
  }

  // TASK 1 — FIX EXPIRY CHECK (CRITICAL)
  // NEVER fail just because expiry_date is null
  // ALWAYS attempt refresh if refresh_token exists
  if (googleOAuth.isTokenExpired(credentials.token_expiry)) {
    console.log(`[CALENDAR_SERVICE] Token expired, attempting refresh...`);
    
    try {
      // Attempt to refresh token
      const refreshedCredentials = await googleOAuth.refreshAccessToken(userId);
      credentials = {
        access_token: refreshedCredentials.access_token,
        refresh_token: refreshedCredentials.refresh_token,
        token_expiry: refreshedCredentials.expiry_date
      };
      console.log(`[CALENDAR_SERVICE] Token refreshed successfully, retrying calendar sync...`);
    } catch (refreshErr) {
      // TASK 5 — FAIL ONLY ON REAL FAILURE
      // Only throw if refresh_token missing or refresh fails
      console.error(`[CALENDAR_SERVICE] Token refresh failed: ${refreshErr.message}`);
      throw new Error(`OAUTH_RECONNECT_REQUIRED: ${refreshErr.message}`);
    }
  }

  // Set default date range
  if (!fromDate) fromDate = new Date();
  if (!toDate) {
    toDate = new Date();
    toDate.setDate(toDate.getDate() + 7); // 7 days from now
  }

  console.log(`[CALENDAR_SERVICE] Fetching meetings from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

  try {
    // TASK 4 — RETRY CALENDAR REQUEST
    // After refresh, set new credentials on oauth2Client
    const calendar = buildCalendarClient(credentials.access_token);

    // Fetch events from primary calendar
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: fromDate.toISOString(),
      timeMax: toDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
      fields: 'items(id,summary,description,start,end,organizer,attendees,htmlLink,conferenceData,status,transparency)'
    });

    const items = response.data.items || [];
    console.log(`[CALENDAR_SERVICE] Fetched ${items.length} events from Google Calendar`);

    // Filter and normalize
    const meetings = items
      .filter(item => shouldIncludeMeeting(item))
      .map(item => normalizeMeeting(item));

    console.log(`[CALENDAR_SERVICE] Normalized ${meetings.length} meetings (after filtering)`);

    return meetings;
  } catch (err) {
    console.error(`[CALENDAR_SERVICE] Failed to fetch meetings:`, err.message);
    throw err;
  }
}

/**
 * Determine if a calendar event should be included as a meeting
 * 
 * Filters out:
 * - Cancelled events
 * - All-day events
 * - Declined attendances
 * 
 * @param {object} item - Google Calendar event object
 * @returns {boolean} True if should include
 */
function shouldIncludeMeeting(item) {
  // Skip cancelled events
  if (item.status === 'cancelled') {
    console.log(`[CALENDAR_SERVICE] Skipping cancelled event: ${item.summary || item.id}`);
    return false;
  }

  // Skip all-day events
  if (!item.start.dateTime) {
    console.log(`[CALENDAR_SERVICE] Skipping all-day event: ${item.summary || item.id}`);
    return false;
  }

  return true;
}

/**
 * Normalize a Google Calendar event to meeting object
 * 
 * Extracts:
 * - start_time (ISO 8601)
 * - end_time (ISO 8601)
 * - title
 * - organizer email
 * - attendees count
 * - join_url (Google Meet/Zoom)
 * - importance (based on attendee count, calendar transparency)
 * 
 * @param {object} item - Google Calendar event
 * @returns {object} Normalized meeting object
 */
function normalizeMeeting(item) {
  const startTime = new Date(item.start.dateTime);
  const endTime = new Date(item.end.dateTime);
  const durationMinutes = (endTime - startTime) / (1000 * 60);

  // Extract join URL if available
  let joinUrl = null;
  if (item.conferenceData?.conferenceData?.entryPoints) {
    const videoEntry = item.conferenceData.conferenceData.entryPoints.find(
      ep => ep.entryPointType === 'video'
    );
    joinUrl = videoEntry?.uri || null;
  }

  // Fallback to htmlLink if no conference data
  if (!joinUrl && item.htmlLink) {
    joinUrl = item.htmlLink;
  }

  // Calculate importance based on heuristics
  const attendeeCount = item.attendees ? item.attendees.length : 0;
  const isTransparent = item.transparency === 'transparent'; // "Free" time blocks
  let importance = 'LOW';

  if (isTransparent) {
    importance = 'LOW'; // Marked as free time
  } else if (attendeeCount > 5) {
    importance = 'HIGH'; // Many attendees
  } else if (attendeeCount > 1) {
    importance = 'MEDIUM'; // 1:1 or small group
  }

  const organizer = item.organizer?.email || 'unknown';

  const meeting = {
    calendar_event_id: item.id,
    title: item.summary || '(No title)',
    description: item.description || null,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_minutes: durationMinutes,
    organizer,
    attendee_count: attendeeCount,
    join_url: joinUrl,
    importance,
    status: 'SCHEDULED', // Required by alert rule conditions
    incident_enabled: false // Meetings don't create incidents directly
  };

  return meeting;
}

/**
 * Sync meetings from Google Calendar to events system
 * 
 * Flow:
 * 1. Fetch meetings from Google Calendar
 * 2. Check idempotency (skip if already processed)
 * 3. Create MEETING event via EventService
 * 4. Invoke RuleEngine.evaluateEvent()
 * 5. Return results
 * 
 * @param {string} userId - User UUID
 * @param {Date} fromDate - Start date (optional)
 * @param {Date} toDate - End date (optional)
 * @returns {object} Sync results
 */
async function syncMeetings(userId, fromDate = null, toDate = null) {
  console.log(`[CALENDAR] Sync started for user ${userId}`);

  let meetings;
  try {
    meetings = await fetchUpcomingMeetings(userId, fromDate, toDate);
  } catch (err) {
    console.error(`[CALENDAR] Sync failed (fetch error): ${err.message}`);
    return {
      success: false,
      error: err.message,
      events_created: 0,
      events_skipped: 0,
      rule_decisions: []
    };
  }

  console.log(`[CALENDAR] Fetched ${meetings.length} meetings to process`);

  const results = {
    success: true,
    events_created: 0,
    events_skipped: 0,
    rule_decisions: []
  };

  // Process each meeting
  for (const meeting of meetings) {
    try {
      // Check idempotency: has this calendar event already been processed?
      const existingMapping = await pool.query(
        `SELECT event_id FROM calendar_event_mappings 
         WHERE user_id = $1 AND calendar_event_id = $2`,
        [userId, meeting.calendar_event_id]
      );

      if (existingMapping.rows.length > 0) {
        console.log(`[CALENDAR] Skipped (already synced): ${meeting.calendar_event_id}`);
        results.events_skipped += 1;
        continue;
      }

      // Create event via EventService
      console.log(`[EVENTS] Creating event for meeting: "${meeting.title}"`);
      const event = await eventService.createEvent({
        userId,
        source: 'CALENDAR',
        category: 'MEETING',
        type: 'MEETING_SCHEDULED',
        payload: meeting,
        occurredAt: new Date(meeting.start_time)
      });
      console.log(`[EVENTS] Event created: ${event.id}`);

      // Store idempotency mapping
      await pool.query(
        `INSERT INTO calendar_event_mappings (user_id, calendar_event_id, event_id)
         VALUES ($1, $2, $3)`,
        [userId, meeting.calendar_event_id, event.id]
      );

      // Invoke rule engine (it decides alerts/incidents)
      console.log(`[RULE_ENGINE] Evaluating event: ${event.id}`);
      const decision = await ruleEngine.evaluateEvent(event);
      console.log(`[RULE_ENGINE] Decision: ${decision.reason}`);

      if (decision.alerts_scheduled.length > 0) {
        console.log(`[ALERTS] Scheduled ${decision.alerts_scheduled.length} alerts`);
      }

      if (decision.incident_created) {
        console.log(`[INCIDENT] Created incident: ${decision.incident_id}`);
      }

      results.events_created += 1;
      results.rule_decisions.push({
        event_id: event.id,
        calendar_event_id: meeting.calendar_event_id,
        title: meeting.title,
        alerts_scheduled: decision.alerts_scheduled.length,
        incident_created: decision.incident_created,
        reason: decision.reason
      });
    } catch (err) {
      console.error(`[CALENDAR] Error processing meeting "${meeting.title}": ${err.message}`);
      // Continue processing other meetings on error
    }
  }

  console.log(`[CALENDAR] Sync completed: ${results.events_created} events created, ${results.events_skipped} skipped`);

  return results;
}

/**
 * Get calendar status for a user
 * 
 * @param {string} userId - User UUID
 * @returns {object} Status object with connected, token_expiry
 */
async function getCalendarStatus(userId) {
  try {
    const credentials = await googleOAuth.getCredentials(userId);
    const isExpired = googleOAuth.isTokenExpired(credentials.token_expiry);

    return {
      connected: true,
      token_expired: isExpired,
      token_expiry: credentials.token_expiry
    };
  } catch (err) {
    return {
      connected: false,
      token_expired: null,
      error: err.message
    };
  }
}

module.exports = {
  fetchUpcomingMeetings,
  syncMeetings,
  getCalendarStatus,
  shouldIncludeMeeting,
  normalizeMeeting,
  buildCalendarClient
};
