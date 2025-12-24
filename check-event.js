require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    const res = await pool.query(
      `SELECT id, category, type, payload, occurred_at FROM events 
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      ['b3c99058-5c51-5e99-9131-7368dfb9123b']
    );
    
    if (res.rows.length > 0) {
      const event = res.rows[0];
      console.log('Latest event:');
      console.log('  Type:', event.type);
      console.log('  Category:', event.category);
      console.log('  Occurred at:', event.occurred_at);
      console.log('  Payload:', JSON.stringify(event.payload, null, 2));
    } else {
      console.log('No events found');
    }
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
