/**
 * VERIFY: Check alert delivery results
 * 
 * Run after delivery worker has processed alerts
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Aryan2005@localhost:5432/savehub'
});

async function main() {
  const eventId = process.argv[2];
  
  if (!eventId) {
    console.error('Usage: node verify-duplicate-test.js <eventId>');
    process.exit(1);
  }

  console.log(`\n📊 VERIFICATION RESULTS FOR EVENT: ${eventId}\n`);

  try {
    // Check alert status
    const result = await pool.query(
      `SELECT 
        alert_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count
       FROM alerts
       WHERE event_id = $1
       GROUP BY alert_type
       ORDER BY alert_type`,
      [eventId]
    );

    console.log('Alert Delivery Status:\n');
    
    let passed = true;
    for (const row of result.rows) {
      const totalCount = parseInt(row.total_count);
      const isGood = totalCount === 1;
      const marker = isGood ? '✅' : '❌';
      
      console.log(`${marker} ${row.alert_type}`);
      console.log(`   Total: ${totalCount} | Delivered: ${row.delivered_count} | Pending: ${row.pending_count}`);
      
      if (!isGood) {
        console.log(`   ⚠️  DUPLICATE DETECTED! Expected 1 alert but found ${totalCount}`);
        passed = false;
      }
      console.log('');
    }

    if (passed && result.rows.length === 3) {
      console.log('✅ TEST PASSED!');
      console.log('   No duplicates detected. Each alert type delivered exactly once.\n');
      console.log('📝 Next steps:');
      console.log('   1. Check your phone for the call (should hear reminder about TEST MEETING)');
      console.log('   2. Check your email for the messages');
      console.log('   3. Review server logs for "[CALL] Reminder message:" to verify TwiML\n');
    } else if (result.rows.length < 3) {
      console.log('⏳ TEST INCOMPLETE');
      console.log('   Not all alerts were created or delivered yet.\n');
    } else {
      console.log('❌ TEST FAILED!');
      console.log('   Duplicate alerts detected! The fix may not be working.\n');
    }

  } catch (err) {
    console.error('❌ Verification failed:', err.message);
  } finally {
    await pool.end();
  }
}

main();
