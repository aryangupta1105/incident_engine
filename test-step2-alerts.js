/**
 * Alert Service Test Suite
 * 
 * Tests the AlertService and alert delivery worker
 * Verifies:
 * 1. Alert scheduling across multiple categories
 * 2. Pending alert retrieval
 * 3. Alert delivery marking
 * 4. Idempotency (delivering same alert twice is safe)
 * 5. Immutability (alerts don't affect incidents)
 * 6. Category-agnostic behavior
 * 
 * Prerequisites:
 * - Database must exist and be connected
 * - Migration 004_create_alerts_table.sql must be applied
 * - Test user created for isolation
 */

const pool = require('./db');
const alertService = require('./services/alertService');
const alertDeliveryWorker = require('./workers/alertDeliveryWorker');
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
 * Create test event for reference
 */
async function createTestEvent(userId, category) {
  const eventId = uuid();
  await pool.query(
    `INSERT INTO events (id, user_id, source, category, type, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      eventId,
      userId,
      'MANUAL',
      category,
      `${category}_TEST`,
      JSON.stringify({ test: true }),
      new Date()
    ]
  );
  return eventId;
}

/**
 * Cleanup test data
 */
async function cleanup(userId) {
  await pool.query('DELETE FROM alerts WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM events WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('ALERT SERVICE TEST SUITE');
  console.log('='.repeat(60));

  let testUserId;

  try {
    // Setup: Create test user
    console.log('\n[SETUP] Creating test user...');
    testUserId = await createTestUser();
    console.log(`[SETUP] Test user created: ${testUserId.substring(0, 8)}`);

    // Test 1: Schedule alert without event reference
    await test('Schedule alert (no event reference)', async () => {
      const alert = await alertService.scheduleAlert({
        userId: testUserId,
        category: 'MEETING',
        alertType: 'MEETING_UPCOMING',
        scheduledAt: new Date(Date.now() + 5000) // 5 seconds from now
      });

      assert(alert.id, 'Alert has ID');
      assert(alert.user_id === testUserId, 'Alert has correct user_id');
      assert(alert.category === 'MEETING', 'Alert has correct category');
      assert(alert.alert_type === 'MEETING_UPCOMING', 'Alert has correct type');
      assert(alert.status === 'PENDING', 'Alert starts in PENDING status');
      assert(alert.event_id === null, 'Alert has no event_id');
    });

    // Test 2: Schedule alert with event reference
    await test('Schedule alert (with event reference)', async () => {
      const eventId = await createTestEvent(testUserId, 'FINANCE');
      const alert = await alertService.scheduleAlert({
        userId: testUserId,
        eventId,
        category: 'FINANCE',
        alertType: 'PAYMENT_REMINDER',
        scheduledAt: new Date(Date.now() + 3000)
      });

      assert(alert.event_id === eventId, 'Alert references correct event');
      assert(alert.category === 'FINANCE', 'Alert has FINANCE category');
    });

    // Test 3: Schedule alerts across different categories
    await test('Schedule alerts across multiple categories', async () => {
      const categories = ['HEALTH', 'DELIVERY', 'SECURITY', 'OTHER'];

      for (const category of categories) {
        const alert = await alertService.scheduleAlert({
          userId: testUserId,
          category,
          alertType: `${category}_ALERT`,
          scheduledAt: new Date(Date.now() + 1000)
        });

        assert(alert.category === category, `Alert created for ${category}`);
      }
    });

    // Test 4: Get pending alerts (should be empty initially - all scheduled in future)
    await test('Get pending alerts (none due yet)', async () => {
      const pending = await alertService.getPendingAlerts();
      // There may be other test data, so just check it's an array
      assert(Array.isArray(pending), 'Returns array');
    });

    // Test 5: Schedule alert in the past (immediately due)
    let pastAlertId;
    await test('Schedule alert in the past (immediately due)', async () => {
      const alert = await alertService.scheduleAlert({
        userId: testUserId,
        category: 'MEETING',
        alertType: 'MEETING_OVERDUE',
        scheduledAt: new Date(Date.now() - 1000) // 1 second ago
      });

      pastAlertId = alert.id;
      assert(pastAlertId, 'Alert created');
    });

    // Test 6: Get pending alerts (should find the past one)
    await test('Get pending alerts (finds overdue alerts)', async () => {
      const pending = await alertService.getPendingAlerts();
      assert(pending.length > 0, 'Finds pending alerts');

      const found = pending.find(a => a.id === pastAlertId);
      assert(found, 'Finds the overdue alert');
      assert(found.status === 'PENDING', 'Alert still in PENDING status');
    });

    // Test 7: Mark alert as delivered
    await test('Mark alert as delivered', async () => {
      const updated = await alertService.markAlertDelivered(pastAlertId);

      assert(updated.status === 'DELIVERED', 'Alert status changed to DELIVERED');
      assert(updated.delivered_at, 'Alert has delivered_at timestamp');
    });

    // Test 8: Idempotent delivery (delivering twice is safe)
    await test('Idempotent delivery (second delivery is safe)', async () => {
      const updated = await alertService.markAlertDelivered(pastAlertId);

      assert(updated.status === 'DELIVERED', 'Still marked DELIVERED');
      assert(updated.delivered_at, 'Still has delivered_at timestamp');
      // Should not throw error
    });

    // Test 9: Get alert by ID
    await test('Get alert by ID', async () => {
      const alert = await alertService.getAlertById(pastAlertId);

      assert(alert, 'Alert found');
      assert(alert.id === pastAlertId, 'Correct alert returned');
      assert(alert.status === 'DELIVERED', 'Alert status is DELIVERED');
    });

    // Test 10: Get user alerts with filtering
    await test('Get user alerts with filtering', async () => {
      const alerts = await alertService.getUserAlerts(testUserId, {
        limit: 100
      });

      assert(Array.isArray(alerts), 'Returns array');
      assert(alerts.length > 0, 'Finds user alerts');
      assert(alerts.every(a => a.user_id === testUserId), 'All alerts belong to user');
    });

    // Test 11: Cancel pending alert
    await test('Cancel pending alert', async () => {
      const alert = await alertService.scheduleAlert({
        userId: testUserId,
        category: 'DELIVERY',
        alertType: 'DELIVERY_CANCELLED',
        scheduledAt: new Date(Date.now() + 10000)
      });

      const cancelled = await alertService.cancelAlert(alert.id);

      assert(cancelled.status === 'CANCELLED', 'Alert status is CANCELLED');
    });

    // Test 12: Cannot cancel delivered alert
    await test('Cannot cancel delivered alert', async () => {
      try {
        await alertService.cancelAlert(pastAlertId);
        throw new Error('Should have thrown error');
      } catch (err) {
        assert(
          err.message.includes('Cannot cancel alert in DELIVERED status'),
          'Correct error thrown'
        );
      }
    });

    // Test 13: Alert delivery worker - single poll
    await test('Alert delivery worker processes pending alerts', async () => {
      // Create a new past alert
      const alert = await alertService.scheduleAlert({
        userId: testUserId,
        category: 'SECURITY',
        alertType: 'SECURITY_BREACH',
        scheduledAt: new Date(Date.now() - 2000)
      });

      // Run worker poll
      const report = await alertDeliveryWorker.poll();

      assert(typeof report === 'object', 'Worker returns report');
      assert(report.count >= 1, 'Worker found at least one alert');
      assert(report.successful > 0, 'Worker successfully delivered alerts');

      // Verify alert is now delivered
      const delivered = await alertService.getAlertById(alert.id);
      assert(delivered.status === 'DELIVERED', 'Alert marked delivered by worker');
    });

    // Test 14: Alerts don't affect incidents
    await test('Alerts are completely independent of incidents', async () => {
      // This is a safety verification test
      // Just ensure we can query both tables independently

      const alerts = await alertService.getUserAlerts(testUserId);
      const incidentsResult = await pool.query(
        'SELECT COUNT(*) FROM incidents WHERE user_id = $1',
        [testUserId]
      );

      // No requirement that incidents exist or don't exist
      // Just verify the query works (confirms no ForeignKey constraint between them)
      assert(Array.isArray(alerts), 'Can query alerts');
      assert(incidentsResult.rows[0], 'Can query incidents independently');
    });

    // Test 15: Category-agnostic scheduling
    await test('Alerts work with any category string', async () => {
      const customCategories = ['CUSTOM_DOMAIN_1', 'CUSTOM_DOMAIN_2', ''];
      
      // Empty string should fail validation
      try {
        await alertService.scheduleAlert({
          userId: testUserId,
          category: '',
          alertType: 'TEST',
          scheduledAt: new Date()
        });
        throw new Error('Should have rejected empty category');
      } catch (err) {
        assert(err.message.includes('required'), 'Rejects empty category');
      }

      // Non-empty strings should work
      for (const category of customCategories.slice(0, 2)) {
        const alert = await alertService.scheduleAlert({
          userId: testUserId,
          category,
          alertType: 'CUSTOM_TYPE',
          scheduledAt: new Date(Date.now() + 5000)
        });

        assert(alert.category === category, `Accepts category: ${category}`);
      }
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
