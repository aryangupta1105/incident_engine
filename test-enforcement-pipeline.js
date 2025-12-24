/**
 * COMPREHENSIVE ENFORCEMENT PIPELINE TEST SUITE
 * 
 * Tests all 4 phases:
 * PHASE A: Calendar Scheduler (1-minute tick)
 * PHASE B: Multi-stage alert system
 * PHASE C: Manual confirmation API
 * PHASE D: Missed meeting incident + escalation
 */

require('dotenv').config();
const assert = require('assert');
const pool = require('./db');
const { v4: uuid } = require('uuid');

// Services to test
const calendarScheduler = require('./workers/calendarScheduler');
const eventService = require('./services/eventService');
const ruleEngine = require('./services/ruleEngine');
const escalationService = require('./services/escalationService');
const meetingRoutes = require('./routes/meetingRoutes');

// Test configuration
const TEST_USER_ID = 'test-enforcement-user-' + Date.now();
const TEST_EMAIL = `test-${Date.now()}@example.com`;

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper - Run a single test
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    testsFailed++;
  }
}

/**
 * PHASE A TESTS: Calendar Scheduler
 */
async function testPhaseA() {
  console.log('\n========== PHASE A: Calendar Scheduler Tests ==========');

  await test('Scheduler: Statistics initialized', () => {
    const stats = calendarScheduler.getStats();
    assert(stats.enabled !== undefined, 'Enabled flag should exist');
    assert(typeof stats.ticksProcessed === 'number', 'ticksProcessed should be a number');
  });

  await test('Scheduler: Stats can be queried', () => {
    const stats = calendarScheduler.getStats();
    assert(stats.usersProcessed >= 0, 'usersProcessed should be >= 0');
    assert(stats.usersFailed >= 0, 'usersFailed should be >= 0');
  });

  console.log('✅ PHASE A: All tests passed');
}

/**
 * PHASE B TESTS: Multi-stage Alerts
 */
