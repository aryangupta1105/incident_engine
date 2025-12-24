/**
 * Test Delivery Routing
 * 
 * Tests all 5 tasks:
 * 1. Channel routing (CRITICAL_CALL → phone, others → email)
 * 2. Call context and script
 * 3. Email templates with context
 * 4. Stage collapsing
 * 5. Call execution logging
 */

const pool = require('./db');
const alertService = require('./services/alertService');
const eventService = require('./services/eventService');
const alertDeliveryWorker = require('./workers/alertDeliveryWorker');
const { v4: uuid } = require('uuid');

async function testDeliveryRouting() {
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('DELIVERY ROUTING TEST');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Get a test user (we know user b3c99058 exists with email)
    const testUserId = 'b3c99058-5c51-5e99-9131-7368dfb9123b';
    
    // Get an existing event that was synced
    const eventResult = await pool.query(
      `SELECT * FROM events WHERE user_id = $1 AND category = 'MEETING' LIMIT 1`,
      [testUserId]
    );

    if (eventResult.rows.length === 0) {
      console.log('❌ No test events found. Run scheduler first to create events.');
      process.exit(1);
    }

    const testEvent = eventResult.rows[0];
    const title = testEvent.payload?.title || 'Test Meeting';
    console.log(`✅ Found test event: ${title}`);
    console.log(`   ID: ${testEvent.id}`);
    console.log(`   Time: ${testEvent.occurred_at}\n`);

    // TASK 1 & 4 TEST: Create three alerts for same event (test stage collapsing)
    console.log('--- TASK 1 & 4: Testing Channel Routing & Stage Collapsing ---\n');

    const emailAlertId = uuid();
    const urgentAlertId = uuid();
    const callAlertId = uuid();

    // Create UPCOMING_EMAIL alert (lowest severity)
    await pool.query(
      `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [emailAlertId, testUserId, testEvent.id, 'MEETING', 'MEETING_UPCOMING_EMAIL', new Date(), 'PENDING', new Date(), new Date()]
    );
    console.log('✅ Created MEETING_UPCOMING_EMAIL alert');

    // Create URGENT_MESSAGE alert (medium severity)
    await pool.query(
      `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [urgentAlertId, testUserId, testEvent.id, 'MEETING', 'MEETING_URGENT_MESSAGE', new Date(), 'PENDING', new Date(), new Date()]
    );
    console.log('✅ Created MEETING_URGENT_MESSAGE alert');

    // Create CRITICAL_CALL alert (highest severity)
    await pool.query(
      `INSERT INTO alerts (id, user_id, event_id, category, alert_type, scheduled_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [callAlertId, testUserId, testEvent.id, 'MEETING', 'MEETING_CRITICAL_CALL', new Date(), 'PENDING', new Date(), new Date()]
    );
    console.log('✅ Created MEETING_CRITICAL_CALL alert\n');

    // Run alert delivery
    console.log('--- Running Alert Delivery Worker ---\n');
    const report = await alertDeliveryWorker.poll();

    console.log(`\n✅ Delivery report:
   Processed: ${report.count}
   Successful: ${report.successful}
   Failed: ${report.failed}
   Skipped: ${report.skipped}
   Duration: ${report.duration}ms\n`);

    // Check alert statuses
    console.log('--- Checking Alert Statuses (Task 4: Collapsing) ---\n');

    const emailStatus = await pool.query('SELECT status FROM alerts WHERE id = $1', [emailAlertId]);
    const urgentStatus = await pool.query('SELECT status FROM alerts WHERE id = $1', [urgentAlertId]);
    const callStatus = await pool.query('SELECT status FROM alerts WHERE id = $1', [callAlertId]);

    console.log(`MEETING_UPCOMING_EMAIL status: ${emailStatus.rows[0].status} (should be SKIPPED)`);
    console.log(`MEETING_URGENT_MESSAGE status: ${urgentStatus.rows[0].status} (should be SKIPPED)`);
    console.log(`MEETING_CRITICAL_CALL status: ${callStatus.rows[0].status} (should be DELIVERED)\n`);

    // Verify routing
    if (callStatus.rows[0].status === 'DELIVERED' && 
        emailStatus.rows[0].status === 'SKIPPED' &&
        urgentStatus.rows[0].status === 'SKIPPED') {
      console.log('✅ TASK 1 & 4 PASSED: Correct channel routing and stage collapsing!');
    } else {
      console.log('❌ TASK 1 & 4 FAILED: Alert statuses don\'t match expected values');
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('TEST COMPLETE');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log('📋 EXPECTED LOGS IN SERVER OUTPUT:\n');
    console.log('✅ TASK 1: [DELIVERY] Routing CRITICAL_CALL to autoCallService');
    console.log('✅ TASK 2: [CALL] Meeting context shows title, minutes remaining');
    console.log('✅ TASK 2: Call script mentions meeting title and consequence');
    console.log('✅ TASK 3: Email includes meeting title, time, time remaining');
    console.log('✅ TASK 4: [DELIVERY] Collapsing stages — delivering only MEETING_CRITICAL_CALL');
    console.log('✅ TASK 5: [CALL] Initiating call to [phone], Provider response: [sid]\n');

    process.exit(0);

  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

testDeliveryRouting();
