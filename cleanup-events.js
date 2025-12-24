require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    // Delete all events for the test user
    const deleteRes = await pool.query(
      'DELETE FROM events WHERE user_id = $1',
      ['b3c99058-5c51-5e99-9131-7368dfb9123b']
    );
    console.log(`Deleted ${deleteRes.rowCount} events`);
    
    // Also delete calendar event mappings
    const mapRes = await pool.query(
      'DELETE FROM calendar_event_mappings WHERE user_id = $1',
      ['b3c99058-5c51-5e99-9131-7368dfb9123b']
    );
    console.log(`Deleted ${mapRes.rowCount} calendar event mappings`);
    
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
