/**
 * TWILIO WEBHOOK ROUTES
 * 
 * Handles incoming requests from Twilio:
 * - Voice webhook for dynamic TwiML generation
 * - Call status callbacks
 * 
 * CRITICAL FIX EXPLANATION:
 * Twilio phone numbers configured with Voice Webhooks will ALWAYS fetch TwiML
 * from the webhook URL, ignoring inline `twiml` in calls.create().
 * This route intercepts Twilio's request and dynamically generates TwiML
 * with the meeting context (title, time, urgency).
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Import the TwiML generator from autoCallService
// (We'll export it separately)
let generateMeetingReminderTwiML;

/**
 * Set the TwiML generator function
 * This is called during initialization to inject the generator
 */
function setTwiMLGenerator(generatorFn) {
  generateMeetingReminderTwiML = generatorFn;
}

/**
 * POST /twilio/voice/reminder
 * 
 * Twilio Voice Webhook - Dynamically generates TwiML for outbound calls
 * 
 * Flow:
 * 1. Twilio initiates outbound call with url pointing to this route
 * 2. Twilio makes HTTP request to fetch TwiML
 * 3. We validate the request, extract context, and return TwiML
 * 4. Twilio executes the TwiML (plays reminder to recipient)
 * 
 * Query params:
 * - context: Base64-encoded meeting context (title, time, minutes remaining)
 * - sig: HMAC signature to verify context wasn't tampered with
 */
router.post('/voice/reminder', (req, res) => {
  try {
    const { context: contextB64, sig: signature } = req.query;

    // SAFETY: Validate required parameters
    if (!contextB64 || !signature) {
      console.warn('[TWIML] Missing context or signature in voice webhook request');
      return res.status(400).send('Missing context or signature');
    }

    // SAFETY: Verify signature to prevent context tampering
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error('[TWIML] TWILIO_AUTH_TOKEN not configured');
      return res.status(500).send('Server configuration error');
    }

    const expectedSig = crypto
      .createHmac('sha256', authToken)
      .update(contextB64)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeEqual(signature, expectedSig)) {
      console.warn('[TWIML] Invalid signature - context tampering detected');
      return res.status(403).send('Invalid signature');
    }

    // SAFETY: Decode and parse context
    let context;
    try {
      context = JSON.parse(Buffer.from(contextB64, 'base64').toString('utf-8'));
    } catch (err) {
      console.warn('[TWIML] Failed to parse context:', err.message);
      return res.status(400).send('Invalid context format');
    }

    // SAFETY: Validate context timestamp (prevent replays)
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour - calls must be initiated within this window
    if (Math.abs(now - context.timestamp) > maxAge) {
      console.warn('[TWIML] Context timestamp too old - possible replay attack');
      return res.status(403).send('Context expired');
    }

    // SAFETY: Validate context has required fields
    if (!context.meetingTitle || context.minutesRemaining === undefined || !context.startTimeLocal) {
      console.warn('[TWIML] Context missing required fields');
      return res.status(400).send('Invalid context');
    }

    // Generate the TwiML with meeting context
    const twiml = generateMeetingReminderTwiML(context);

    // Log for debugging and monitoring
    console.log(`[TWIML] Serving reminder for event=${context.eventId}`);
    console.log(`[TWIML] Meeting: "${context.meetingTitle}" at ${context.startTimeLocal} (${context.minutesRemaining}min)`);
    console.log(`[TWIML] Twilio will play this TwiML to the call recipient`);

    // Return TwiML with correct headers
    res.type('application/xml');
    res.status(200).send(twiml);

  } catch (err) {
    console.error('[TWIML] Unexpected error in voice webhook:', err.message);
    // Return a safe fallback TwiML rather than erroring
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">
    This is a reminder from SaveHub. Please join your meeting.
  </Say>
</Response>`;
    res.type('application/xml');
    res.status(200).send(fallbackTwiml);
  }
});

/**
 * POST /twilio/call/status
 * 
 * Twilio Status Callback - Receives call state updates
 * 
 * This is already handled elsewhere, but included here for reference
 */
router.post('/call/status', (req, res) => {
  try {
    const { CallSid, CallStatus, To, From } = req.body;
    
    console.log(`[CALL_STATUS] SID=${CallSid}, Status=${CallStatus}, To=${To}, From=${From}`);
    
    // Acknowledge Twilio's callback
    res.type('application/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
  } catch (err) {
    console.error('[CALL_STATUS] Error processing callback:', err.message);
    res.status(200).send('');
  }
});

/**
 * Constant-time string comparison to prevent timing attacks
 * @private
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

module.exports = {
  router,
  setTwiMLGenerator
};
