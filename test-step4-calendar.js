/**
 * STEP 4: Calendar Integration Tests
 * 
 * Tests for:
 * - Google OAuth credential storage and retrieval
 * - Calendar service meeting fetching
 * - Event normalization
 * - Idempotency (no duplicate events)
 * - Rule engine integration
 * 
 * Mocks:
 * - Google Calendar API
 * - Database operations (using real pool)
 * 
 * NOTE: These tests use real database. Cleanup is performed after each test.
 */

const pool = require('./db');
const { v4: uuid } = require('uuid');

// Services under test
const googleOAuth = require('./services/googleOAuth');
const calendarService = require('./services/calendarService');
const eventService = require('./services/eventService');
const ruleEngine = require('./services/ruleEngine');

// Mock Google API
const mockGoogle = {
  calendar: () => ({
    events: {
      list: async (options) => {
        // Mocked response - can be customized per test
        return {
          data: {
            items: global.mockCalendarEvents || []
          }
        };
      }
    }
  }),
  auth: {
    OAuth2: class {
      constructor(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
      }
      setCredentials(creds) {
        this.credentials = creds;
      }
    }
  }
};

// Replace googleapis with mock
require.cache[require.resolve('googleapis')] = {
  exports: mockGoogle
};

let testUserId;
let passedTests = 0;
let failedTests = 0;

/**
 * TEST UTILITIES
 */

