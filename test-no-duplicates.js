const pool = require('./db');

async function testNoDuplicates() {
  try {
    console.log('=== DUPLICATE PREVENTION TEST ===\n');
    
    // Get the most recent test event
    const eventRes = await pool.query(
      "SELECT id FROM events WHERE payload->>'title' LIKE '%TEST MEETING%' ORDER BY created_at DESC LIMIT 1"
    );
    
    if (!eventRes.rows.length) {
      console.log('No test events found');
      process.exit(0);
    }
    
    const eventId = eventRes.rows[0].id;
    
    // Get all alerts
    const alertRes = await pool.query(
      `SELECT id, alert_type, status, delivered_at, cancelled_at FROM alerts WHERE event_id = $1 ORDER BY created_at ASC`,
      [eventId]
    );
    
    console.log(`Event: ${eventId}`);
    console.log(`\nAll alerts for this event:`);
    alertRes.rows.forEach(alert => {
      const delivered = alert.delivered_at ? '✓ DELIVERED' : '';
      const cancelled = alert.cancelled_at ? '⊘ CANCELLED' : '';
      const status = delivered || cancelled || '✗ PENDING';
      console.log(`  ${alert.alert_type.padEnd(25)} ${status}`);
    });
    
    // Now simulate getPendingAlerts() query to see if collapsed alerts would be re-fetched
    const now = new Date();
    const getPendingRes = await pool.query(
      `SELECT id, alert_type FROM alerts
       WHERE status = 'PENDING'
         AND delivered_at IS NULL
         AND cancelled_at IS NULL
         AND scheduled_at <= $1
         AND event_id = $2
       ORDER BY scheduled_at ASC`,
      [now, eventId]
    );
    
    console.log(`\nPending alerts that would be fetched again:`);
    if (getPendingRes.rows.length === 0) {
      console.log('  (none - all either delivered or collapsed!)');
    } else {
      getPendingRes.rows.forEach(alert => {
        console.log(`  ${alert.alert_type}`);
      });
    }
    
    // Verification
    const delivered = alertRes.rows.filter(a => a.delivered_at).length;
    const cancelled = alertRes.rows.filter(a => a.cancelled_at).length;
    const pending = alertRes.rows.filter(a => !a.delivered_at && !a.cancelled_at).length;
    
    console.log(`\nVerification:`);
    console.log(`  Total alerts: ${alertRes.rows.length}`);
    console.log(`  Delivered: ${delivered}`);
    console.log(`  Cancelled: ${cancelled}`);
    console.log(`  Pending: ${pending}`);
    console.log(`  Would be re-fetched: ${getPendingRes.rows.length}`);
    
    if (getPendingRes.rows.length === 0 && delivered > 0) {
      console.log(`\n✓ DUPLICATE PREVENTION WORKING: Cancelled alerts filtered out, no re-delivery possible`);
    } else {
      console.log(`\n⚠ WARNING: Check filtering logic`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

testNoDuplicates();
