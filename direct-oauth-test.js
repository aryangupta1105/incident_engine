/**
 * DIRECT OAUTH CALLBACK TEST
 * 
 * This script directly triggers the OAuth callback code path
 * to see the EXACT traces in real execution context.
 * 
 * It simulates what would happen when Google redirects back to our callback endpoint.
 * 
 * Run with: node direct-oauth-test.js
 */

const { randomUUID } = require('crypto');
const { validate: validateUUID } = require('uuid');

console.error('\n🔥🔥🔥 DIRECT OAUTH CALLBACK TEST 🔥🔥🔥\n');

// Import the actual googleOAuth service
const googleOAuth = require('./services/googleOAuth');

console.error('Step 1: Import googleOAuth.storeCredentials');
console.error('  Function type:', typeof googleOAuth.storeCredentials);
console.error('  Function name:', googleOAuth.storeCredentials.name);
console.error('');

// Simulate a valid UUID being passed (what authRoutes.js:155 generates)
const testUserId = randomUUID();
console.error('Step 2: Generate test UUID (simulating authRoutes.js:155)');
console.error('  UUID:', testUserId);
console.error('  Valid:', validateUUID(testUserId));
console.error('');

// Create mock tokens like Google would send
const mockTokens = {
  access_token: 'ya29.a0AfH6SMBx_MOCK_TOKEN_FOR_TESTING',
  refresh_token: 'MOCK_REFRESH_TOKEN',
  expires_in: 3600,
  token_type: 'Bearer'
};

console.error('Step 3: Create mock tokens (simulating Google OAuth response)');
console.error('  access_token:', mockTokens.access_token.substring(0, 20) + '...');
console.error('  expires_in:', mockTokens.expires_in);
console.error('');

// Now attempt to call storeCredentials with the generated UUID
console.error('Step 4: Call googleOAuth.storeCredentials()');
console.error('  Calling: storeCredentials(' + testUserId + ', tokens)');
console.error('');

(async () => {
  try {
    // This will trigger all the traces in the actual code
    await googleOAuth.storeCredentials(testUserId, mockTokens);
    
    console.error('Step 5: SUCCESS - Credentials stored');
    console.error('  UUID successfully persisted to database');
    console.error('  ✅ PASS: Real OAuth flow completed without UUID error');
    
  } catch (err) {
    console.error('Step 5: ERROR - ' + err.message);
    console.error('  Error type:', err.code || err.name);
    console.error('  Full error:', err);
    
    // Check if it's a UUID validation error
    if (err.message.includes('Invalid UUID')) {
      console.error('\n  ❌ VALIDATION ERROR - UUID was rejected');
    } 
    // Check if it's a database connection error (expected if no real DB)
    else if (err.message.includes('connect') || err.code === 'ECONNREFUSED') {
      console.error('\n  ⚠️  DATABASE CONNECTION ERROR (expected if no Supabase running)');
      console.error('  But this means UUID validation PASSED and reached DB layer!');
    }
    // Check if it's a PostgreSQL error about UUID type
    else if (err.message.includes('invalid input syntax for type uuid')) {
      console.error('\n  ❌ POSTGRESQL UUID TYPE ERROR');
      console.error('  This means a non-UUID value reached the database!');
      console.error('  Currently passing:', testUserId);
      process.exit(1);
    }
    else {
      console.error('\n  ⚠️  Other error (may not be UUID-related)');
    }
  }
  
  console.error('\n🔥🔥🔥 TEST COMPLETE 🔥🔥🔥\n');
})();
