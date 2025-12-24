/**
 * Test to verify call alerts work when meeting is within 2-minute window
 *
 * This script:
 * 1. Creates a meeting 90 seconds from now (within 2-min call window)
 * 2. Monitors the alert system
 * 3. Shows whether call alert gets scheduled and delivered
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║          CALL ALERT TIMING TEST (2-Minute Window)          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Check configuration
    console.log('[CONFIG] Call feature enabled:', process.env.FEATURE_CALL_ENABLED);
    console.log('[CONFIG] Twilio configured:', !!process.env.TWILIO_ACCOUNT_SID);
    console.log('[CONFIG] Call provider:', process.env.CALL_PROVIDER);
    console.log('[CONFIG] Dev phone:', process.env.DEV_PHONE_NUMBER);
    console.log('[CONFIG] Twilio phone:', process.env.TWILIO_PHONE_NUMBER);

    // Get a user to create test event
    const userResult = await pool.query(
      `SELECT id, email, phone FROM users LIMIT 1`
    );

    if (userResult.rows.length === 0) {
      console.log('\n❌ No users found in database');
      console.log('Run: node test-step2-alerts.js to create test data\n');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`\n[USER] Using test user: ${user.email} | Phone: ${user.phone}`);

    // Create event 90 seconds from now (WITHIN 2-min call window)
    const meetingTime = new Date(Date.now() + 90 * 1000);
    console.log(`\n[MEETING] Creating meeting at ${meetingTime.toISOString()}`);
    console.log(`[MEETING] Current time: ${new Date().toISOString()}`);
    console.log(`[MEETING] Time until meeting: 90 seconds (WITHIN 2-minute call window) ✓\n`);

    const eventResult = await pool.query(
      `INSERT INTO events (id, user_id, category, type, occurred_at, source, payload)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       RETURNING id, occurred_at`,
      [
        user.id,
        'MEETING',
        'MEETING_SCHEDULED',
        meetingTime,
        'API',
        JSON.stringify({
          title: 'Test Call Alert Meeting',
          description: 'Testing call alert within 2-minute window',
          meet_link: 'https://meet.google.com/test'
        })
      ]
    );

    const eventId = eventResult.rows[0].id;
    console.log(`[EVENT] Created event ${eventId}\n`);

    // Check what alerts are scheduled
    console.log('Waiting for scheduler to evaluate rules (up to 60 seconds)...\n');
    
    let alertsFound = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));

      const alerts = await pool.query(
        `SELECT alert_type, status, scheduled_at, delivered_at
         FROM alerts 
         WHERE event_id = $1 
         ORDER BY created_at DESC`,
        [eventId]
      );

      if (alerts.rows.length > 0) {
        alertsFound = true;
        console.log(`[ALERTS] Found ${alerts.rows.length} alerts:\n`);
        
        for (const alert of alerts.rows) {
          const scheduled = new Date(alert.scheduled_at);
          const status = alert.status === 'DELIVERED' ? '✓' : '⏳';
          console.log(`  ${status} ${alert.alert_type} (scheduled: ${scheduled.toISOString()})`);
          if (alert.delivered_at) {
            const delivered = new Date(alert.delivered_at);
            console.log(`     Delivered: ${delivered.toISOString()}`);
          }
        }

        // Look specifically for call alert
        const callAlert = alerts.rows.find(a => a.alert_type === 'MEETING_CRITICAL_CALL');
        if (callAlert) {
          console.log('\n✓ CALL ALERT FOUND!');
          console.log(`  Status: ${callAlert.status}`);
          if (callAlert.status === 'DELIVERED') {
            console.log(`  ✓ DELIVERED - Check your phone for incoming call!`);
          } else {
            console.log(`  ⏳ Still pending - worker will deliver in next cycle`);
          }
        } else {
          console.log('\n❌ NO CALL ALERT - Check server logs for why');
        }
        break;
      }

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`  ${i + 1}s elapsed... `);
      }
    }

    if (!alertsFound) {
      console.log('\n❌ No alerts found after 60 seconds');
      console.log('Check server logs for scheduler/rule engine errors\n');
    }

    console.log('\n' + '═'.repeat(60));
    console.log('Test complete. Check server terminal for detailed logs.\n');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

main();
