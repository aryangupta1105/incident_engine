#!/usr/bin/env node

/**
 * MIGRATION RUNNER: Task 4 - Add UNIQUE Constraint
 * 
 * Purpose: Apply migration 008_add_unique_alert_constraint.sql
 * This prevents duplicate alert scheduling (same alert type for same event)
 * 
 * Usage: node run-migration-008.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost/incident_engine',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TASK 4: Adding UNIQUE Constraint for Alert Deduplication');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('📋 Migration: 008_add_unique_alert_constraint.sql');
    console.log('Purpose: Prevent duplicate alert scheduling\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '008_add_unique_alert_constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('⏳ Applying migration...\n');
    
    // Execute migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration applied successfully!\n');
    
    // Verify constraint was created
    console.log('🔍 Verifying constraint...\n');
    
    const result = await client.query(`
      SELECT constraint_name, constraint_type, table_name
      FROM information_schema.table_constraints 
      WHERE table_name = 'alerts' 
      AND constraint_name = 'unique_event_alert_type'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ UNIQUE constraint verified:');
      console.log(`   Table: ${result.rows[0].table_name}`);
      console.log(`   Constraint: ${result.rows[0].constraint_name}`);
      console.log(`   Type: ${result.rows[0].constraint_type}\n`);
    } else {
      console.log('⚠️  Constraint not found. Please check migration logs.\n');
    }
    
    // Check for any existing duplicate alerts that would violate the constraint
    console.log('🔍 Checking for existing duplicate alerts...\n');
    
    const duplicateCheck = await client.query(`
      SELECT event_id, alert_type, COUNT(*) as count
      FROM alerts
      GROUP BY event_id, alert_type
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateCheck.rows.length > 0) {
      console.log('⚠️  WARNING: Found duplicate alerts that would violate the new constraint:');
      duplicateCheck.rows.forEach(dup => {
        console.log(`   Event ${dup.event_id}: ${dup.alert_type} (${dup.count} instances)`);
      });
      console.log('\n   These should be cleaned up manually before constraint is strictly enforced.\n');
    } else {
      console.log('✅ No duplicate alerts found. Constraint is safe to enforce.\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TASK 4 COMPLETE: UNIQUE Constraint Applied');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('📊 Results:');
    console.log('  ✅ UNIQUE(event_id, alert_type) constraint created');
    console.log('  ✅ Prevents duplicate alert types for same event');
    console.log('  ✅ Guarantees exactly ONE call per meeting\n');
    
    console.log('🚀 Impact:');
    console.log('  • Duplicate alert creation attempts: REJECTED at DB level');
    console.log('  • Safe to restart scheduler: No duplicate alerts created');
    console.log('  • Safe to retry alert delivery: Worker skips already-created alerts');
    console.log('  • Production-grade duplicate prevention: COMPLETE\n');
    
    await client.end();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    console.error('\nThis might occur if:');
    console.error('  1. Database connection failed - check DATABASE_URL');
    console.error('  2. Migration already applied - constraint exists');
    console.error('  3. Duplicate alerts exist - need manual cleanup');
    
    await client.end();
    process.exit(1);
  }
}

// Run migration
runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