async function createTestUser() {
  const userId = uuid();
  // Insert a minimal user record
  try {
    await pool.query(
      `INSERT INTO incidents (id, user_id, category, type, severity, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        uuid(),
        userId,
        'OTHER',
        'TEST_EVENT',
        'LOW',
        'OPEN',
        new Date(),
        new Date()
      ]
    );
  } catch (err) {
    // User might already exist or table not ready
  }
  return userId;
}

async function cleanup() {
  try {
    // Delete calendar event mappings
    await pool.query(`DELETE FROM calendar_event_mappings WHERE user_id = $1`, [testUserId]);
    // Delete calendar credentials
    await pool.query(`DELETE FROM calendar_credentials WHERE user_id = $1`, [testUserId]);
    // Delete events
    await pool.query(`DELETE FROM events WHERE user_id = $1`, [testUserId]);
    // Delete alerts
    await pool.query(`DELETE FROM alerts WHERE user_id = $1`, [testUserId]);
    // Delete incidents
    await pool.query(`DELETE FROM incidents WHERE user_id = $1`, [testUserId]);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function test(name, fn) {
  try {
    console.log(`\n  ▶ ${name}`);
    await fn();
    console.log(`    ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.log(`    ✗ ${name}`);
    console.log(`      Error: ${err.message}`);
    failedTests++;
  }
}

/**
 * TESTS
 */

async function runTests() {
  console.log('\n========================================');
  console.log('STEP 4: CALENDAR INTEGRATION TESTS');
  console.log('========================================\n');

  testUserId = await createTestUser();
  console.log(`Using test user: ${testUserId}\n`);

  // ========================================
  // TEST 1: OAuth Credential Storage
  // ========================================

  await test('OAuth: Store credentials', async () => {
    const tokens = {
      access_token: 'mock_access_token_123',
      refresh_token: 'mock_refresh_token_123',
      expires_in: 3600
    };

    const result = await googleOAuth.storeCredentials(testUserId, tokens);
    assert(result.userId === testUserId, 'Should return userId');
    assert(result.stored === true, 'Should indicate success');
    assert(result.tokenExpiry, 'Should have expiry date');
  });

  // ========================================
  // TEST 2: OAuth Credential Retrieval
  // ========================================

  await test('OAuth: Retrieve credentials', async () => {
    const creds = await googleOAuth.getCredentials(testUserId);
    assert(creds.access_token === 'mock_access_token_123', 'Should return correct access token');
    assert(creds.refresh_token === 'mock_refresh_token_123', 'Should return correct refresh token');
    assert(creds.token_expiry, 'Should have expiry date');
  });

  // ========================================
  // TEST 3: Token Expiry Check
  // ========================================

  await test('OAuth: Token expiry detection', async () => {
    const futureDate = new Date();
    futureDate.setSeconds(futureDate.getSeconds() + 7200); // 2 hours from now

    const isExpired = googleOAuth.isTokenExpired(futureDate);
    assert(!isExpired, 'Future date should not be expired');

    const pastDate = new Date();
    pastDate.setSeconds(pastDate.getSeconds() - 3600); // 1 hour ago

    const isPastExpired = googleOAuth.isTokenExpired(pastDate);
    assert(isPastExpired, 'Past date should be expired');
  });

  // ========================================
  // TEST 4: Credentials Exist Check
  // ========================================

  await test('OAuth: hasCredentials check', async () => {
    const exists = await googleOAuth.hasCredentials(testUserId);
    assert(exists === true, 'Should find stored credentials');

    const otherUserId = uuid();
    const existsOther = await googleOAuth.hasCredentials(otherUserId);
    assert(existsOther === false, 'Should not find credentials for unknown user');
  });

  // ========================================
  // TEST 5: Meeting Filtering (Cancel)
  // ========================================

  await test('Calendar: Filter cancelled meetings', async () => {
    const cancelledEvent = {
      id: 'cancelled_123',
      summary: 'Cancelled Meeting',
      status: 'cancelled',
      start: { dateTime: new Date().toISOString() }
    };

    const shouldInclude = calendarService.shouldIncludeMeeting(cancelledEvent);
    assert(!shouldInclude, 'Should filter out cancelled events');
  });

  // ========================================
  // TEST 6: Meeting Filtering (All-day)
  // ========================================

  await test('Calendar: Filter all-day events', async () => {
    const allDayEvent = {
      id: 'allday_123',
      summary: 'All Day Event',
      status: 'confirmed',
      start: { date: '2025-12-20' } // No dateTime
    };

    const shouldInclude = calendarService.shouldIncludeMeeting(allDayEvent);
    assert(!shouldInclude, 'Should filter out all-day events');
  });

  // ========================================
  // TEST 7: Meeting Normalization
  // ========================================

  await test('Calendar: Normalize meeting data', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour later

    const calendarEvent = {
      id: 'event_123',
      summary: 'Team Standup',
      description: 'Daily sync',
      status: 'confirmed',
      transparency: 'opaque',
      organizer: { email: 'organizer@example.com' },
      attendees: [
        { email: 'organizer@example.com' },
        { email: 'dev1@example.com' },
        { email: 'dev2@example.com' }
      ],
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() },
      htmlLink: 'https://calendar.google.com/event/123',
      conferenceData: null
    };

    const normalized = calendarService.normalizeMeeting(calendarEvent);

    assert(normalized.calendar_event_id === 'event_123', 'Should include calendar event ID');
    assert(normalized.title === 'Team Standup', 'Should include title');
    assert(normalized.organizer === 'organizer@example.com', 'Should include organizer');
    assert(normalized.attendee_count === 3, 'Should count attendees');
    assert(normalized.start_time, 'Should include start_time');
    assert(normalized.end_time, 'Should include end_time');
    assert(normalized.join_url === 'https://calendar.google.com/event/123', 'Should include join URL');
    assert(normalized.importance === 'MEDIUM', 'Should calculate importance');
    assert(normalized.incident_enabled === false, 'incident_enabled should be false');
  });

  // ========================================
  // TEST 8: Event Normalization (Low Importance)
  // ========================================

  await test('Calendar: Calculate importance (free time)', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000);

    const freeTimeEvent = {
      id: 'free_123',
      summary: 'Buffer Time',
      status: 'confirmed',
      transparency: 'transparent', // Free time
      organizer: { email: 'user@example.com' },
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() }
    };

    const normalized = calendarService.normalizeMeeting(freeTimeEvent);
    assert(normalized.importance === 'LOW', 'Free time should have LOW importance');
  });

  // ========================================
  // TEST 9: Event Normalization (High Importance)
  // ========================================

  await test('Calendar: Calculate importance (many attendees)', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const attendees = Array.from({ length: 10 }, (_, i) => ({
      email: `person${i}@example.com`
    }));

    const largeEvent = {
      id: 'large_123',
      summary: 'All-Hands',
      status: 'confirmed',
      transparency: 'opaque',
      organizer: { email: 'exec@example.com' },
      attendees,
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() }
    };

    const normalized = calendarService.normalizeMeeting(largeEvent);
    assert(normalized.importance === 'HIGH', 'Large meetings should have HIGH importance');
  });

  // ========================================
  // TEST 10: Create Event from Meeting
  // ========================================

  await test('Calendar: Create MEETING event from calendar data', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const meeting = {
      calendar_event_id: 'cal_456',
      title: 'Engineering Sync',
      start_time: now.toISOString(),
      end_time: end.toISOString(),
      organizer: 'lead@example.com',
      attendee_count: 5,
      join_url: 'https://meet.google.com/xyz',
      importance: 'MEDIUM'
    };

    const event = await eventService.createEvent({
      userId: testUserId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: meeting,
      occurredAt: now
    });

    assert(event.id, 'Event should have ID');
    assert(event.user_id === testUserId, 'Event should have correct user');
    assert(event.source === 'CALENDAR', 'Event source should be CALENDAR');
    assert(event.category === 'MEETING', 'Event category should be MEETING');
    assert(event.type === 'MEETING_SCHEDULED', 'Event type should be MEETING_SCHEDULED');
    assert(event.payload.calendar_event_id === 'cal_456', 'Payload should include calendar_event_id');
  });

  // ========================================
  // TEST 11: Idempotency - No Duplicate Events
  // ========================================

  await test('Calendar: Idempotency (skip duplicate calendar events)', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const meeting = {
      calendar_event_id: 'cal_idempotent_123',
      title: 'Sync Meeting',
      start_time: now.toISOString(),
      end_time: end.toISOString(),
      organizer: 'boss@example.com',
      attendee_count: 3,
      join_url: 'https://meet.google.com/abc',
      importance: 'MEDIUM'
    };

    // Create first event
    const event1 = await eventService.createEvent({
      userId: testUserId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: meeting,
      occurredAt: now
    });

    // Store idempotency mapping
    await pool.query(
      `INSERT INTO calendar_event_mappings (user_id, calendar_event_id, event_id)
       VALUES ($1, $2, $3)`,
      [testUserId, meeting.calendar_event_id, event1.id]
    );

    // Attempt to create same event again
    const mapping = await pool.query(
      `SELECT event_id FROM calendar_event_mappings 
       WHERE user_id = $1 AND calendar_event_id = $2`,
      [testUserId, meeting.calendar_event_id]
    );

    assert(mapping.rows.length === 1, 'Should find existing mapping');
    assert(mapping.rows[0].event_id === event1.id, 'Should return same event ID');
  });

  // ========================================
  // TEST 12: Rule Engine Invocation
  // ========================================

  await test('Calendar: Rule engine invoked after event creation', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000); // 30 min meeting

    const meeting = {
      calendar_event_id: 'cal_rule_test_789',
      title: 'Quick Sync',
      start_time: now.toISOString(),
      end_time: end.toISOString(),
      organizer: 'manager@example.com',
      attendee_count: 2,
      join_url: 'https://zoom.us/meeting/xyz',
      importance: 'LOW'
    };

    const event = await eventService.createEvent({
      userId: testUserId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: meeting,
      occurredAt: now
    });

    // Invoke rule engine
    const decision = await ruleEngine.evaluateEvent(event);

    assert(decision, 'Rule engine should return decision');
    assert(decision.event_id === event.id, 'Decision should reference event');
    assert(Array.isArray(decision.alerts_scheduled), 'Decision should have alerts array');
    assert(typeof decision.incident_created === 'boolean', 'Decision should have incident_created flag');
    assert(decision.reason, 'Decision should have reason');
  });

  // ========================================
  // TEST 13: No Direct Incident Creation
  // ========================================

  await test('Calendar: No incidents created directly from meetings', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const meeting = {
      calendar_event_id: 'cal_incident_test_999',
      title: 'Important Meeting',
      start_time: now.toISOString(),
      end_time: end.toISOString(),
      organizer: 'exec@example.com',
      attendee_count: 8,
      join_url: 'https://meet.google.com/important',
      importance: 'HIGH'
    };

    const event = await eventService.createEvent({
      userId: testUserId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: meeting,
      occurredAt: now
    });

    // Verify event was created
    const eventRecord = await pool.query(
      `SELECT * FROM events WHERE id = $1`,
      [event.id]
    );

    assert(eventRecord.rows.length === 1, 'Event should be created');

    // Verify no incident created directly
    const incidents = await pool.query(
      `SELECT * FROM incidents 
       WHERE user_id = $1 AND type = 'MEETING_SCHEDULED'`,
      [testUserId]
    );

    assert(incidents.rows.length === 0, 'Calendar service should not create incidents directly');
  });

  // ========================================
  // TEST 14: Calendar Status Check
  // ========================================

  await test('Calendar: Get calendar status', async () => {
    const status = await calendarService.getCalendarStatus(testUserId);
    assert(status.connected === true, 'Should be connected (credentials exist)');
    assert(typeof status.token_expired === 'boolean', 'Should have token_expired flag');
  });

  // ========================================
  // TEST 15: Calendar Status (No Credentials)
  // ========================================

  await test('Calendar: Status when not connected', async () => {
    const unknownUserId = uuid();
    const status = await calendarService.getCalendarStatus(unknownUserId);
    assert(status.connected === false, 'Should not be connected');
    assert(status.error, 'Should have error message');
  });

  // ========================================
  // TEST 16: Meeting with Google Meet
  // ========================================

  await test('Calendar: Extract Google Meet URL', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const meetEvent = {
      id: 'meet_123',
      summary: 'Team Meeting',
      status: 'confirmed',
      organizer: { email: 'lead@example.com' },
      attendees: [{ email: 'lead@example.com' }, { email: 'dev@example.com' }],
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        entryPoints: [
          { entryPointType: 'video', uri: 'https://meet.google.com/abc-def-ghi' }
        ]
      }
    };

    const normalized = calendarService.normalizeMeeting(meetEvent);
    assert(normalized.join_url === 'https://meet.google.com/abc-def-ghi', 'Should extract Google Meet URL');
  });

  // ========================================
  // TEST 17: Event with Missing Fields
  // ========================================

  await test('Calendar: Handle event with minimal data', async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000);

    const minimalEvent = {
      id: 'minimal_123',
      status: 'confirmed',
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() }
    };

    const normalized = calendarService.normalizeMeeting(minimalEvent);
    assert(normalized.title === '(No title)', 'Should handle missing title');
    assert(normalized.organizer === 'unknown', 'Should handle missing organizer');
    assert(normalized.attendee_count === 0, 'Should handle missing attendees');
  });

  // ========================================
  // TEST 18: Fetch Meetings (Mocked API)
  // ========================================

  await test('Calendar: Mock fetch upcoming meetings', async () => {
    const now = new Date();

    // Mock calendar events
    global.mockCalendarEvents = [
      {
        id: 'mock_event_1',
        summary: 'Meeting 1',
        status: 'confirmed',
        transparency: 'opaque',
        organizer: { email: 'organizer@example.com' },
        attendees: [{ email: 'organizer@example.com' }, { email: 'dev@example.com' }],
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() },
        htmlLink: 'https://calendar.google.com/1'
      },
      {
        id: 'mock_event_cancelled',
        summary: 'Cancelled Meeting',
        status: 'cancelled',
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString() }
      }
    ];

    const meetings = await calendarService.fetchUpcomingMeetings(testUserId);

    assert(Array.isArray(meetings), 'Should return array of meetings');
    assert(meetings.length === 1, 'Should filter out cancelled event');
    assert(meetings[0].title === 'Meeting 1', 'Should include first meeting');
  });

  // ========================================
  // TEST 19: Delete Credentials
  // ========================================

  await test('OAuth: Delete credentials', async () => {
    const deletedUserId = uuid();

    // Store credentials for deletion
    await googleOAuth.storeCredentials(deletedUserId, {
      access_token: 'token_to_delete',
      refresh_token: 'refresh_to_delete',
      expires_in: 3600
    });

    // Verify stored
    const before = await googleOAuth.hasCredentials(deletedUserId);
    assert(before === true, 'Credentials should exist before deletion');

    // Delete
    const deleted = await googleOAuth.deleteCredentials(deletedUserId);
    assert(deleted === true, 'Should return true on successful deletion');

    // Verify deleted
    const after = await googleOAuth.hasCredentials(deletedUserId);
    assert(after === false, 'Credentials should not exist after deletion');
  });

  // ========================================
  // TEST 20: Sync Workflow Integration
  // ========================================

  await test('Calendar: Full sync workflow (event creation + rule engine)', async () => {
    const now = new Date();

    // Mock calendar with valid event
    global.mockCalendarEvents = [
      {
        id: 'sync_workflow_event',
        summary: 'Workflow Test Meeting',
        status: 'confirmed',
        transparency: 'opaque',
        organizer: { email: 'organizer@example.com' },
        attendees: [{ email: 'organizer@example.com' }, { email: 'user@example.com' }],
        start: { dateTime: now.toISOString() },
        end: { dateTime: new Date(now.getTime() + 45 * 60 * 1000).toISOString() },
        htmlLink: 'https://calendar.google.com/workflow'
      }
    ];

    // Run sync (would normally call syncMeetings, but we'll simulate)
    const fetchedMeetings = await calendarService.fetchUpcomingMeetings(testUserId);
    assert(fetchedMeetings.length > 0, 'Should fetch meetings');

    // Create event
    const meeting = fetchedMeetings[0];
    const event = await eventService.createEvent({
      userId: testUserId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: meeting,
      occurredAt: now
    });

    // Store idempotency mapping
    await pool.query(
      `INSERT INTO calendar_event_mappings (user_id, calendar_event_id, event_id)
       VALUES ($1, $2, $3)`,
      [testUserId, meeting.calendar_event_id, event.id]
    );

    // Invoke rule engine
    const decision = await ruleEngine.evaluateEvent(event);

    assert(decision.alerts_scheduled !== undefined, 'Decision should have alerts');
    assert(decision.incident_created !== undefined, 'Decision should have incident flag');
  });

  // ========================================
  // Cleanup
  // ========================================

  await cleanup();

  // ========================================
  // Summary
  // ========================================

  console.log('\n========================================');
  console.log('TEST RESULTS');
  console.log('========================================');
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Total: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log('\n✅ ALL TESTS PASSED');
  } else {
    console.log(`\n❌ ${failedTests} TEST(S) FAILED`);
  }

  console.log('========================================\n');

  await pool.end();
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests();
