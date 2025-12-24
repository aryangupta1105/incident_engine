/**
 * Twilio Voice Webhook Routes
 * 
 * Handles webhook requests from Twilio for dynamic TwiML generation.
 * This endpoint serves TwiML in response to Twilio's request, ensuring
 * custom reminder messages play instead of fallback Voice Webhook content.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

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
 */
const handleVoiceReminder = (req, res) => {
  try {
    console.log(`[TWIML] Incoming ${req.method} request from ${req.ip}`);
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

    // Generate TwiML using injected generator
    if (!twimlGenerator) {
      console.error('[TWIML] TwiML generator not initialized');
      return res.status(500).type('application/xml').send(generateFallbackTwiML());
    }

    const twiml = twimlGenerator(contextData);
    
    console.log(`[TWIML] ${req.method === 'GET' ? 'DEBUG' : 'FROM_TWILIO'} Serving reminder for event=${contextData.eventId}: "${contextData.meetingTitle}" (${contextData.minutesRemaining}min)`);

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
  setTwiMLGenerator
};
