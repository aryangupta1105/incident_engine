/**
 * OAuth Integration Test
 * 
 * Tests that:
 * 1. calendar_credentials table exists
 * 2. Credentials can be stored (simulating OAuth callback)
 * 3. Credentials can be retrieved
 * 4. Token expiry check works
 * 5. Deletion works
 */

require('dotenv').config();
const pool = require('./db');
const googleOAuth = require('./services/googleOAuth');
const { v4: uuid } = require('uuid');

async function testOAuthIntegration() {
  console.log('\n========================================');
  console.log('OAUTH INTEGRATION TEST');
  console.log('========================================\n');

  let testUserId = uuid();
  let testPassed = 0;
  let testFailed = 0;

  try {
    // TEST 1: Check table exists
    console.log('TEST 1: Verify calendar_credentials table exists');
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'calendar_credentials'
    `);
    if (tableCheck.rows.length > 0) {
      console.log('  ✅ PASS\n');
      testPassed++;
    } else {
      console.log('  ❌ FAIL - Table does not exist\n');
      testFailed++;
      process.exit(1);
    }

    // TEST 2: Store credentials (simulate OAuth callback)
    console.log('TEST 2: Store OAuth credentials');
    const mockTokens = {
      access_token: 'ya29.a0AfH6SMBx_Example_Token_' + Date.now(),
      refresh_token: 'refresh_token_example_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/calendar.readonly'
    };

    try {
      const result = await googleOAuth.storeCredentials(testUserId, mockTokens);
      if (result && result.stored) {
        console.log(`  ✅ PASS - Credentials stored for user: ${testUserId}`);
        console.log(`     Token expiry: ${result.tokenExpiry}\n`);
        testPassed++;
      } else {
        console.log('  ❌ FAIL - Store returned unexpected result\n');
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // TEST 3: Retrieve credentials
    console.log('TEST 3: Retrieve stored credentials');
    try {
      const creds = await googleOAuth.getCredentials(testUserId);
      if (creds && creds.access_token) {
        console.log(`  ✅ PASS - Retrieved credentials for user: ${testUserId}`);
        console.log(`     Access token: ${creds.access_token.substring(0, 20)}...`);
        console.log(`     Refresh token: ${creds.refresh_token ? 'present' : 'null'}`);
        console.log(`     Expiry: ${creds.token_expiry}\n`);
        testPassed++;
      } else {
        console.log('  ❌ FAIL - Could not retrieve credentials\n');
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // TEST 4: Check token expiry
    console.log('TEST 4: Check token expiry logic');
    try {
      const creds = await googleOAuth.getCredentials(testUserId);
      const isExpired = googleOAuth.isTokenExpired(creds.token_expiry, 300);
      if (!isExpired) {
        console.log(`  ✅ PASS - Token is NOT expired (as expected)\n`);
        testPassed++;
      } else {
        console.log(`  ❌ FAIL - Token marked as expired incorrectly\n`);
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // TEST 5: Check credentials exist
    console.log('TEST 5: Check if user has credentials');
    try {
      const hasCredsResult = await googleOAuth.hasCredentials(testUserId);
      if (hasCredsResult) {
        console.log(`  ✅ PASS - Credentials confirmed for user\n`);
        testPassed++;
      } else {
        console.log(`  ❌ FAIL - hasCredentials() returned false\n`);
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // TEST 6: Delete credentials
    console.log('TEST 6: Delete credentials');
    try {
      const deleteResult = await googleOAuth.deleteCredentials(testUserId);
      if (deleteResult) {
        console.log(`  ✅ PASS - Credentials deleted\n`);
        testPassed++;
      } else {
        console.log(`  ❌ FAIL - Deletion returned false\n`);
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // TEST 7: Verify deletion
    console.log('TEST 7: Verify deletion');
    try {
      const hasCredsAfterDelete = await googleOAuth.hasCredentials(testUserId);
      if (!hasCredsAfterDelete) {
        console.log(`  ✅ PASS - Credentials confirmed deleted\n`);
        testPassed++;
      } else {
        console.log(`  ❌ FAIL - Credentials still exist after deletion\n`);
        testFailed++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL - ${err.message}\n`);
      testFailed++;
    }

    // SUMMARY
    console.log('========================================');
    console.log(`RESULTS: ${testPassed} passed, ${testFailed} failed`);
    console.log('========================================\n');

    if (testFailed === 0) {
      console.log('✅ ALL TESTS PASSED');
      console.log('OAuth integration is ready for production use\n');
      process.exit(0);
    } else {
      console.log('❌ SOME TESTS FAILED');
      console.log('Fix errors before proceeding\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Test suite error:', err.message);
    process.exit(1);
  }
}

testOAuthIntegration();
