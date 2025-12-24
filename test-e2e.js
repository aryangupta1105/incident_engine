const pool = require('./db');
const alertService = require('./services/alertService');

async function testEndToEnd() {
  try {
    console.log('=== END-TO-END TEST ===\n');
    
    // 1. Get a test user
    const userRes = await pool.query('SELECT id, email, phone FROM users LIMIT 1');
    if (!userRes.rows.length) {
      console.error('No users found');
      process.exit(1);
    }
    
    const user = userRes.rows[0];
    console.log(`✓ Test User: ${user.email}`);
    console.log(`  - ID: ${user.id}`);
    console.log(`  - Phone: ${user.phone || 'NOT SET (will use DEV_PHONE_NUMBER)'}`);
    console.log(`  - DEV_PHONE: ${process.env.DEV_PHONE_NUMBER}`);
    
    // 2. Create a test event (meeting starting in 3 minutes)
    const { v4: uuid } = require('uuid');
    const eventId = uuid();
    const now = new Date();
    const in3minutes = new Date(now.getTime() + 3 * 60 * 1000);
    const in5minutes = new Date(now.getTime() + 5 * 60 * 1000);
    
    const event = {
      id: eventId,
      user_id: user.id,
      payload: {
        title: '⏰ TEST MEETING - E2E Verification',
        status: 'SCHEDULED',
        start_time: in3minutes.toISOString(),
        end_time: in5minutes.toISOString(),
        duration_minutes: 2,
        importance: 'HIGH',
        incident_enabled: true
      },
      occurred_at: in3minutes.toISOString()
    };
    
    const eventInsert = await pool.query(
      'INSERT INTO events (id, user_id, payload, occurred_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [event.id, event.user_id, JSON.stringify(event.payload), event.occurred_at]
    );
    
    console.log(`\n✓ Created Test Event: ${event.payload.title}`);
    console.log(`  - Event ID: ${eventId}`);
    console.log(`  - Start time: ${in3minutes.toISOString()}`);
    console.log(`  - In 3 minutes: ${in3minutes.toLocaleTimeString()}`);
    
    // 3. Manually schedule the alerts that would normally be created by RuleEngine
    console.log(`\n✓ Scheduling Alerts...`);
    
    // UPCOMING_EMAIL - 5-10 min before
    const upcomingTime = new Date(in3minutes.getTime() - 6 * 60 * 1000);
    const upcoming = await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_UPCOMING_EMAIL',
      scheduledAt: upcomingTime,
      category: 'MEETING'
    });
    console.log(`  1. UPCOMING_EMAIL scheduled for ${upcomingTime.toLocaleTimeString()}`);
    
    // URGENT_MESSAGE - 3-5 min before
    const urgentTime = new Date(in3minutes.getTime() - 4 * 60 * 1000);
    const urgent = await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_URGENT_MESSAGE',
      scheduledAt: urgentTime,
      category: 'MEETING'
    });
    console.log(`  2. URGENT_MESSAGE scheduled for ${urgentTime.toLocaleTimeString()}`);
    
    // CRITICAL_CALL - 1-2 min before
    const criticalTime = new Date(in3minutes.getTime() - 1.5 * 60 * 1000);
    const critical = await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_CRITICAL_CALL',
      scheduledAt: criticalTime,
      category: 'MEETING'
    });
    console.log(`  3. CRITICAL_CALL scheduled for ${criticalTime.toLocaleTimeString()}`);
    
    // 4. Get pending alerts
    console.log(`\n✓ Checking Pending Alerts...`);
    const now_seconds = Math.floor(Date.now() / 1000);
    const pending = await pool.query(
      `SELECT id, alert_type, status, delivered_at, cancelled_at 
       FROM alerts 
       WHERE user_id = $1 AND event_id = $2
       ORDER BY created_at ASC`,
      [user.id, eventId]
    );
    
    console.log(`  Found ${pending.rows.length} alerts:`);
    pending.rows.forEach((alert, idx) => {
      const delivered = alert.delivered_at ? '✓ DELIVERED' : '✗ PENDING';
      const cancelled = alert.cancelled_at ? '(CANCELLED)' : '';
      console.log(`    ${idx + 1}. ${alert.alert_type.padEnd(25)} ${delivered} ${cancelled}`);
    });
    
    // 5. Schema verification
    console.log(`\n✓ Database Schema Verification...`);
    
    // Check alerts.cancelled_at column
    const alertCols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'cancelled_at'"
    );
    if (alertCols.rows.length > 0) {
      console.log('  ✓ alerts.cancelled_at column EXISTS');
    } else {
      console.log('  ✗ alerts.cancelled_at column MISSING');
    }
    
    // Check users.phone column
    const userCols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone'"
    );
    if (userCols.rows.length > 0) {
      console.log('  ✓ users.phone column EXISTS');
    } else {
      console.log('  ✗ users.phone column MISSING');
    }
    
    // 6. Summary
    console.log(`\n=== TEST COMPLETE ===`);
    console.log(`Event: ${event.payload.title}`);
    console.log(`Event ID: ${eventId}`);
    console.log(`User: ${user.email}`);
    console.log(`\nNext steps:`);
    console.log(`1. Wait for scheduler to execute pending alerts`);
    console.log(`2. Watch for email delivery to ${user.email}`);
    console.log(`3. Watch for Twilio call to ${user.phone || process.env.DEV_PHONE_NUMBER}`);
    console.log(`4. Verify no duplicate alerts (cancelled_at timestamps)`);
    console.log(`\nDatabase queries to monitor:`);
    console.log(`  SELECT * FROM alerts WHERE event_id = '${eventId}' ORDER BY created_at ASC;`);
    console.log(`  SELECT * FROM events WHERE id = '${eventId}';`);
    
    process.exit(0);
  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testEndToEnd();
