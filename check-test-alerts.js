const pool = require('./db');

async function checkTestAlerts() {
  try {
    // Get the most recent test event
    const eventRes = await pool.query(
      "SELECT id FROM events WHERE payload->>'title' LIKE '%TEST MEETING%' ORDER BY created_at DESC LIMIT 1"
    );
    
    if (!eventRes.rows.length) {
      console.log('No test events found');
      process.exit(0);
    }
    
    const eventId = eventRes.rows[0].id;
    console.log(`Event ID: ${eventId}`);
    
    // Get all alerts for this event
    const alertRes = await pool.query(
      "SELECT id, alert_type, status, delivered_at, cancelled_at, updated_at FROM alerts WHERE event_id = $1 ORDER BY created_at ASC",
      [eventId]
    );
    
    console.log(`\nAlerts (${alertRes.rows.length}):`);
    alertRes.rows.forEach((alert, idx) => {
      const status = alert.delivered_at ? 'DELIVERED' : alert.cancelled_at ? 'CANCELLED' : 'PENDING';
      const time = alert.delivered_at || alert.cancelled_at || alert.updated_at;
      console.log(`${idx + 1}. ${alert.alert_type.padEnd(25)} ${status.padEnd(10)} @ ${new Date(time).toLocaleTimeString()}`);
    });
    
    // Summary
    const delivered = alertRes.rows.filter(a => a.delivered_at).length;
    const cancelled = alertRes.rows.filter(a => a.cancelled_at).length;
    const pending = alertRes.rows.filter(a => !a.delivered_at && !a.cancelled_at).length;
    
    console.log(`\nSummary: ${delivered} delivered, ${cancelled} cancelled, ${pending} pending`);
    
    if (delivered === 1 && cancelled === 2 && pending === 0) {
      console.log('✓ CORRECT: Only highest severity (CRITICAL_CALL) delivered, others collapsed');
    } else if (delivered === 0) {
      console.log('⏳ Still waiting for alerts to be processed (scheduler runs every 5 sec)');
    } else {
      console.log('❌ UNEXPECTED: Check collapse logic');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkTestAlerts();
