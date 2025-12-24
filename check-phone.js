const pool = require('./db');

pool.query("SELECT id, email, phone FROM users WHERE email = 'test-1766207856197@example.com'")
  .then(r => {
    const user = r.rows[0];
    console.log('User:', user.email);
    console.log('Phone field:', user.phone || 'NULL');
    console.log('DEV_PHONE_NUMBER:', process.env.DEV_PHONE_NUMBER);
    console.log('');
    console.log('This means the call should route to DEV_PHONE_NUMBER:', process.env.DEV_PHONE_NUMBER);
    process.exit(0);
  })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
