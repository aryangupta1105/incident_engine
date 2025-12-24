/**
 * Twilio Voice Webhook Routes
 * 
 * Handles webhook requests from Twilio for dynamic TwiML generation.
 * This endpoint serves TwiML in response to Twilio's request, ensuring
 * custom reminder messages play instead of fallback Voice Webhook content.
 * 
 * ⚠️ CRITICAL TWILIO CONSOLE CONFIGURATION REQUIRED:
 * 
 * This webhook endpoint MUST be configured in Twilio Console:
 * 
 * Steps:
 * 1. Go to https://console.twilio.com/phone-numbers/active
 * 2. Click on your phone number
 * 3. Under "Voice & Fax":
 *    - Set "Configure With": Webhooks
 *    - Set "A Call Comes In" to: POST
 *    - Set URL to: https://<PUBLIC_BASE_URL>/twilio/voice/reminder
 * 4. Save
 * 
 * WHY THIS IS REQUIRED:
 * Even when using client.calls.create({ url: twimlUrl }), Twilio's phone number
 * Voice Webhook configuration takes PRIORITY. If the phone number is configured
 * to use demo.twilio.com or Studio Flow, the provided URL will be IGNORED.
 * 
 * WITHOUT THIS CONFIG:
 * - Call is placed
 * - Trial disclaimer plays
 * - Custom TwiML is NEVER fetched
 * - Reminder message NEVER plays
 * - Webhook logs NEVER show incoming request
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory tracking for diagnostic: Call SID → webhook hit timestamp
const callWebhookTracker = new Map();

// The TwiML generator will be injected by app.js
let twimlGenerator = null;
let authTokenForValidation = null;

/**
 * POST/GET /twilio/voice/reminder
 * 
 * Webhook endpoint for Twilio voice calls.
 * Accepts signed context token and returns TwiML for Twilio to execute.
 * Validates HMAC signature to prevent tampering.
 * 
 * Supports both POST (Twilio) and GET (debugging/testing)
 * 
 * Query params:
 *   - context: Base64-encoded JSON with meeting details
 *   - sig: HMAC-SHA256 signature of context token
 * 
 * CRITICAL: This logs EVERY incoming request. If logs show NO incoming requests,
 * then Twilio is not calling this endpoint. Check Twilio Console phone number
 * Voice Webhook configuration.
 */
/**
 * Export function to mark webhook as hit (called by external modules)
 * Used for diagnostic correlation between call creation and webhook execution
 */
const markWebhookHit = (callSid) => {
  callWebhookTracker.set(callSid, { ...callWebhookTracker.get(callSid), webhookHit: true });
};

const handleVoiceReminder = (req, res) => {
  const incomingTimestamp = new Date().toISOString();
  
  try {
    // CRITICAL LOGGING: This proves Twilio called the webhook
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[TWIML] ✓ WEBHOOK CALLED BY TWILIO - EXECUTION PATH CONFIRMED`);
    console.log(`[TWIML] Timestamp: ${incomingTimestamp}`);
    console.log(`[TWIML] Method: ${req.method}`);
    console.log(`[TWIML] IP: ${req.ip}`);
    console.log(`[TWIML] Headers: ${JSON.stringify(req.headers)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    const { context, sig } = req.query;

    // Validate inputs
    if (!context || !sig) {
      console.error('[TWIML] Missing context or signature');
      return res.status(400).type('application/xml').send(generateFallbackTwiML());
    }

    // Validate HMAC signature
    if (!authTokenForValidation) {
      console.error('[TWIML] Auth token not initialized');
      return res.status(500).type('application/xml').send(generateFallbackTwiML());
    }

    const expectedSig = crypto
      .createHmac('sha256', authTokenForValidation)
      .update(context)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeCompare(sig, expectedSig)) {
      console.error('[TWIML] Invalid signature - tampering detected');
      return res.status(403).type('application/xml').send(generateFallbackTwiML());
    }

    // Decode context token
    let contextData;
    try {
      const decoded = Buffer.from(context, 'base64').toString('utf-8');
      contextData = JSON.parse(decoded);
    } catch (e) {
      console.error('[TWIML] Failed to decode context: ' + e.message);
      return res.status(400).type('application/xml').send(generateFallbackTwiML());
    }

    // Validate timestamp (prevent replay attacks - max 5 minutes old)
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - contextData.timestamp;
    if (tokenAge > 300) {  // 5 minutes
      console.error(`[TWIML] Token expired (age=${tokenAge}s)`);
      return res.status(401).type('application/xml').send(generateFallbackTwiML());
    }

    // Validate required fields
    if (!contextData.meetingTitle || contextData.minutesRemaining === undefined) {
      console.error('[TWIML] Missing required context fields');
      return res.status(400).type('application/xml').send(generateFallbackTwiML());
    }

    // Mark webhook as hit for diagnostic (if eventId provided)
    if (contextData.eventId) {
      callWebhookTracker.set(contextData.eventId, incomingTimestamp);
    }

    // Generate TwiML using injected generator
    if (!twimlGenerator) {
      console.error('[TWIML] TwiML generator not initialized');
      return res.status(500).type('application/xml').send(generateFallbackTwiML());
    }

    const twiml = twimlGenerator(contextData);
    
    // CRITICAL: Execution confirmed
    console.log(`[TWIML] ✓ EXECUTING REMINDER`);
    console.log(`[TWIML] Event ID: ${contextData.eventId}`);
    console.log(`[TWIML] Meeting: "${contextData.meetingTitle}"`);
    console.log(`[TWIML] Minutes Remaining: ${contextData.minutesRemaining}`);
    console.log(`[TWIML] Start Time: ${contextData.startTimeLocal}`);
    console.log(`[TWIML] TwiML Generated: ${twiml.substring(0, 100)}...`);
    console.log(`[TWIML] Response: 200 OK (application/xml)\n`);

    // Return TwiML with correct headers (NEVER JSON)
    res.type('application/xml').send(twiml);
  } catch (err) {
    console.error('[TWIML] Unexpected error: ' + err.message);
    res.status(500).type('application/xml').send(generateFallbackTwiML());
  }
};

// Register both POST (Twilio) and GET (testing)
router.post('/voice/reminder', handleVoiceReminder);
router.get('/voice/reminder', handleVoiceReminder);

/**
 * Constant-time string comparison to prevent timing attacks
 * @private
 */
function constantTimeCompare(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Fallback TwiML if validation fails
 * Gracefully handles errors without crashing
 * @private
 */
function generateFallbackTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We were unable to retrieve your meeting reminder. Please check your calendar for upcoming meetings.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Initialize the router with the TwiML generator and auth token
 * Called by app.js during server setup
 */
function setTwiMLGenerator(generator, authToken) {
  twimlGenerator = generator;
  authTokenForValidation = authToken;
  console.log('[TWILIO] Routes initialized with TwiML generator and auth validation');
}

module.exports = {
  router,
  setTwiMLGenerator,
  markWebhookHit
};
