const pool = require('./db');

async function getUsers() {
  try {
    const res = await pool.query('SELECT id, email, name FROM users LIMIT 5');
    console.log('Users in system:');
    res.rows.forEach(u => {
      console.log(`${u.id} | ${u.email} | ${u.name}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

getUsers();