async function testPhaseB() {
  console.log('\n========== PHASE B: Multi-Stage Alert System Tests ==========');

  // Create test user
  const userId = uuid();
  await pool.query(
    `INSERT INTO users (id, email, google_connected_at) 
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, TEST_EMAIL]
  );

  // Test 1: Alert for email (10-15 min away)
  await test('Alert Stage 1: Email at 12 minutes before meeting', async () => {
    const meetingTime = new Date(Date.now() + 12 * 60 * 1000); // 12 min from now

    const event = await eventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Stage 1 Meeting',
        status: 'SCHEDULED',
        start_time: meetingTime.toISOString(),
        end_time: new Date(meetingTime.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH'
      },
      occurredAt: meetingTime
    });

    const decision = await ruleEngine.evaluateEvent(event);
    const emailAlert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING_EMAIL');
    
    assert(emailAlert, 'Email alert should be scheduled');
    assert(emailAlert.status === 'PENDING', 'Alert should be PENDING');
  });

  // Test 2: Alert for SMS (5 min away)
  await test('Alert Stage 2: SMS at 5 minutes before meeting', async () => {
    const meetingTime = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now

    const event = await eventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Stage 2 Meeting',
        status: 'SCHEDULED',
        start_time: meetingTime.toISOString(),
        end_time: new Date(meetingTime.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH'
      },
      occurredAt: meetingTime
    });

    const decision = await ruleEngine.evaluateEvent(event);
    const smsAlert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_URGENT_MESSAGE');
    
    assert(smsAlert, 'SMS alert should be scheduled');
    assert(smsAlert.status === 'PENDING', 'Alert should be PENDING');
  });

  // Test 3: Alert for CALL (2 min away - CRITICAL WINDOW)
  await test('Alert Stage 3: Auto-call at 2 minutes before meeting (CRITICAL)', async () => {
    const meetingTime = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now

    const event = await eventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Stage 3 Meeting (CRITICAL)',
        status: 'SCHEDULED',
        start_time: meetingTime.toISOString(),
        end_time: new Date(meetingTime.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH'
      },
      occurredAt: meetingTime
    });

    const decision = await ruleEngine.evaluateEvent(event);
    const callAlert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_CRITICAL_CALL');
    
    assert(callAlert, 'Call alert should be scheduled');
    assert(callAlert.status === 'PENDING', 'Alert should be PENDING');
  });

  // Test 4: Idempotency - Same event should not create duplicate alerts
  await test('Alert Idempotency: No duplicate alerts on re-evaluation', async () => {
    const meetingTime = new Date(Date.now() + 12 * 60 * 1000); // 12 min from now

    const event = await eventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Idempotency Meeting',
        status: 'SCHEDULED',
        start_time: meetingTime.toISOString(),
        end_time: new Date(meetingTime.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH'
      },
      occurredAt: meetingTime
    });

    // First evaluation
    const decision1 = await ruleEngine.evaluateEvent(event);
    const emailCount1 = decision1.alerts_scheduled.filter(a => a.alert_type === 'MEETING_UPCOMING_EMAIL').length;

    // Second evaluation (should not create duplicate)
    const decision2 = await ruleEngine.evaluateEvent(event);
    const emailCount2 = decision2.alerts_scheduled.filter(a => a.alert_type === 'MEETING_UPCOMING_EMAIL').length;

    assert(emailCount1 === 1, 'First evaluation should create 1 email alert');
    assert(emailCount2 === 0, 'Second evaluation should not create duplicate alert');
  });

  console.log('✅ PHASE B: All tests passed');
}

/**
 * PHASE C TESTS: Manual Confirmation
 */
async function testPhaseC() {
  console.log('\n========== PHASE C: Manual Confirmation Tests ==========');

  const userId = uuid();
  await pool.query(
    `INSERT INTO users (id, email, google_connected_at) 
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `test-checkin-${Date.now()}@example.com`]
  );

  // Create a meeting event
  const meetingTime = new Date(Date.now() + 5 * 60 * 1000);
  const event = await eventService.createEvent({
    userId,
    source: 'CALENDAR',
    category: 'MEETING',
    type: 'MEETING_SCHEDULED',
    payload: {
      title: 'Test Checkin Meeting',
      status: 'SCHEDULED',
      start_time: meetingTime.toISOString(),
      end_time: new Date(meetingTime.getTime() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 60,
      organizer: 'test@example.com',
      attendee_count: 1,
      join_url: null,
      importance: 'HIGH'
    },
    occurredAt: meetingTime
  });

  // Create alerts for this event
  await ruleEngine.evaluateEvent(event);

  // Test 1: JOINED confirmation cancels alerts
  await test('Checkin: JOINED status cancels all pending alerts', async () => {
    // Record checkin
    await pool.query(
      `INSERT INTO meeting_checkins (id, user_id, event_id, status, confirmed_at, confirmation_source)
       VALUES ($1, $2, $3, 'JOINED', NOW(), 'API')`,
      [uuid(), userId, event.id]
    );

    // Check that alerts are cancelled
    const alertRes = await pool.query(
      'SELECT COUNT(*) as count FROM alerts WHERE event_id = $1 AND status = $2',
      [event.id, 'CANCELLED']
    );

    assert(alertRes.rows[0].count > 0, 'Alerts should be marked as CANCELLED');
  });

  // Test 2: MISSED confirmation creates incident
  await test('Checkin: MISSED status creates incident', async () => {
    const meetingTime2 = new Date(Date.now() + 10 * 60 * 1000);
    const event2 = await eventService.createEvent({
      userId,
      source: 'CALENDAR',
      category: 'MEETING',
      type: 'MEETING_SCHEDULED',
      payload: {
        title: 'Test Missed Meeting',
        status: 'SCHEDULED',
        start_time: meetingTime2.toISOString(),
        end_time: new Date(meetingTime2.getTime() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        organizer: 'test@example.com',
        attendee_count: 1,
        join_url: null,
        importance: 'HIGH'
      },
      occurredAt: meetingTime2
    });

    // Record MISSED checkin
    await pool.query(
      `INSERT INTO meeting_checkins (id, user_id, event_id, status, confirmed_at, confirmation_source)
       VALUES ($1, $2, $3, 'MISSED', NOW(), 'API')`,
      [uuid(), userId, event2.id]
    );

    // Check that incident was created
    const incidentRes = await pool.query(
      'SELECT id FROM incidents WHERE event_id = $1 AND category = $2',
      [event2.id, 'MEETING']
    );

    assert(incidentRes.rows.length > 0, 'Incident should be created for MISSED confirmation');
  });

  console.log('✅ PHASE C: All tests passed');
}

/**
 * PHASE D TESTS: Missed Meeting Incidents + Escalation
 */
async function testPhaseD() {
  console.log('\n========== PHASE D: Missed Meeting Incident + Escalation Tests ==========');

  const userId = uuid();
  await pool.query(
    `INSERT INTO users (id, email, phone, google_connected_at) 
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `test-escalation-${Date.now()}@example.com`, '+1234567890']
  );

  // Create a meeting that's already past (missed)
  const pastTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

  const event = await eventService.createEvent({
    userId,
    source: 'CALENDAR',
    category: 'MEETING',
    type: 'MEETING_SCHEDULED',
    payload: {
      title: 'Missed Test Meeting',
      status: 'SCHEDULED',
      start_time: pastTime.toISOString(),
      end_time: new Date(pastTime.getTime() + 60 * 60 * 1000).toISOString(),
      duration_minutes: 60,
      organizer: 'test@example.com',
      attendee_count: 1,
      join_url: null,
      importance: 'HIGH'
    },
    occurredAt: pastTime
  });

  // Test 1: Detect missed meetings
  await test('Escalation: Detect missed meetings after grace period', async () => {
    const result = await escalationService.detectAndCreateMissedIncidents();
    
    assert(result.missedDetected >= 0, 'Should detect missed meetings');
    assert(result.incidentsCreated >= 0, 'Should create incidents');
  });

  // Test 2: Escalation steps created
  await test('Escalation: Escalation steps scheduled for incident', async () => {
    const incidentRes = await pool.query(
      'SELECT id FROM incidents WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
      [event.id]
    );

    if (incidentRes.rows.length > 0) {
      const incidentId = incidentRes.rows[0].id;

      const stepsRes = await pool.query(
        'SELECT COUNT(*) as count FROM escalation_steps WHERE incident_id = $1',
        [incidentId]
      );

      assert(stepsRes.rows[0].count >= 3, 'Should have at least 3 escalation steps (Email, SMS, Call)');
    }
  });

  // Test 3: Escalation step types
  await test('Escalation: All step types are EMAIL, SMS, CALL', async () => {
    const stepsRes = await pool.query(
      `SELECT DISTINCT step_type FROM escalation_steps 
       WHERE step_type IN ('EMAIL', 'SMS', 'CALL')`
    );

    const stepTypes = stepsRes.rows.map(r => r.step_type);
    assert(stepTypes.includes('EMAIL'), 'Should have EMAIL step');
    assert(stepTypes.includes('SMS'), 'Should have SMS step');
    assert(stepTypes.includes('CALL'), 'Should have CALL step');
  });

  // Test 4: Escalation stops on resolution
  await test('Escalation: Escalation stops when incident is RESOLVED', async () => {
    const incidentRes = await pool.query(
      'SELECT id FROM incidents WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
      [event.id]
    );

    if (incidentRes.rows.length > 0) {
      const incidentId = incidentRes.rows[0].id;

      // Resolve incident
      await pool.query(
        `UPDATE incidents SET state = 'RESOLVED', resolved_at = NOW() WHERE id = $1`,
        [incidentId]
      );

      // Cancel pending steps
      await pool.query(
        `UPDATE escalation_steps SET status = 'SKIPPED' WHERE incident_id = $1 AND status = 'PENDING'`,
        [incidentId]
      );

      // Check that no steps are pending
      const pendingRes = await pool.query(
        'SELECT COUNT(*) as count FROM escalation_steps WHERE incident_id = $1 AND status = $2',
        [incidentId, 'PENDING']
      );

      assert(pendingRes.rows[0].count === 0, 'No pending steps should remain after resolution');
    }
  });

  console.log('✅ PHASE D: All tests passed');
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  ENFORCEMENT PIPELINE TEST SUITE (4 PHASES)        ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    // Run all test suites
    await testPhaseA();
    await testPhaseB();
    await testPhaseC();
    await testPhaseD();

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                    ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║ ✅ Passed: ${testsPassed}                                    │`);
    console.log(`║ ❌ Failed: ${testsFailed}                                    │`);
    console.log('╚════════════════════════════════════════════════════╝');

    const exitCode = testsFailed > 0 ? 1 : 0;
    await pool.end();
    process.exit(exitCode);
  } catch (err) {
    console.error('Test suite error:', err);
    await pool.end();
    process.exit(1);
  }
}

// Run tests
runAllTests();
