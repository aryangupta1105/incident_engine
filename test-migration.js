const pool = require('./db');
const fs = require('fs');

async function test() {
  try {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'events'"
    );
    
    if (tables.rows.length > 0) {
      console.log('✓ Events table already exists, skipping migration');
      pool.end();
      return;
    }
    
    const sql = fs.readFileSync('./migrations/003_create_events_table.sql', 'utf8');
    
    await pool.query(sql);
    console.log('✓ Migration executed successfully');
    
    pool.end();
  } catch (err) {
    console.error('✗ Error:', err.message);
    pool.end();
    process.exit(1);
  }
}

test();
