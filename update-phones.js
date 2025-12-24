const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function updatePhones() {
  try {
    const result = await pool.query(
      "UPDATE users SET phone = $1 WHERE email LIKE $2 RETURNING email, phone",
      ['+916263038693', 'test-%']
    );
    console.log(`Updated ${result.rowCount} test users with phone: +916263038693`);
    result.rows.forEach(r => console.log(`  ✓ ${r.email}: ${r.phone}`));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updatePhones();
