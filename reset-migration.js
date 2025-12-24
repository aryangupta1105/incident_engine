/**
 * Reset migration record for 005_create_calendar_credentials_table.sql
 */

require('dotenv').config();
const pool = require('./db');

async function resetMigration() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "DELETE FROM _migrations WHERE name = $1",
      ['005_create_calendar_credentials_table.sql']
    );
    console.log(`✓ Migration record deleted (${result.rowCount} row)`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

resetMigration();
