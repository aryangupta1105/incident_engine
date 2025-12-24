const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function debug() {
  try {
    console.log('═'.repeat(80));
    console.log('DEBUGGING DUPLICATE ALERTS ISSUE');
    console.log('═'.repeat(80));

    // 1. Get all recent meetings
    console.log('\n[1] RECENT MEETINGS (last 1 hour)');
    const meetings = await pool.query(`
      SELECT 
        id, 
        user_id, 
        category,
        type,
        occurred_at,
        payload->>'title' as title,
        created_at
      FROM events 
      WHERE category = 'MEETING' 
        AND occurred_at > NOW() - INTERVAL '2 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${meetings.rows.length} recent meetings:\n`);
    meetings.rows.forEach((m, i) => {
      console.log(`  ${i + 1}. "${m.title || 'N/A'}" (${m.type})`);
      console.log(`     Event ID: ${m.id.substring(0, 8)}...`);
      console.log(`     User: ${m.user_id.substring(0, 8)}...`);
      console.log(`     Scheduled for: ${new Date(m.occurred_at).toLocaleString()}`);
      console.log(`     Created at: ${new Date(m.created_at).toLocaleString()}`);
    });

    // 2. Check alerts for these meetings
    console.log('\n[2] ALERTS FOR THESE MEETINGS');
    const meetingIds = meetings.rows.map(m => m.id);
    
    if (meetingIds.length > 0) {
      const alerts = await pool.query(`
        SELECT 
          a.id,
          a.event_id,
          a.alert_type,
          a.status,
          a.scheduled_at,
          a.delivered_at,
          a.created_at,
          e.payload->>'title' as meeting_title,
          COUNT(*) OVER (PARTITION BY a.event_id, a.alert_type) as alert_count
        FROM alerts a
        LEFT JOIN events e ON a.event_id = e.id
        WHERE a.event_id = ANY($1::uuid[])
        ORDER BY a.event_id, a.alert_type, a.created_at DESC
      `, [meetingIds]);

      console.log(`\nFound ${alerts.rows.length} total alerts:\n`);
      
      // Group by event
      const byEvent = {};
      alerts.rows.forEach(row => {
        if (!byEvent[row.event_id]) byEvent[row.event_id] = [];
        byEvent[row.event_id].push(row);
      });

      Object.entries(byEvent).forEach(([eventId, eventAlerts]) => {
        const title = eventAlerts[0]?.meeting_title || 'Unknown';
        console.log(`\n  MEETING: "${title}" (${eventId.substring(0, 8)}...)`);
        
        eventAlerts.forEach(alert => {
          const isDuplicate = alert.alert_count > 1;
          const marker = isDuplicate ? '⚠️ DUPLICATE' : '✓';
          console.log(`    ${marker} ${alert.alert_type} (${alert.status})`);
          console.log(`       Count: ${alert.alert_count} | Created: ${new Date(alert.created_at).toLocaleTimeString()}`);
          if (alert.delivered_at) {
            console.log(`       Delivered: ${new Date(alert.delivered_at).toLocaleTimeString()}`);
          }
        });
      });
    }

    // 3. Check if same alert is being delivered multiple times
    console.log('\n[3] DELIVERY LOCK CHECK (same alert_id delivered twice?)');
    const deliveryCheck = await pool.query(`
      SELECT 
        id,
        event_id,
        alert_type,
        status,
        COUNT(*) as delivery_count,
        MIN(delivered_at) as first_delivery,
        MAX(delivered_at) as last_delivery
      FROM alerts
      WHERE status = 'DELIVERED'
        AND delivered_at IS NOT NULL
      GROUP BY id, event_id, alert_type, status
      HAVING COUNT(*) > 1
      LIMIT 5
    `);

    if (deliveryCheck.rows.length > 0) {
      console.log(`⚠️ WARNING: Found alerts delivered multiple times:\n`);
      deliveryCheck.rows.forEach(row => {
        console.log(`  Alert ID: ${row.id.substring(0, 8)}...`);
        console.log(`  Type: ${row.alert_type}`);
        console.log(`  Delivery count: ${row.delivery_count}`);
        console.log(`  First delivery: ${new Date(row.first_delivery).toLocaleTimeString()}`);
        console.log(`  Last delivery: ${new Date(row.last_delivery).toLocaleTimeString()}`);
      });
    } else {
      console.log('✓ No duplicate deliveries detected (delivery lock working)');
    }

    // 4. Check UNIQUE constraint on alerts table
    console.log('\n[4] CHECKING UNIQUE CONSTRAINT');
    const constraint = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'alerts' 
        AND constraint_type = 'UNIQUE'
    `);

    if (constraint.rows.length > 0) {
      constraint.rows.forEach(c => {
        console.log(`  ✓ ${c.constraint_name} (${c.constraint_type})`);
      });
      
      // Get the columns in the unique constraint
      const cols = await pool.query(`
        SELECT a.attname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'u' AND t.relname = 'alerts'
      `);
      
      console.log(`  Columns: ${cols.rows.map(r => r.attname).join(', ')}`);
    } else {
      console.log('  ❌ NO UNIQUE CONSTRAINT FOUND!');
    }

    // 5. Check for duplicate event_id + alert_type combinations
    console.log('\n[5] DUPLICATE EVENT + ALERT_TYPE COMBINATIONS');
    const dups = await pool.query(`
      SELECT 
        event_id,
        alert_type,
        COUNT(*) as count,
        STRING_AGG(id::text, ', ') as alert_ids
      FROM alerts
      WHERE event_id IS NOT NULL
      GROUP BY event_id, alert_type
      HAVING COUNT(*) > 1
      LIMIT 5
    `);

    if (dups.rows.length > 0) {
      console.log(`⚠️ Found ${dups.rows.length} event+alert_type combinations with duplicates:\n`);
      dups.rows.forEach(row => {
        console.log(`  Event: ${row.event_id.substring(0, 8)}...`);
        console.log(`  Alert Type: ${row.alert_type}`);
        console.log(`  Count: ${row.count}`);
        console.log(`  Alert IDs: ${row.alert_ids.split(', ').join(', ')}`);
      });
    } else {
      console.log('✓ No duplicate event+alert_type combinations');
    }

    console.log('\n' + '═'.repeat(80));
    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

debug();
