const pool = require('./db');
const alertService = require('./services/alertService');

async function testEndToEndFixed() {
  try {
    console.log('=== CORRECTED END-TO-END TEST (UTC times) ===\n');
    
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
    
    // 2. Create a test event (meeting starting in 1 minute)
    const { v4: uuid } = require('uuid');
    const eventId = uuid();
    const now = new Date();
    const in1minute = new Date(now.getTime() + 60 * 1000);
    const in3minutes = new Date(now.getTime() + 3 * 60 * 1000);
    
    const event = {
      id: eventId,
      user_id: user.id,
      payload: {
        title: '⏰ TEST MEETING - Collapse Logic',
        status: 'SCHEDULED',
        start_time: in3minutes.toISOString(),
        end_time: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        duration_minutes: 3,
        importance: 'HIGH',
        incident_enabled: true
      },
      occurred_at: in3minutes.toISOString()
    };
    
    await pool.query(
      'INSERT INTO events (id, user_id, payload, occurred_at) VALUES ($1, $2, $3, $4)',
      [event.id, event.user_id, JSON.stringify(event.payload), event.occurred_at]
    );
    
    console.log(`\n✓ Created Test Event: ${event.payload.title}`);
    console.log(`  - Event ID: ${eventId}`);
    
    // 3. Schedule alerts - all in next 60 seconds to test same-batch collapse
    console.log(`\n✓ Scheduling Alerts (all within 60 seconds for batch processing)...`);
    
    // UPCOMING - 50 seconds from now
    const upcomingScheduled = new Date(now.getTime() + 50 * 1000);
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_UPCOMING_EMAIL',
      scheduledAt: upcomingScheduled,
      category: 'MEETING'
    });
    console.log(`  1. UPCOMING_EMAIL @ ${upcomingScheduled.toISOString()}`);
    
    // URGENT - 40 seconds from now
    const urgentScheduled = new Date(now.getTime() + 40 * 1000);
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_URGENT_MESSAGE',
      scheduledAt: urgentScheduled,
      category: 'MEETING'
    });
    console.log(`  2. URGENT_MESSAGE @ ${urgentScheduled.toISOString()}`);
    
    // CRITICAL - 30 seconds from now
    const criticalScheduled = new Date(now.getTime() + 30 * 1000);
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_CRITICAL_CALL',
      scheduledAt: criticalScheduled,
      category: 'MEETING'
    });
    console.log(`  3. CRITICAL_CALL @ ${criticalScheduled.toISOString()}`);
    
    console.log(`\n✓ All alerts scheduled. Waiting for worker to process them...`);
    console.log(`(Worker runs every 5 seconds)`);
    console.log(`\nEventID: ${eventId}`);
    console.log(`Check progress with: node check-test-alerts.js`);
    
    process.exit(0);
  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testEndToEndFixed();
