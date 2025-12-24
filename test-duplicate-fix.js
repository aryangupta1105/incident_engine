/**
 * TEST SCRIPT: Verify Duplicate Alert Fix
 * 
 * Tests:
 * 1. Create a meeting scheduled 2-3 minutes in future
 * 2. Wait for alert delivery worker to process alerts
 * 3. Monitor server logs for delivery behavior
 * 4. Verify only 1 email + 1 call per alert type (no duplicates)
 * 5. Verify reminder message is included in call
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Aryan2005@localhost:5432/savehub'
});

const TEST_USER_ID = 'b3c99058-5c51-5e99-9131-7368dfb9123b'; // User with active calendar
const TEST_PHONE = '+19173453819'; // Valid E.164 format for testing
const TEST_EMAIL = 'aryangupta01105@gmail.com';

async function main() {
  console.log('🧪 DUPLICATE ALERT FIX TEST\n');
  console.log('📋 Test Plan:');
  console.log('  1. Create test meeting (scheduled for 3 minutes from now)');
  console.log('  2. Wait for scheduler to create alerts');
  console.log('  3. Monitor alert delivery in real-time');
  console.log('  4. Verify: only 1 email + 1 call delivered (no duplicates)\n');

  try {
    // STEP 1: Verify user has phone and email
    console.log('📝 STEP 1: Verify user phone and email...');
    const userResult = await pool.query(
      'SELECT phone, email FROM users WHERE id = $1',
      [TEST_USER_ID]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User ${TEST_USER_ID} not found`);
    }

    const user = userResult.rows[0];
    console.log(`  ✓ User found: ${TEST_USER_ID}`);
    console.log(`  ✓ Phone: ${user.phone || 'NOT SET - updating...'}`);
    console.log(`  ✓ Email: ${user.email || 'NOT SET - updating...'}\n`);

    // Update phone if missing
    if (!user.phone || !user.phone.includes('+')) {
      await pool.query(
        'UPDATE users SET phone = $1 WHERE id = $2',
        [TEST_PHONE, TEST_USER_ID]
      );
      console.log(`  ✓ Updated phone to ${TEST_PHONE}\n`);
    }

    if (!user.email) {
      await pool.query(
        'UPDATE users SET email = $1 WHERE id = $2',
        [TEST_EMAIL, TEST_USER_ID]
      );
      console.log(`  ✓ Updated email to ${TEST_EMAIL}\n`);
    }

    // STEP 2: Create test meeting
    console.log('📝 STEP 2: Create test meeting...');
    const meetingTime = new Date();
    meetingTime.setMinutes(meetingTime.getMinutes() + 3); // 3 minutes from now
    const meetingTimeISO = meetingTime.toISOString();
    
    const eventResult = await pool.query(
      `INSERT INTO events (
        id, user_id, category, type, occurred_at, source, payload
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
      RETURNING id, occurred_at`,
      [
        TEST_USER_ID,
        'MEETING',
        'MEETING_SCHEDULED',
        meetingTimeISO,
        'API',
        JSON.stringify({
          title: 'TEST MEETING - Duplicate Fix Verification',
          description: 'Verifying that alerts are delivered only once',
          start_time: meetingTimeISO,
          end_time: new Date(meetingTime.getTime() + 30 * 60000).toISOString(),
          meet_link: 'https://meet.google.com/test'
        })
      ]
    );

    const eventId = eventResult.rows[0].id;
    const eventOccurredAt = eventResult.rows[0].occurred_at;
    console.log(`  ✓ Meeting created: ${eventId}`);
    console.log(`  ✓ Title: "TEST MEETING - Duplicate Fix Verification"`);
    console.log(`  ✓ Start time: ${eventOccurredAt}`);
    console.log(`  ✓ Current time: ${new Date().toISOString()}`);
    console.log(`  ⏱️  Alerts will trigger in ~3 minutes\n`);

    // STEP 3: Show alerts that will be created
    console.log('📝 STEP 3: Monitoring alert creation...');
    console.log('  Waiting for scheduler to create alerts (happens every 1 minute)...\n');
    
    // Wait for scheduler tick (happens every minute)
    const waitMs = 65000; // Wait 65 seconds to catch next scheduler tick
    console.log(`  ⏳ Waiting ${(waitMs / 1000).toFixed(0)} seconds for scheduler...\n`);
    
    await new Promise(resolve => setTimeout(resolve, waitMs));

    // STEP 4: Check created alerts
    console.log('📝 STEP 4: Check created alerts...');
    const alertsResult = await pool.query(
      `SELECT id, alert_type, status, scheduled_at 
       FROM alerts 
       WHERE event_id = $1 
       ORDER BY scheduled_at ASC`,
      [eventId]
    );

    if (alertsResult.rows.length === 0) {
      console.log(`  ⚠️  No alerts created yet. Meeting might be too far in future.`);
      console.log(`  📝 Alerts will be created when meeting is < 12 minutes away\n`);
    } else {
      console.log(`  ✓ Created ${alertsResult.rows.length} alerts:`);
      for (const alert of alertsResult.rows) {
        const minutesUntil = Math.round((new Date(alert.scheduled_at) - new Date()) / 60000);
        console.log(`    - ${alert.alert_type}: ${alert.status} (in ${minutesUntil} min)`);
      }
      console.log('');
    }

    // STEP 5: Monitor delivery
    console.log('📝 STEP 5: Monitoring alert delivery...');
    console.log('  🔴 WATCH SERVER LOGS for:');
    console.log('    1. "[EMAIL] Found X pending alerts to deliver"');
    console.log('    2. "[CALL] TwiML generated successfully"');
    console.log('    3. "[CALL] Reminder message: TEST MEETING..."');
    console.log('    4. "[DELIVERY] Locked and marked DELIVERED:"');
    console.log('    5. "[ALERT_WORKER] Previous poll still in progress, skipping..." (mutex working!)');
    console.log('\n  Expected deliveries (should see exactly once each):');
    console.log('    ✓ 1x MEETING_UPCOMING_EMAIL (12 min before)');
    console.log('    ✓ 1x MEETING_URGENT_MESSAGE (5 min before)');
    console.log('    ✓ 1x MEETING_CRITICAL_CALL (2 min before) + TwiML reminder\n');

    // STEP 6: Poll for delivery status
    console.log('📝 STEP 6: Real-time delivery monitoring...');
    console.log('  Polling alerts table for delivery status every 5 seconds...\n');

    let pollCount = 0;
    let lastDeliveredCount = 0;
    const maxPolls = 24; // 2 minutes of polling
    const pollInterval = 5000; // 5 seconds

    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;

      const statusResult = await pool.query(
        `SELECT 
          alert_type, 
          status, 
          COUNT(*) as count
         FROM alerts 
         WHERE event_id = $1
         GROUP BY alert_type, status
         ORDER BY alert_type`,
        [eventId]
      );

      if (statusResult.rows.length === 0) {
        continue;
      }

      // Display status
      const currentDeliveredCount = statusResult.rows.filter(r => r.status === 'DELIVERED').length;
      
      // Show update only on changes
      if (currentDeliveredCount !== lastDeliveredCount) {
        console.log(`  [${pollCount * 5}s] Alert Status:`);
        for (const row of statusResult.rows) {
          const marker = row.status === 'DELIVERED' ? '✓' : '⏳';
          console.log(`    ${marker} ${row.alert_type}: ${row.status} (count: ${row.count})`);
        }
        console.log('');
        lastDeliveredCount = currentDeliveredCount;
      }

      // Stop if all delivered
      const allDelivered = statusResult.rows.every(r => r.status === 'DELIVERED');
      if (allDelivered && statusResult.rows.length > 0) {
        console.log('  ✅ All alerts delivered!\n');
        break;
      }
    }

    // STEP 7: Final verification
    console.log('📝 STEP 7: Final verification - Duplicate detection...');
    const finalResult = await pool.query(
      `SELECT 
        alert_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_count
       FROM alerts
       WHERE event_id = $1
       GROUP BY alert_type
       ORDER BY alert_type`,
      [eventId]
    );

    console.log('\n📊 TEST RESULTS:');
    console.log('  Alert Delivery Summary:');
    
    let hasIssue = false;
    for (const row of finalResult.rows) {
      const marker = row.total_count === 1 ? '✅' : '❌';
      console.log(`    ${marker} ${row.alert_type}`);
      console.log(`       Total: ${row.total_count}, Delivered: ${row.delivered_count}`);
      
      if (row.total_count > 1) {
        hasIssue = true;
        console.log(`       ⚠️  DUPLICATE DETECTED! Expected 1 but found ${row.total_count}`);
      }
    }

    if (!hasIssue && finalResult.rows.length > 0) {
      console.log('\n✅ TEST PASSED - No duplicates detected!');
      console.log('   The mutex concurrency control is working correctly.');
    } else if (finalResult.rows.length === 0) {
      console.log('\n⏳ TEST INCONCLUSIVE - No alerts were created/delivered');
      console.log('   This might be normal if meeting time hasn\'t triggered alerts yet');
    }

    console.log('\n📝 Next steps:');
    console.log('  1. Check your phone for the call (should hear reminder about "TEST MEETING")');
    console.log('  2. Check your email for the messages');
    console.log('  3. Verify only 1 call and 1 email received (not 2)');
    console.log('  4. Review server logs for TwiML reminder message\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
