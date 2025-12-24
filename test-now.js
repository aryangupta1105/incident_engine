const pool = require('./db');
const alertService = require('./services/alertService');

async function testNow() {
  try {
    console.log('=== IMMEDIATE TEST (alerts due NOW) ===\n');
    
    // Get a test user
    const userRes = await pool.query('SELECT id, email FROM users LIMIT 1');
    const user = userRes.rows[0];
    console.log(`Test User: ${user.email}`);
    
    // Create event
    const { v4: uuid } = require('uuid');
    const eventId = uuid();
    const now = new Date();
    
    await pool.query(
      'INSERT INTO events (id, user_id, payload, occurred_at) VALUES ($1, $2, $3, $4)',
      [eventId, user.id, JSON.stringify({title: 'NOW TEST', status: 'SCHEDULED', start_time: now.toISOString()}), now.toISOString()]
    );
    
    console.log(`Event: ${eventId}`);
    
    // Schedule alerts - DUE NOW
    const nowMinus5sec = new Date(now.getTime() - 5 * 1000);
    
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_UPCOMING_EMAIL',
      scheduledAt: nowMinus5sec,
      category: 'MEETING'
    });
    console.log(`✓ UPCOMING_EMAIL (due 5s ago)`);
    
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_URGENT_MESSAGE',
      scheduledAt: nowMinus5sec,
      category: 'MEETING'
    });
    console.log(`✓ URGENT_MESSAGE (due 5s ago)`);
    
    await alertService.scheduleAlert({
      userId: user.id,
      eventId: eventId,
      alertType: 'MEETING_CRITICAL_CALL',
      scheduledAt: nowMinus5sec,
      category: 'MEETING'
    });
    console.log(`✓ CRITICAL_CALL (due 5s ago)`);
    
    console.log(`\nWaiting 8 seconds for worker to process...`);
    
    setTimeout(() => {
      // Check status
      pool.query(
        `SELECT alert_type, delivered_at, cancelled_at FROM alerts WHERE event_id = $1 ORDER BY scheduled_at ASC`,
        [eventId]
      ).then(res => {
        console.log(`\nResults:`);
        let delivered = 0, cancelled = 0;
        res.rows.forEach(alert => {
          const status = alert.delivered_at ? 'DELIVERED' : alert.cancelled_at ? 'CANCELLED' : 'PENDING';
          console.log(`  ${alert.alert_type.padEnd(25)} ${status}`);
          if (alert.delivered_at) delivered++;
          if (alert.cancelled_at) cancelled++;
        });
        
        console.log(`\nSummary: ${delivered} delivered, ${cancelled} cancelled`);
        
        if (delivered === 1 && cancelled === 2) {
          console.log('✓ SUCCESS: Collapse working correctly!');
        } else if (delivered + cancelled === 0) {
          console.log('❌ No alerts processed yet');
        } else {
          console.log('⚠ Partial processing');
        }
        
        process.exit(0);
      }).catch(err => {
        console.error('Query error:', err.message);
        process.exit(1);
      });
    }, 8000);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

testNow();
