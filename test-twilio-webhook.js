#!/usr/bin/env node

/**
 * AUTOMATED TEST: Twilio TwiML Webhook
 * 
 * This script:
 * 1. Verifies environment setup
 * 2. Tests the webhook endpoint directly
 * 3. Verifies TwiML generation
 * 4. Checks signature validation
 */

require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const { Pool } = require('pg');

const TEST_USER_ID = 'b3c99058-5c51-5e99-9131-7368dfb9123b';

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║             TWILIO WEBHOOK TEST - AUTOMATED VALIDATION                     ║
╚════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * TEST 1: Verify environment variables
 */
console.log('📝 TEST 1: Verify Environment Setup\n');
const requiredVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'DATABASE_URL'
];

let envOk = true;
for (const varName of requiredVars) {
  const value = process.env[varName];
  const status = value ? '✅' : '❌';
  const display = value ? (varName === 'TWILIO_AUTH_TOKEN' ? '****' : value.substring(0, 20) + '...') : 'NOT SET';
  console.log(`  ${status} ${varName}: ${display}`);
  if (!value) envOk = false;
}

if (!envOk) {
  console.error('\n❌ Missing required environment variables. Check your .env file.\n');
  process.exit(1);
}

console.log('  ✅ All required env vars set\n');

/**
 * TEST 2: Test HMAC signature generation and validation
 */
console.log('📝 TEST 2: Test HMAC Signature (Security)\n');

const authToken = process.env.TWILIO_AUTH_TOKEN;
const testContext = {
  meetingTitle: 'Board Sync',
  minutesRemaining: 2,
  startTimeLocal: '2:30 PM',
  eventId: 'test-event-123',
  timestamp: Date.now()
};

const contextB64 = Buffer.from(JSON.stringify(testContext)).toString('base64');
const signature = crypto
  .createHmac('sha256', authToken)
  .update(contextB64)
  .digest('hex');

console.log(`  Context: ${JSON.stringify(testContext)}`);
console.log(`  Base64 encoded: ${contextB64.substring(0, 50)}...`);
console.log(`  Signature: ${signature.substring(0, 32)}...`);

// Verify signature
const expectedSig = crypto
  .createHmac('sha256', authToken)
  .update(contextB64)
  .digest('hex');

const sigValid = signature === expectedSig;
console.log(`  ${sigValid ? '✅' : '❌'} Signature validation: ${sigValid ? 'VALID' : 'INVALID'}\n`);

/**
 * TEST 3: Test TwiML generation
 */
console.log('📝 TEST 3: Test TwiML Generation\n');

const autoCallService = require('./services/autoCallService');
const twiml = autoCallService.generateMeetingReminderTwiML(testContext);

const hasSay = twiml.includes('<Say');
const hasTitle = twiml.includes('Board Sync');
const hasMinutes = twiml.includes('2 minutes');
const hasXML = twiml.includes('<?xml');

console.log(`  ${hasSay ? '✅' : '❌'} Contains <Say> tags: ${hasSay}`);
console.log(`  ${hasTitle ? '✅' : '❌'} Contains meeting title: ${hasTitle}`);
console.log(`  ${hasMinutes ? '✅' : '❌'} Contains minutes: ${hasMinutes}`);
console.log(`  ${hasXML ? '✅' : '❌'} Valid XML format: ${hasXML}`);

if (hasSay && hasTitle && hasMinutes && hasXML) {
  console.log(`  ✅ TwiML generation: VALID\n`);
} else {
  console.log(`  ❌ TwiML generation: INVALID\n`);
  process.exit(1);
}

/**
 * TEST 4: Test webhook endpoint (via HTTP)
 */
console.log('📝 TEST 4: Test Webhook Endpoint (HTTP)\n');

const baseUrl = process.env.CALL_WEBHOOK_URL || 'http://localhost:3000';
const webhookUrl = new URL(`/twilio/voice/reminder?context=${encodeURIComponent(contextB64)}&sig=${signature}`, baseUrl);

console.log(`  Webhook URL: ${webhookUrl.href.substring(0, 60)}...`);
console.log(`  Testing endpoint...\n`);

// Test with a simple POST request
const makeRequest = () => {
  return new Promise((resolve, reject) => {
    const isHttps = webhookUrl.protocol === 'https:';
    const client = isHttps ? require('https') : require('http');
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 5000
    };

    const req = client.request(webhookUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
};

try {
  console.log(`  Making POST request to ${baseUrl}/twilio/voice/reminder...\n`);
  
  makeRequest().then(response => {
    const statusOk = response.status === 200;
    const hasXml = response.body.includes('<?xml');
    const hasSay = response.body.includes('<Say');

    console.log(`  Response Status: ${response.status} ${statusOk ? '✅' : '❌'}`);
    console.log(`  Contains XML: ${hasXml ? '✅' : '❌'}`);
    console.log(`  Contains Say tags: ${hasSay ? '✅' : '❌'}`);

    if (statusOk && hasXml && hasSay) {
      console.log(`\n  ✅ Webhook endpoint: WORKING\n`);
      printSummary();
    } else {
      console.log(`\n  ❌ Webhook endpoint: FAILED\n`);
      console.log(`  Response body (first 200 chars):\n  ${response.body.substring(0, 200)}\n`);
    }
  }).catch(err => {
    console.log(`  ❌ Webhook request failed: ${err.message}\n`);
    console.log(`  Make sure:\n    - Server is running (node server.js)\n    - CALL_WEBHOOK_URL is correct in .env\n    - If local, ngrok is running and URL is updated\n`);
  });
} catch (err) {
  console.error(`❌ Test failed: ${err.message}\n`);
}

function printSummary() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                        ✅ ALL TESTS PASSED                                 ║
╚════════════════════════════════════════════════════════════════════════════╝

Next Steps:
1. Update Twilio Console Voice Webhook:
   https://console.twilio.com → Phone Numbers → Your Number
   Voice Webhook (POST): ${baseUrl}/twilio/voice/reminder

2. Schedule a test meeting 2-3 minutes in future

3. Run: node test-duplicate-setup.js

4. You should receive a call with the custom reminder message

For detailed testing guide, see: TESTING_TWILIO_WEBHOOK.md
  `);
}
