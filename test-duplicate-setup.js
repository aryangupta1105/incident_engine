/**
 * SIMPLIFIED TEST: Direct Alert Delivery Testing
 * 
 * Instead of waiting for scheduler to create alerts,
 * we'll create them directly and test delivery behavior
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Aryan2005@localhost:5432/savehub'
});

const TEST_USER_ID = 'b3c99058-5c51-5e99-9131-7368dfb9123b';
const TEST_PHONE = '+19173453819';
const TEST_EMAIL = 'aryangupta01105@gmail.com';

async function main() {
  console.log('🧪 DIRECT ALERT DELIVERY TEST\n');
  console.log('📋 Test Strategy:');
  console.log('  1. Create a test event (meeting)');
  console.log('  2. Manually create 3 alerts for that event');
  console.log('  3. Start alert delivery worker');
  console.log('  4. Monitor deliveries in real-time');
  console.log('  5. Verify: No duplicates!\n');

  try {
    // STEP 1: Create meeting
    console.log('📝 STEP 1: Create test meeting...');
    const meetingTime = new Date();
    meetingTime.setSeconds(meetingTime.getSeconds() + 20); // 20 seconds from now
    
    const eventResult = await pool.query(
      `INSERT INTO events (
        id, user_id, category, type, occurred_at, source, payload
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        TEST_USER_ID,
        'MEETING',
        'MEETING_SCHEDULED',
        meetingTime.toISOString(),
        'API',
        JSON.stringify({
          title: 'TEST MEETING - Duplicate Fix Verification',
          start_time: meetingTime.toISOString()
        })
      ]
    );

    const eventId = eventResult.rows[0].id;
    console.log(`  ✓ Created meeting: ${eventId}`);
    console.log(`  ✓ Meeting time: ${meetingTime.toISOString()}\n`);

    // STEP 2: Create alerts
    console.log('📝 STEP 2: Create 3 test alerts (PENDING)...');
    
    const alertTypes = [
      { type: 'MEETING_UPCOMING_EMAIL', minutes: -12 },
      { type: 'MEETING_URGENT_MESSAGE', minutes: -5 },
      { type: 'MEETING_CRITICAL_CALL', minutes: -2 }
    ];

    for (const alert of alertTypes) {
      const scheduledTime = new Date(meetingTime.getTime() + alert.minutes * 60 * 1000);
      
      await pool.query(
        `INSERT INTO alerts (user_id, event_id, category, alert_type, status, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [TEST_USER_ID, eventId, 'MEETING', alert.type, 'PENDING', scheduledTime.toISOString()]
      );
      
      console.log(`  ✓ ${alert.type} (scheduled for ${alert.minutes} min from meeting)`);
    }
    console.log('');

    // STEP 3: Get baseline
    console.log('📝 STEP 3: Baseline - Verify 3 PENDING alerts in DB...');
    const baselineResult = await pool.query(
      `SELECT alert_type, status, COUNT(*) as count
       FROM alerts
       WHERE event_id = $1
       GROUP BY alert_type, status
       ORDER BY alert_type`,
      [eventId]
    );

    console.log('  Current state:');
    for (const row of baselineResult.rows) {
      console.log(`    - ${row.alert_type}: ${row.status} (count: ${row.count})`);
    }
    console.log('');

    // STEP 4: Instructions for testing
    console.log('📝 STEP 4: TESTING - Alert delivery worker monitoring...\n');
    console.log('✅ Server is ready! Now do this:\n');
    console.log('  1. In ANOTHER terminal, run the server:');
    console.log('     → cd C:\\Users\\aarya\\IncidentManagementSystem\\incident-engine');
    console.log('     → node server.js\n');
    console.log('  2. Watch the server logs for delivery:');
    console.log('     → Look for: "[EMAIL] Found X pending alerts to deliver"');
    console.log('     → Look for: "[CALL] TwiML generated successfully"');
    console.log('     → Look for: "[DELIVERY] Locked and marked DELIVERED"\n');
    console.log('  3. After ~5-10 seconds, expect to see:');
    console.log('     ✓ 1x MEETING_UPCOMING_EMAIL delivered');
    console.log('     ✓ 1x MEETING_URGENT_MESSAGE delivered');
    console.log('     ✓ 1x MEETING_CRITICAL_CALL delivered');
    console.log('     ✓ NO "[ALERT_WORKER] Previous poll still in progress" (mutex working!)\n');
    console.log('  4. After delivery, run this command to verify:');
    console.log(`     → node verify-duplicate-test.js ${eventId}\n`);

    process.exit(0);

  } catch (err) {
    console.error('❌ Test setup failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
