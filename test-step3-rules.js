/**
 * Rule Engine Test Suite
 * 
 * Tests the RuleEngine with focus on:
 * 1. Alert scheduling correctness
 * 2. Incident creation rules (strict/rare)
 * 3. Category-agnostic evaluation
 * 4. No cross-category leakage
 * 5. Never escalates
 * 6. Never resolves incidents
 * 7. Idempotency and safety
 * 
 * Prerequisites:
 * - Database must exist and be connected
 * - Migrations must be applied (events, incidents, alerts tables)
 * - EventService must be available
 * - AlertService must be available
 * - IncidentService must be available
 */

const pool = require('./db');
const ruleEngine = require('./services/ruleEngine');
const eventService = require('./services/eventService');
const alertService = require('./services/alertService');
const incidentService = require('./services/incidentService');
const { v4: uuid } = require('uuid');

// Test tracking
let testsPassed = 0;
let testsFailed = 0;

/**
 * Run a single test
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`✗ FAIL: ${name}`);
    console.log(`  Error: ${err.message}`);
    testsFailed++;
  }
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Create test user
 */
async function createTestUser() {
  const userId = uuid();
  await pool.query(
    'INSERT INTO users (id, email) VALUES ($1, $2)',
    [userId, `test-${Date.now()}@example.com`]
  );
  return userId;
}

/**
 * Create test event
 */
