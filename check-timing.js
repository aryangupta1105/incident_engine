const pool = require('./db');

async function checkTiming() {
  try {
    const eventRes = await pool.query(
      "SELECT id FROM events WHERE payload->>'title' LIKE '%TEST MEETING%' ORDER BY created_at DESC LIMIT 1"
    );
    
    if (!eventRes.rows.length) {
      console.log('No test events found');
      process.exit(0);
    }
    
    const eventId = eventRes.rows[0].id;
    
    // Get alert timing details
    const alertRes = await pool.query(
      `SELECT alert_type, scheduled_at, created_at, delivered_at, cancelled_at 
       FROM alerts 
       WHERE event_id = $1 
       ORDER BY scheduled_at ASC`,
      [eventId]
    );
    
    const now = new Date();
    console.log(`Current time: ${now.toISOString()}\n`);
    
    console.log('Alert Scheduling:');
    alertRes.rows.forEach((alert, idx) => {
      const scheduled = new Date(alert.scheduled_at);
      const secondsUntil = (scheduled - now) / 1000;
      const delivered = alert.delivered_at ? `✓ DELIVERED @ ${new Date(alert.delivered_at).toLocaleTimeString()}` : 
                        alert.cancelled_at ? `⊘ CANCELLED @ ${new Date(alert.cancelled_at).toLocaleTimeString()}` : 
                        '✗ PENDING';
      
      console.log(`${idx + 1}. ${alert.alert_type.padEnd(25)}`);
      console.log(`   Scheduled: ${scheduled.toLocaleTimeString()}`);
      console.log(`   Status: ${delivered}`);
      console.log(`   Time until scheduled: ${secondsUntil.toFixed(1)}s`);
      console.log('');
    });
    
    // Check if alerts were processed in same batch
    const alerts = alertRes.rows;
    const batch1Delivery = new Date(alerts[0].delivered_at || alerts[0].cancelled_at).getTime();
    const batch2Delivery = new Date(alerts[1].delivered_at || alerts[1].cancelled_at).getTime();
    const batch3Time = alerts[2].delivered_at || alerts[2].cancelled_at;
    
    const timeDiff = Math.abs(batch2Delivery - batch1Delivery);
    console.log(`Time between first and second alert processing: ${(timeDiff / 1000).toFixed(1)}s`);
    console.log(`(Worker runs every 5 seconds, so if > 5s, they were in different batches)`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTiming();
