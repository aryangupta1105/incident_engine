/**
 * Migration Runner
 * Executes SQL migration 007 safely
 */

const pool = require('./db');

async function runMigration() {
  try {
    console.log('[MIGRATION] Starting production columns migration...');
    
    // 1. Add cancelled_at to alerts
    try {
      await pool.query(`
        ALTER TABLE alerts 
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL;
      `);
      console.log('[MIGRATION] ✓ Added alerts.cancelled_at');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('[MIGRATION] ✓ alerts.cancelled_at already exists');
      }
    }
    
    // 2. Index on cancelled_at
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_cancelled_at 
        ON alerts(cancelled_at) 
        WHERE cancelled_at IS NOT NULL;
      `);
      console.log('[MIGRATION] ✓ Created index idx_alerts_cancelled_at');
    } catch (err) {
      console.log('[MIGRATION] ✓ Index already exists');
    }
    
    // 3. Add phone to users
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL;
      `);
      console.log('[MIGRATION] ✓ Added users.phone');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('[MIGRATION] ✓ users.phone already exists');
      }
    }
    
    // 4. Index on phone
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_phone 
        ON users(phone) 
        WHERE phone IS NOT NULL;
      `);
      console.log('[MIGRATION] ✓ Created index idx_users_phone');
    } catch (err) {
      console.log('[MIGRATION] ✓ Phone index already exists');
    }
    
    // 5. Add google_connected_at to users
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMP NULL;
      `);
      console.log('[MIGRATION] ✓ Added users.google_connected_at');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('[MIGRATION] ✓ users.google_connected_at already exists');
      }
    }
    
    // 6. Add revoked to users
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT FALSE;
      `);
      console.log('[MIGRATION] ✓ Added users.revoked');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.log('[MIGRATION] ✓ users.revoked already exists');
      }
    }
    
    // 7. Index on revoked
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_revoked 
        ON users(revoked) 
        WHERE revoked = TRUE;
      `);
      console.log('[MIGRATION] ✓ Created index idx_users_revoked');
    } catch (err) {
      console.log('[MIGRATION] ✓ Revoked index already exists');
    }
    
    // Verify columns exist
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'alerts' 
      AND column_name IN ('cancelled_at', 'delivered_at', 'status')
      ORDER BY column_name;
    `);
    
    console.log('[MIGRATION] Verified alerts table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    
    const userResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('phone', 'google_connected_at', 'revoked', 'email')
      ORDER BY column_name;
    `);
    
    console.log('[MIGRATION] Verified users table columns:');
    userResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });
    
    console.log('\n✅ Migration 007 completed successfully');
    console.log('[MIGRATION] System is now production-ready');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