async function createTestEvent(userId, category, type, payload = {}, occurredAt = null) {
  const eventId = uuid();
  const eventOccurredAt = occurredAt || new Date();

  await pool.query(
    `INSERT INTO events (id, user_id, source, category, type, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      eventId,
      userId,
      'MANUAL',
      category,
      type,
      JSON.stringify(payload),
      eventOccurredAt
    ]
  );

  return {
    id: eventId,
    user_id: userId,
    source: 'MANUAL',
    category,
    type,
    payload,
    occurred_at: eventOccurredAt
  };
}

/**
 * Cleanup test data
 */
async function cleanup(userId) {
  // Delete incidents
  const incidentsResult = await pool.query(
    'SELECT id FROM incidents WHERE user_id = $1',
    [userId]
  );
  for (const incident of incidentsResult.rows) {
    await pool.query('DELETE FROM escalations WHERE incident_id = $1', [incident.id]);
  }

  await pool.query('DELETE FROM incidents WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM alerts WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM events WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('RULE ENGINE TEST SUITE');
  console.log('='.repeat(60));

  let testUserId;

  try {
    // Setup: Create test user
    console.log('\n[SETUP] Creating test user...');
    testUserId = await createTestUser();
    console.log(`[SETUP] Test user created: ${testUserId.substring(0, 8)}`);

    // ========== ALERT RULE TESTS ==========

    // Test 1: MEETING alert rule - upcoming
    await test('MEETING alert: schedule alert for upcoming meeting', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, futureTime);

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.alerts_scheduled.length > 0, 'At least one alert scheduled');

      const upcomingAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'MEETING_UPCOMING'
      );
      assert(upcomingAlert, 'MEETING_UPCOMING alert found');

      // Alert should be scheduled 30 minutes before the meeting
      const expectedTime = new Date(futureTime);
      expectedTime.setMinutes(expectedTime.getMinutes() - 30);
      const timeDiff = Math.abs(new Date(upcomingAlert.scheduled_at) - expectedTime);
      assert(timeDiff < 1000, 'Alert scheduled at correct time (30 min before)');
    });

    // Test 2: MEETING alert rule - missed
    await test('MEETING alert: schedule alert for missed meeting', async () => {
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_MISSED', {
        status: 'MISSED'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      const missedAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'MEETING_MISSED'
      );
      assert(missedAlert, 'MEETING_MISSED alert found');
      assert(!decision.incident_created, 'No incident created (meeting alert rules only)');
    });

    // Test 3: FINANCE alert rule - payment due soon
    await test('FINANCE alert: schedule alert for payment due soon', async () => {
      const futureTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
      const event = await createTestEvent(testUserId, 'FINANCE', 'PAYMENT_DUE', {
        type: 'PAYMENT_DUE',
        amount_usd: 1000
      }, futureTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const paymentAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'PAYMENT_DUE_SOON'
      );
      assert(paymentAlert, 'PAYMENT_DUE_SOON alert found');
    });

    // Test 4: HEALTH alert rule - medication reminder
    await test('HEALTH alert: schedule alert for medication reminder', async () => {
      const event = await createTestEvent(testUserId, 'HEALTH', 'MEDICATION', {
        type: 'MEDICATION_REMINDER'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      const medAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'MEDICATION_TIME'
      );
      assert(medAlert, 'MEDICATION_TIME alert found');
    });

    // Test 5: DELIVERY alert rule - delivery arriving
    await test('DELIVERY alert: schedule alert for delivery arriving', async () => {
      const event = await createTestEvent(testUserId, 'DELIVERY', 'DELIVERY_STATUS', {
        status: 'ARRIVING_SOON'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      const deliveryAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'DELIVERY_ARRIVING'
      );
      assert(deliveryAlert, 'DELIVERY_ARRIVING alert found');
    });

    // Test 6: SECURITY alert rule - security warning
    await test('SECURITY alert: schedule alert for security event', async () => {
      const event = await createTestEvent(testUserId, 'SECURITY', 'SECURITY_EVENT', {
        event_type: 'SUSPICIOUS_LOGIN'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      const securityAlert = decision.alerts_scheduled.find(
        a => a.alert_type === 'SECURITY_WARNING'
      );
      assert(securityAlert, 'SECURITY_WARNING alert found');
    });

    // ========== INCIDENT RULE TESTS ==========

    // Test 7: FINANCE incident - large payment failure
    await test('FINANCE incident: create incident for large payment failure', async () => {
      const event = await createTestEvent(testUserId, 'FINANCE', 'PAYMENT_FAILED', {
        status: 'FAILED',
        amount_usd: 10000
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.incident_created, 'Incident created for large payment failure');
      assert(decision.incident_id, 'Incident ID exists');

      // Verify incident was created in database
      const incident = await pool.query(
        'SELECT * FROM incidents WHERE id = $1',
        [decision.incident_id]
      );
      assert(incident.rows.length > 0, 'Incident exists in database');
      assert(incident.rows[0].severity === 'HIGH', 'Incident has HIGH severity');
      assert(incident.rows[0].consequence === 'FINANCIAL_IMPACT', 'Incident has correct consequence');
    });

    // Test 8: FINANCE incident - small payment failure (no incident)
    await test('FINANCE incident: no incident for small payment failure', async () => {
      const event = await createTestEvent(testUserId, 'FINANCE', 'PAYMENT_FAILED', {
        status: 'FAILED',
        amount_usd: 100 // Below 5000 threshold
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(!decision.incident_created, 'No incident created for small payment');
    });

    // Test 9: HEALTH incident - health emergency
    await test('HEALTH incident: create incident for health emergency', async () => {
      const event = await createTestEvent(testUserId, 'HEALTH', 'EMERGENCY', {
        urgency: 'EMERGENCY',
        type: 'SEVERE_ALLERGY'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.incident_created, 'Incident created for health emergency');
      const incident = await pool.query(
        'SELECT * FROM incidents WHERE id = $1',
        [decision.incident_id]
      );
      assert(incident.rows[0].severity === 'CRITICAL', 'Incident has CRITICAL severity');
      assert(incident.rows[0].consequence === 'HEALTH_RISK', 'Incident has correct consequence');
    });

    // Test 10: DELIVERY incident - lost package
    await test('DELIVERY incident: create incident for lost package', async () => {
      const event = await createTestEvent(testUserId, 'DELIVERY', 'LOST', {
        status: 'LOST',
        order_id: 'ORDER123'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.incident_created, 'Incident created for lost package');
      const incident = await pool.query(
        'SELECT * FROM incidents WHERE id = $1',
        [decision.incident_id]
      );
      assert(incident.rows[0].severity === 'MEDIUM', 'Incident has MEDIUM severity');
    });

    // Test 11: SECURITY incident - unauthorized access
    await test('SECURITY incident: create incident for unauthorized access', async () => {
      const event = await createTestEvent(testUserId, 'SECURITY', 'UNAUTHORIZED', {
        event_type: 'UNAUTHORIZED_ACCESS',
        ip_address: '192.168.1.1'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.incident_created, 'Incident created for unauthorized access');
      const incident = await pool.query(
        'SELECT * FROM incidents WHERE id = $1',
        [decision.incident_id]
      );
      assert(incident.rows[0].severity === 'CRITICAL', 'Incident has CRITICAL severity');
      assert(incident.rows[0].consequence === 'SECURITY_BREACH', 'Incident has correct consequence');
    });

    // ========== CATEGORY-AGNOSTIC TESTS ==========

    // Test 12: Multiple categories work independently
    await test('Multiple categories: evaluate across different categories', async () => {
      const meetingEvent = await createTestEvent(testUserId, 'MEETING', 'TEST', { status: 'SCHEDULED' });
      const financeEvent = await createTestEvent(testUserId, 'FINANCE', 'TEST', { status: 'FAILED', amount_usd: 10000 });
      const healthEvent = await createTestEvent(testUserId, 'HEALTH', 'TEST', { urgency: 'EMERGENCY', type: 'OTHER' });

      const meetingDecision = await ruleEngine.evaluateEvent(meetingEvent);
      const financeDecision = await ruleEngine.evaluateEvent(financeEvent);
      const healthDecision = await ruleEngine.evaluateEvent(healthEvent);

      assert(meetingDecision.alerts_scheduled.length > 0, 'MEETING category works');
      assert(financeDecision.incident_created, 'FINANCE category works');
      assert(healthDecision.incident_created, 'HEALTH category works');
    });

    // Test 13: No cross-category leakage
    await test('Category isolation: events don\'t match wrong category rules', async () => {
      // Create a MEETING event and verify FINANCE incident rule doesn't trigger
      const event = await createTestEvent(testUserId, 'MEETING', 'TEST', {
        status: 'SCHEDULED'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      // MEETING incident rule is disabled, so no incident should be created
      assert(!decision.incident_created, 'No incident for MEETING (rule disabled)');
    });

    // ========== SAFETY TESTS ==========

    // Test 14: Never escalates
    await test('Safety: rule engine never escalates', async () => {
      const event = await createTestEvent(testUserId, 'SECURITY', 'CRITICAL', {
        event_type: 'UNAUTHORIZED_ACCESS'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      if (decision.incident_created) {
        // If incident was created, verify no escalations exist
        const escalations = await pool.query(
          `SELECT * FROM escalations 
           WHERE incident_id = $1`,
          [decision.incident_id]
        );
        assert(escalations.rows.length === 0, 'No escalations created by rule engine');
      }
    });

    // Test 15: Never resolves incidents
    await test('Safety: rule engine never resolves incidents', async () => {
      const event = await createTestEvent(testUserId, 'DELIVERY', 'LOST', {
        status: 'LOST'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      if (decision.incident_created) {
        const incident = await pool.query(
          'SELECT * FROM incidents WHERE id = $1',
          [decision.incident_id]
        );
        assert(incident.rows[0].state === 'OPEN', 'Incident remains OPEN (not resolved)');
        assert(incident.rows[0].resolved_at === null, 'No resolved_at timestamp');
      }
    });

    // ========== IDEMPOTENCY TESTS ==========

    // Test 16: Idempotency - same event can be re-evaluated safely
    await test('Idempotency: re-evaluating same event creates multiple alerts', async () => {
      const event = await createTestEvent(testUserId, 'MEETING', 'TEST_IDEMPOTENT', {
        status: 'SCHEDULED'
      });

      const decision1 = await ruleEngine.evaluateEvent(event);
      const decision2 = await ruleEngine.evaluateEvent(event);

      // Each evaluation should schedule alerts
      assert(decision1.alerts_scheduled.length > 0, 'First evaluation schedules alerts');
      assert(decision2.alerts_scheduled.length > 0, 'Second evaluation schedules alerts');

      // Alerts should have different IDs (separate records)
      const alert1Id = decision1.alerts_scheduled[0].id;
      const alert2Id = decision2.alerts_scheduled[0].id;
      assert(alert1Id !== alert2Id, 'Different alert IDs (separate records)');
    });

    // Test 17: Decision report structure
    await test('Decision report: has all required fields', async () => {
      const event = await createTestEvent(testUserId, 'MEETING', 'TEST_REPORT', {
        status: 'SCHEDULED'
      });

      const decision = await ruleEngine.evaluateEvent(event);

      assert(decision.event_id === event.id, 'event_id matches');
      assert(decision.event_category === 'MEETING', 'event_category set');
      assert(Array.isArray(decision.alerts_scheduled), 'alerts_scheduled is array');
      assert(typeof decision.incident_created === 'boolean', 'incident_created is boolean');
      assert(decision.reason, 'reason provided');
      assert(decision.timestamp, 'timestamp set');
      assert(Array.isArray(decision.evaluatedAlertRules), 'evaluatedAlertRules is array');
      assert(decision.evaluatedIncidentRule, 'evaluatedIncidentRule exists');
    });

    // Test 18: Time offset calculations
    await test('Time offsets: alert scheduled at correct time relative to event', async () => {
      const eventTime = new Date('2025-12-25T10:00:00Z');
      const event = await createTestEvent(testUserId, 'MEETING', 'TEST_OFFSET', {
        status: 'SCHEDULED'
      }, eventTime);

      const decision = await ruleEngine.evaluateEvent(event);
      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');

      // Should be scheduled 30 minutes before
      const expectedTime = new Date(eventTime);
      expectedTime.setMinutes(expectedTime.getMinutes() - 30);

      const actualTime = new Date(alert.scheduled_at);
      const diff = Math.abs(actualTime - expectedTime);

      assert(diff < 1000, `Alert scheduled at correct offset (diff: ${diff}ms)`);
    });

    // Test 19: Condition evaluation - complex payload
    await test('Conditions: complex payload evaluation works', async () => {
      const event = await createTestEvent(testUserId, 'FINANCE', 'TEST_COMPLEX', {
        status: 'FAILED',
        amount_usd: 6000,
        currency: 'USD',
        nested: {
          error_code: 'INSUFFICIENT_FUNDS'
        }
      });

      const decision = await ruleEngine.evaluateEvent(event);

      // Should trigger incident (amount > 5000)
      assert(decision.incident_created, 'Incident created with complex payload');
    });

    // Test 20: Invalid event handling
    await test('Error handling: invalid event rejected', async () => {
      try {
        await ruleEngine.evaluateEvent({
          // Missing required fields
          id: uuid(),
          // user_id missing
          // category missing
        });
        throw new Error('Should have thrown error');
      } catch (err) {
        assert(err.message.includes('Invalid event'), 'Invalid event detected');
      }
    });

    // ========== TIME WINDOW TESTS (TASK 9) ==========

    // Test 21: Meeting 10 minutes away — alert scheduled
    await test('TIME WINDOW: Meeting 10 minutes away — alert scheduled', async () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, futureTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(alert, 'MEETING_UPCOMING alert scheduled');
      
      // Check decision reasons
      const alertDetail = decision.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && alertDetail.reason.includes('alert scheduled'), 
        `Reason should explain alert scheduled: ${alertDetail?.reason}`);
    });

    // Test 22: Meeting 2 minutes away — alert scheduled
    await test('TIME WINDOW: Meeting 2 minutes away — alert scheduled', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, futureTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(alert, 'MEETING_UPCOMING alert scheduled (2 min away)');
      
      const alertDetail = decision.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && alertDetail.reason.includes('alert scheduled'), 
        `Reason should explain alert scheduled: ${alertDetail?.reason}`);
    });

    // Test 23: Meeting 30 seconds away — NO alert (too close)
    await test('TIME WINDOW: Meeting 30 seconds away — NO alert (too close)', async () => {
      const futureTime = new Date(Date.now() + 30 * 1000); // 30 seconds from now
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, futureTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(!alert, 'NO alert scheduled (meeting too close)');
      
      const alertDetail = decision.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && 
        (alertDetail.reason.includes('too close') || alertDetail.reason.includes('actionable')), 
        `Reason should explain too close: ${alertDetail?.reason}`);
    });

    // Test 24: Double sync in window — only ONE alert
    await test('TIME WINDOW: Double sync in alert window — only ONE alert (idempotency)', async () => {
      const futureTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, futureTime);

      // First sync
      const decision1 = await ruleEngine.evaluateEvent(event);
      const alert1 = decision1.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(alert1, 'First sync: alert scheduled');
      const alertId1 = alert1.id;

      // Second sync (immediately after) — should NOT create duplicate
      const decision2 = await ruleEngine.evaluateEvent(event);
      const alert2 = decision2.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      
      // Either no alert scheduled, or same alert ID
      if (alert2) {
        assert(alert2.id === alertId1, 'Second sync should return same alert (no duplicate)');
      }
      
      const alertDetail = decision2.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && alertDetail.reason.includes('already scheduled'), 
        `Reason should explain already scheduled: ${alertDetail?.reason}`);
    });

    // Test 25: Meeting already started — no alert
    await test('TIME WINDOW: Meeting already started — no alert', async () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, pastTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(!alert, 'NO alert scheduled (meeting already started)');
      
      const alertDetail = decision.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && alertDetail.reason.includes('outside alert window'), 
        `Reason should explain outside window: ${alertDetail?.reason}`);
    });

    // Test 26: Sync at 4:49 for 4:51 meeting — MUST alert (late-but-valid window)
    await test('TIME WINDOW: Sync at T-2min for T meeting — alert scheduled (late-but-valid)', async () => {
      const meetingTime = new Date(Date.now() + 2 * 60 * 1000); // Meeting in 2 min
      const event = await createTestEvent(testUserId, 'MEETING', 'MEETING_SCHEDULED', {
        status: 'SCHEDULED'
      }, meetingTime);

      const decision = await ruleEngine.evaluateEvent(event);

      const alert = decision.alerts_scheduled.find(a => a.alert_type === 'MEETING_UPCOMING');
      assert(alert, 'MEETING_UPCOMING alert scheduled (sync at T-2min)');
      
      const alertDetail = decision.evaluatedAlertRules.find(r => r.ruleName === 'meeting_upcoming');
      assert(alertDetail && alertDetail.reason && alertDetail.reason.includes('alert scheduled'), 
        `Reason should explain alert scheduled: ${alertDetail?.reason}`);
    });


  } finally {
    // Cleanup
    if (testUserId) {
      console.log('\n[CLEANUP] Removing test data...');
      await cleanup(testUserId);
      console.log('[CLEANUP] Test data removed');
    }

    // Close pool
    await pool.end();
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Total:  ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED');
  } else {
    console.log(`\n❌ ${testsFailed} test(s) failed`);
  }

  process.exit(testsFailed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
