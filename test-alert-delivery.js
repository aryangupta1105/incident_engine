/**
 * Alert Delivery Worker Test Suite
 * 
 * Tests the real alert delivery system:
 * 1. Email delivery when enabled
 * 2. Skipping delivery when disabled
 * 3. Alert state transitions (PENDING -> DELIVERED)
 * 4. Error handling (user without email, missing event)
 * 5. Idempotency (multiple deliveries are safe)
 */

const pool = require('./db');
const alertService = require('./services/alertService');
const alertDeliveryWorker = require('./workers/alertDeliveryWorker');
const { v4: uuid } = require('uuid');

// Set test mode to use JSON transport (no real SMTP)
process.env.SMTP_TEST_MODE = 'true';
process.env.FEATURE_EMAIL_ENABLED = 'true';

// Test tracking
let testsPassed = 0;
let testsFailed = 0;

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log('================================================');
  console.log('ALERT DELIVERY WORKER TEST SUITE');
  console.log('================================================\n');

  let testUserId;
  let testEventId;

  try {
    // Setup: Create test user
    console.log('[SETUP] Creating test user...');
    testUserId = uuid();
    await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2)',
      [testUserId, 'test-alert@example.com']
    );
    console.log(`[SETUP] User created: ${testUserId}\n`);

    // Setup: Create test event
    console.log('[SETUP] Creating test event...');
    testEventId = uuid();
    await pool.query(
      `INSERT INTO events (
        id, source, category, occurred_at, payload, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        testEventId,
        'API',
        'MEETING',
        new Date(),
        JSON.stringify({ title: 'Test Meeting', description: 'Test event' }),
        new Date(),
        new Date()
      ]
    );
    console.log(`[SETUP] Event created: ${testEventId}\n`);

    // TEST 1: Alert created in PENDING status
    await test('Alert is created in PENDING status', async () => {
      const alertId = uuid();
      const scheduledAt = new Date(Date.now() - 60000);

      const result = await pool.query(
        `INSERT INTO alerts (
          id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', scheduledAt, 'PENDING', new Date(), new Date()]
      );

      const alert = result.rows[0];
      assert(alert.status === 'PENDING', 'Alert should be PENDING');
      assert(alert.delivered_at === null, 'Alert should not have delivered_at');
    });

    // TEST 2: Fetch pending alerts due for delivery
    await test('getPendingAlerts returns past alerts only', async () => {
      const pastAlertId = uuid();
      const futureAlertId = uuid();

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [pastAlertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', 
         new Date(Date.now() - 60000), 'PENDING', new Date(), new Date()]
      );

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [futureAlertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING',
         new Date(Date.now() + 3600000), 'PENDING', new Date(), new Date()]
      );

      const pending = await alertService.getPendingAlerts(new Date(), 100);
      const pastAlert = pending.find(a => a.id === pastAlertId);
      const futureAlert = pending.find(a => a.id === futureAlertId);

      assert(pastAlert, 'Past alert should be in pending list');
      assert(!futureAlert, 'Future alert should NOT be in pending list');
    });

    // TEST 3: Alert delivery worker processes pending alerts
    await test('Alert delivery worker finds and processes alerts', async () => {
      const alertId = uuid();
      const scheduledAt = new Date(Date.now() - 30000);

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', scheduledAt, 'PENDING', new Date(), new Date()]
      );

      const report = await alertDeliveryWorker.poll();

      assert(report.count >= 1, 'Worker should find pending alerts');
      assert(report.successful >= 1, `Worker should deliver alerts (${report.successful}/${report.count} successful)`);

      const updated = await alertService.getAlertById(alertId);
      assert(updated.status === 'DELIVERED', 'Alert should be marked DELIVERED');
      assert(updated.delivered_at !== null, 'Alert should have delivered_at timestamp');
    });

    // TEST 4: Email delivery skipped when disabled
    await test('Email delivery skipped when FEATURE_EMAIL_ENABLED=false', async () => {
      const alertId = uuid();
      const scheduledAt = new Date(Date.now() - 20000);

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', scheduledAt, 'PENDING', new Date(), new Date()]
      );

      process.env.FEATURE_EMAIL_ENABLED = 'false';
      const report = await alertDeliveryWorker.poll();
      process.env.FEATURE_EMAIL_ENABLED = 'true';

      assert(report.count === 0, 'No alerts should be processed when disabled');
      
      const alert = await alertService.getAlertById(alertId);
      assert(alert.status === 'PENDING', 'Alert should remain PENDING when disabled');
    });

    // TEST 5: Idempotency of delivery
    await test('Marking alert as DELIVERED is idempotent', async () => {
      const alertId = uuid();

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', 
         new Date(Date.now() - 10000), 'PENDING', new Date(), new Date()]
      );

      const first = await alertService.markAlertDelivered(alertId);
      assert(first.status === 'DELIVERED', 'First delivery sets status');

      const second = await alertService.markAlertDelivered(alertId);
      assert(second.status === 'DELIVERED', 'Second delivery still DELIVERED');
      assert(first.delivered_at.toString() === second.delivered_at.toString(), 
        'delivered_at should not change');
    });

    // TEST 6: Graceful error handling for missing email
    await test('Delivery fails gracefully for user without email', async () => {
      const noEmailUserId = uuid();
      await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [noEmailUserId, null]);

      const alertId = uuid();
      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, noEmailUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', 
         new Date(Date.now() - 5000), 'PENDING', new Date(), new Date()]
      );

      await alertDeliveryWorker.poll();

      const alert = await alertService.getAlertById(alertId);
      assert(alert.status === 'PENDING', 'Alert remains PENDING after error');
    });

    // TEST 7: Delivered alerts are immutable
    await test('Delivered alert cannot be cancelled', async () => {
      const alertId = uuid();

      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING',
         new Date(Date.now() - 1000), 'PENDING', new Date(), new Date()]
      );

      await alertService.markAlertDelivered(alertId);

      try {
        await alertService.cancelAlert(alertId);
        throw new Error('Should not cancel delivered alert');
      } catch (err) {
        assert(err.message.includes('Cannot cancel'), 'Error message should be clear');
      }
    });

    // TEST 8: Email templates generate correct subjects
    await test('Email templates generate correct subjects', async () => {
      const emailTemplates = require('./services/emailTemplates');

      const subj1 = emailTemplates.generateSubject('MEETING_UPCOMING', 'MEETING');
      assert(subj1.includes('Meeting'), 'MEETING_UPCOMING subject should mention Meeting');

      const subj2 = emailTemplates.generateSubject('PAYMENT_DUE', 'FINANCE');
      assert(subj2.includes('Payment'), 'PAYMENT_DUE subject should mention Payment');

      const subj3 = emailTemplates.generateSubject('UNKNOWN_TYPE', 'TEST');
      assert(subj3.includes('TEST'), 'Unknown type should use category');
    });

    // TEST 9: Email templates generate complete content
    await test('Email templates generate complete body with context', async () => {
      const emailTemplates = require('./services/emailTemplates');

      const alert = {
        id: uuid(),
        alert_type: 'MEETING_UPCOMING',
        category: 'MEETING',
        scheduled_at: new Date()
      };

      const event = {
        id: uuid(),
        title: 'Sync',
        description: 'Team sync',
        occurred_at: new Date()
      };

      const content = emailTemplates.createEmailContent({ alert, event });

      assert(content.subject, 'Should have subject');
      assert(content.body, 'Should have body');
      assert(content.body.includes('MEETING_UPCOMING'), 'Body should include alert type');
    });

    // TEST 10: Alert delivery does not create incidents
    await test('Alert delivery does not create incidents', async () => {
      const initialCount = await pool.query('SELECT COUNT(*) as count FROM incidents');

      const alertId = uuid();
      await pool.query(
        `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [alertId, testUserId, testEventId, 'MEETING', 'MEETING_UPCOMING', 
         new Date(Date.now() - 1000), 'PENDING', new Date(), new Date()]
      );

      await alertDeliveryWorker.poll();

      const finalCount = await pool.query('SELECT COUNT(*) as count FROM incidents');
      assert(initialCount.rows[0].count === finalCount.rows[0].count, 
        'Delivery should not create incidents');
    });

  } catch (err) {
    console.error('\n[SETUP ERROR]', err.message);
    process.exit(1);
  } finally {
    try {
      console.log('\n[CLEANUP] Removing test data...');
      
      if (testUserId) {
        await pool.query('DELETE FROM alerts WHERE user_id = $1', [testUserId]);
        await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
      }

      if (testEventId) {
        await pool.query('DELETE FROM events WHERE id = $1', [testEventId]);
      }

      console.log('[CLEANUP] Test data removed\n');
    } catch (err) {
      console.error('[CLEANUP ERROR]', err.message);
    }

    console.log('================================================');
    console.log('TEST RESULTS');
    console.log('================================================');
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Total:  ${testsPassed + testsFailed}`);
    console.log('================================================\n');

    await pool.end();
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
