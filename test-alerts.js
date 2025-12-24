const pool = require('./db');

async function testAlerts() {
  try {
    // Check the most recent event
    const eventRes = await pool.query(
      "SELECT id FROM events ORDER BY created_at DESC LIMIT 1"
    );
    
    if (eventRes.rows.length === 0) {
      console.log('No events found');
      process.exit(0);
    }
    
    const eventId = eventRes.rows[0].id;
    console.log('Most recent event ID:', eventId);
    
    // Get all alerts for this event
    const alertRes = await pool.query(
      "SELECT id, category, alert_type, status, delivered_at, cancelled_at FROM alerts WHERE event_id = $1 ORDER BY created_at ASC",
      [eventId]
    );
    
    console.log('\nAlerts for this event:');
    alertRes.rows.forEach((alert, idx) => {
      console.log(`${idx + 1}. ${alert.alert_type} (${alert.category})`);
      console.log(`   Status: ${alert.status}, Delivered: ${alert.delivered_at ? 'YES' : 'NO'}, Cancelled: ${alert.cancelled_at ? 'YES' : 'NO'}`);
    });
    
    // Check for cancelled alerts (collapse indicators)
    const cancelledCount = alertRes.rows.filter(a => a.cancelled_at).length;
    const deliveredCount = alertRes.rows.filter(a => a.delivered_at).length;
    
    console.log(`\nSummary: ${deliveredCount} delivered, ${cancelledCount} cancelled out of ${alertRes.rows.length} total`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

testAlerts();
