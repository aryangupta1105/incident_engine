/**
 * Verify Calendar Credentials Schema
 */

require('dotenv').config();
const pool = require('./db');
const { v4: uuid } = require('uuid');

async function verifySchema() {
  const client = await pool.connect();

  try {
    console.log('\n========================================');
    console.log('SCHEMA VERIFICATION REPORT');
    console.log('========================================\n');

    // 1. Check calendar_credentials table
    console.log('1. calendar_credentials table:');
    const credTable = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'calendar_credentials'
    `);

    if (credTable.rows.length === 0) {
      console.log('   ❌ MISSING\n');
    } else {
      console.log('   ✅ EXISTS\n');

      // Show columns
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'calendar_credentials'
        ORDER BY ordinal_position
      `);

      console.log('   Columns:');
      columns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
        console.log(`     • ${col.column_name.padEnd(20)} ${col.data_type.padEnd(15)} ${nullable}`);
      });

      // Show constraints
      const constraints = await client.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'calendar_credentials'
      `);

      console.log('\n   Constraints:');
      constraints.rows.forEach(c => {
        console.log(`     • ${c.constraint_name} (${c.constraint_type})`);
      });

      // Show indexes
      const indexes = await client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'calendar_credentials'
      `);

      console.log('\n   Indexes:');
      indexes.rows.forEach(idx => {
        console.log(`     • ${idx.indexname}`);
      });
      console.log();
    }

    // 2. Check calendar_event_mappings table
    console.log('2. calendar_event_mappings table:');
    const mappTable = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'calendar_event_mappings'
    `);

    if (mappTable.rows.length === 0) {
      console.log('   ❌ MISSING\n');
    } else {
      console.log('   ✅ EXISTS\n');

      // Show columns
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'calendar_event_mappings'
        ORDER BY ordinal_position
      `);

      console.log('   Columns:');
      columns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
        console.log(`     • ${col.column_name.padEnd(20)} ${col.data_type.padEnd(15)} ${nullable}`);
      });

      // Show indexes
      const indexes = await client.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'calendar_event_mappings'
      `);

      console.log('\n   Indexes:');
      indexes.rows.forEach(idx => {
        console.log(`     • ${idx.indexname}`);
      });
      console.log();
    }

    // 3. Verify migration record
    console.log('3. Migration tracking:');
    const mig = await client.query(`
      SELECT name, executed_at FROM _migrations 
      WHERE name = '005_create_calendar_credentials_table.sql'
    `);

    if (mig.rows.length === 0) {
      console.log('   ❌ Migration NOT recorded\n');
    } else {
      const record = mig.rows[0];
      console.log(`   ✅ Recorded at ${record.executed_at}\n`);
    }

    // 4. Test insertion
    console.log('4. Testing credential insertion:');
    try {
      const testId = uuid();  // Generate valid UUID for test
      const result = await client.query(`
        INSERT INTO calendar_credentials (
          user_id, access_token, token_expiry
        ) VALUES ($1, $2, NOW() + INTERVAL '1 hour')
        RETURNING id, user_id, created_at
      `, [testId, 'test-token-' + Date.now()]);

      console.log(`   ✅ Insert successful (test record: ${result.rows[0].id})`);

      // Cleanup
      await client.query('DELETE FROM calendar_credentials WHERE user_id = $1', [testId]);
      console.log('   ✅ Cleanup successful\n');
    } catch (err) {
      console.log(`   ❌ Insert failed: ${err.message}\n`);
    }

    // Summary
    console.log('========================================');
    if (credTable.rows.length > 0 && mappTable.rows.length > 0) {
      console.log('✅ ALL SCHEMA CHECKS PASSED');
      console.log('OAuth callback should work now');
    } else {
      console.log('❌ SCHEMA INCOMPLETE');
      console.log('Run: node migrate.js');
    }
    console.log('========================================\n');

    process.exit(credTable.rows.length > 0 && mappTable.rows.length > 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verifySchema();
