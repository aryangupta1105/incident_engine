/**
 * cleanup-legacy-oauth-data.js
 * 
 * MANDATORY ONE-TIME CLEANUP
 * 
 * Problem:
 * Old users/alerts created before email support have NULL email.
 * They will NEVER work because:
 * - Alert delivery needs email to send notifications
 * - Alert retry loops will execute infinitely
 * 
 * Solution:
 * Delete users with NULL email and all alerts linked to them.
 * This prevents retry spam and cleanup old test data.
 * 
 * DANGER:
 * This DELETES data permanently.
 * Only run this ONCE before going to production.
 * Back up your database first.
 * 
 * Usage:
 *   node cleanup-legacy-oauth-data.js
 */

require('dotenv').config();
const pool = require('./db');

async function cleanupLegacyData() {
  const client = await pool.connect();
  
  try {
    console.log('[CLEANUP] Starting cleanup of legacy OAuth data...');
    console.log('[CLEANUP] This will delete users with NULL email and their alerts.');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // =========================================================
    // STEP 1: Find users with NULL email
    // =========================================================
    console.log('[CLEANUP] Finding users with NULL email...');
    const usersResult = await client.query(
      'SELECT id, email, created_at FROM users WHERE email IS NULL'
    );
    
    const usersToDelete = usersResult.rows;
    console.log(`[CLEANUP] Found ${usersToDelete.length} users with NULL email`);
    
    if (usersToDelete.length === 0) {
      console.log('[CLEANUP] No users with NULL email. Cleanup complete.');
      await client.query('COMMIT');
      return;
    }
    
    // Log which users will be deleted
    usersToDelete.forEach(user => {
      console.log(`  - User ${user.id} (created ${user.created_at})`);
    });
    
    // =========================================================
    // STEP 2: Find and delete alerts linked to these users
    // =========================================================
    const userIds = usersToDelete.map(u => u.id);
    
    console.log('[CLEANUP] Finding alerts linked to these users...');
    const alertsResult = await client.query(
      'SELECT id, user_id FROM alerts WHERE user_id = ANY($1)',
      [userIds]
    );
    
    const alertsToDelete = alertsResult.rows;
    console.log(`[CLEANUP] Found ${alertsToDelete.length} alerts to delete`);
    
    if (alertsToDelete.length > 0) {
      alertsToDelete.forEach(alert => {
        console.log(`  - Alert ${alert.id} (user ${alert.user_id})`);
      });
      
      const deleteAlertsResult = await client.query(
        'DELETE FROM alerts WHERE user_id = ANY($1)',
        [userIds]
      );
      console.log(`[CLEANUP] Deleted ${deleteAlertsResult.rowCount} alerts`);
    }
    
    // =========================================================
    // STEP 3: Delete calendar_credentials linked to these users
    // =========================================================
    console.log('[CLEANUP] Finding calendar credentials linked to these users...');
    const credsResult = await client.query(
      'SELECT id, user_id FROM calendar_credentials WHERE user_id = ANY($1)',
      [userIds]
    );
    
    const credsToDelete = credsResult.rows;
    console.log(`[CLEANUP] Found ${credsToDelete.length} credential records to delete`);
    
    if (credsToDelete.length > 0) {
      const deleteCredsResult = await client.query(
        'DELETE FROM calendar_credentials WHERE user_id = ANY($1)',
        [userIds]
      );
      console.log(`[CLEANUP] Deleted ${deleteCredsResult.rowCount} credential records`);
    }
    
    // =========================================================
    // STEP 4: Delete users with NULL email
    // =========================================================
    console.log('[CLEANUP] Deleting users with NULL email...');
    const deleteUsersResult = await client.query(
      'DELETE FROM users WHERE id = ANY($1)',
      [userIds]
    );
    console.log(`[CLEANUP] Deleted ${deleteUsersResult.rowCount} users`);
    
    // =========================================================
    // STEP 5: Verify cleanup
    // =========================================================
    console.log('[CLEANUP] Verifying cleanup...');
    const verifyResult = await client.query(
      'SELECT COUNT(*) as count FROM users WHERE email IS NULL'
    );
    const remainingNullEmails = parseInt(verifyResult.rows[0].count);
    
    if (remainingNullEmails === 0) {
      console.log('[CLEANUP] ✅ Verification passed: No users with NULL email remain');
      // Commit transaction
      await client.query('COMMIT');
      console.log('[CLEANUP] ✅ Cleanup complete. All changes committed.');
      console.log('[CLEANUP] Database is now ready for production OAuth with email support.');
    } else {
      console.error(`[CLEANUP] ❌ Verification FAILED: ${remainingNullEmails} users still have NULL email`);
      await client.query('ROLLBACK');
      process.exit(1);
    }
    
  } catch (err) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('[CLEANUP] ❌ Cleanup failed:', err.message);
    console.error('[CLEANUP] All changes rolled back.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run cleanup
cleanupLegacyData().catch(err => {
  console.error('[CLEANUP] Fatal error:', err.message);
  process.exit(1);
});
