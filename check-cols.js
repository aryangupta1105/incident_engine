const pool = require('./db');

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts' AND column_name IN ('delivered_at', 'cancelled_at') ORDER BY column_name")
  .then(r => {
    console.log('Alert columns:', r.rows.map(row => row.column_name).join(', '));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
