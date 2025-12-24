/**
 * PHASE B.1: AUTO-CALL SERVICE (PRODUCTION)
 * 
 * CRITICAL DELIVERY LAYER - Real Twilio Integration
 * 
 * Features:
 * - Provider abstraction (mock / twilio)
 * - E.164 phone validation (no dummy numbers)
 * - Per-user call rate limiting (max 2 calls per meeting)
 * - Hard stop outside CRITICAL window (2-3 min before meeting)
 * - Timeout safety (45 seconds max)
 * - Retry once on failure (no duplicate attempts)
 * - Graceful failure (no crashes)
 * - Production-grade logging
 * - Escalation pipeline integration
 * 
 * NON-NEGOTIABLE:
 * - Calls ONLY via escalation pipeline
 * - STOP on incident resolution
 * - STOP on JOINED confirmation
 * - Phone MUST be valid E.164 format
 */

/**
 * PRODUCTION PHONE VALIDATION
 * 
 * Validates phone numbers in E.164 format: +[country][number]
 * - Must start with +
 * - Must have 10-15 digits total
 * - No spaces, dashes, or special characters
 * 
 * Returns: {valid: boolean, error?: string}
 */
function validateE164Phone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone must be a non-empty string' };
  }

  const trimmed = phone.trim();
  const e164Pattern = /^\+[1-9]\d{9,14}$/;
  
  if (!e164Pattern.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid E.164 format. Expected: +[country code][digits]. Got: ${trimmed}`
    };
  }

  return { valid: true };
}

// In-memory call tracking (per-user, per-event)
// Format: { "userId:eventId": { count: 0, timestamp: 0 } }
const callTracker = new Map();

// Call tracking cleanup interval (30 seconds)
// Remove entries older than 10 minutes
setInterval(() => {
  const now = Date.now();
  const TTL = 10 * 60 * 1000; // 10 minutes
  
  for (const [key, data] of callTracker.entries()) {
    if (now - data.timestamp > TTL) {
      callTracker.delete(key);
    }
  }
}, 30000);

/**
 * Make an outbound call
 * 
 * CRITICAL GUARDS:
 * - E.164 validation: phone MUST be +[country][digits]
 * - Rate limit: max 2 calls per user/event
 * - Window: only 2-3 min before meeting
 * - Timeout: 45 seconds max
 * - Retry: once only
 * 
 * @param {object} options - Call options
 * @param {string} options.to - Phone number to call (must be E.164 format)
 * @param {string} options.message - Message to deliver
 * @param {string} options.context - Call context {userId, eventId, incidentId}
 * @returns {Promise<object>} Call result {status, provider, callId}
 */
async function makeCall(options) {
  const { to, message, context = {} } = options;
  const { userId, eventId, incidentId, window } = context;

  // SAFETY GUARD 0: E.164 phone validation (CRITICAL - no dummy numbers)
  const phoneValidation = validateE164Phone(to);
  if (!phoneValidation.valid) {
    throw new Error(`[CALL] Invalid phone format: ${phoneValidation.error}`);
  }

  // SAFETY GUARD 1: Input validation
  if (!message) {
    throw new Error('[CALL] Invalid: Message required');
  }

  if (!userId || !eventId) {
    throw new Error('[CALL] Invalid: userId and eventId required in context');
  }

  // SAFETY GUARD 2: Window check (CRITICAL - only 2-3 min before)
  if (window && (window.type !== 'CRITICAL' || window.secondsBeforeMeeting > 180)) {
    console.log(`[CALL] HARD STOP - Outside critical window (${window.secondsBeforeMeeting}s before)`);
    return {
      status: 'skipped',
      reason: 'outside_critical_window',
      provider: 'none'
    };
  }

  // SAFETY GUARD 3: Per-user rate limit (max 2 calls per event)
  const trackingKey = `${userId}:${eventId}`;
  const existing = callTracker.get(trackingKey);
  
  if (existing && existing.count >= 2) {
    console.log(`[CALL] RATE LIMITED - User ${userId} already has 2 calls for event ${eventId}`);
    return {
      status: 'rate_limited',
      reason: 'max_calls_exceeded',
      provider: 'none',
      maxCalls: 2
    };
  }

  try {
    const provider = process.env.CALL_PROVIDER || 'twilio';
    const testMode = process.env.CALL_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';

    // TASK 5: Log call initiation with clear context
    console.log(`[CALL] Initiating call to ${maskPhoneNumber(to)}`);
    console.log(`[CALL] User=${userId}, Event=${eventId}`);
    console.log(`[CALL] Provider=${provider}`);

    // Test mode: skip actual call
    if (testMode) {
      console.log(`[CALL] TEST MODE - Call not placed (simulated)`);
      incrementCallCount(trackingKey);
      return {
        status: 'test_mode',
        provider: 'test',
        callId: `TEST-${Date.now()}`,
        to: maskPhoneNumber(to),
        message: message.substring(0, 50) + '...'
      };
    }

    // Call provider implementation
    let result;
    if (provider === 'twilio') {
      result = await makeCallViaTwilio(to, message, context);
    } else if (provider === 'mock') {
      result = await makeCallViaMock(to, message, context);
    } else {
      throw new Error(`[CALL] Unknown provider: ${provider}`);
    }

    // TASK 5: Log provider response
    console.log(`[CALL] Provider response: status=${result.status}, callId=${result.callId || 'N/A'}`);

    // Increment call counter only on success
    if (result.status === 'initiated' || result.status === 'success') {
      incrementCallCount(trackingKey);
    }

    // TASK 5: Log call completion or failure
    if (result.status === 'failed' || result.status === 'error') {
      console.log(`[CALL] Call failed - Error=${result.error || 'Unknown'}`);
    } else {
      console.log(`[CALL] Call completed - Status=${result.status}, Provider=${result.provider}`);
    }
    
    return result;

  } catch (err) {
    // TASK 5: Log failure clearly with context
    console.error(`[CALL] Call failed - User=${userId}, Event=${eventId}, Error=${err.message}`);
    // Don't increment counter on failure (allows retry)
    throw err;
  }
}

/**
 * Track call count per user/event
 * @private
 */
function incrementCallCount(key) {
  if (!callTracker.has(key)) {
    callTracker.set(key, { count: 0, timestamp: Date.now() });
  }
  const data = callTracker.get(key);
  data.count += 1;
  data.timestamp = Date.now();
}

/**
 * TASK 1: Generate TwiML with human reminder message
 * 
 * Creates TwiML that plays:
 * 1. Twilio disclaimer (automatic, trial requirement)
 * 2. Human-friendly reminder about the meeting
 * 3. Consequence framing (time/money saving)
 * 4. Calm, emotionally-aware voice
 * 
 * @private
 */
function generateMeetingReminderTwiML(context) {
  const { meetingTitle = 'your meeting', minutesRemaining = 2, startTimeLocal = 'shortly' } = context;
  const minuteWord = minutesRemaining === 1 ? 'minute' : 'minutes';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US" loop="1">
    Hi. This is an important reminder from SaveHub.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US" loop="1">
    Your meeting titled ${meetingTitle} starts in ${minutesRemaining} ${minuteWord}.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US" loop="1">
    The meeting starts at ${startTimeLocal}. Missing this could cost you valuable time or money.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US" loop="1">
    Please join now. Thank you.
  </Say>
</Response>`;
}

/**
 * Twilio implementation - REAL CALLS with Webhook-based TwiML
 * 
 * Uses signed context tokens to deliver TwiML via webhook.
 * This ensures custom reminder message plays (not the Voice Webhook fallback).
 * 
 * Timeout: 45 seconds max
 * Retry: Once on failure
 * 
 * @private
 */
async function makeCallViaTwilio(to, message, context) {
  const startTime = Date.now();
  const TIMEOUT_MS = 45000; // 45 seconds
  const { userId, eventId, incidentId } = context;

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    // SAFETY: Credentials validation
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured (SID, Token, FromNumber)');
    }

    // Initialize Twilio client
    let twilio;
    try {
      twilio = require('twilio');
    } catch (e) {
      throw new Error('Twilio SDK not installed. Run: npm install twilio');
    }

    const client = twilio(accountSid, authToken);
    const crypto = require('crypto');

    // TASK 1: Create signed context token for webhook authentication
    const contextData = {
      meetingTitle: context.meetingTitle || 'your meeting',
      minutesRemaining: context.minutesRemaining || 2,
      startTimeLocal: context.startTimeLocal || 'shortly',
      timestamp: Math.floor(Date.now() / 1000),
      eventId: eventId
    };

    const contextToken = Buffer.from(JSON.stringify(contextData)).toString('base64');
    const signature = crypto
      .createHmac('sha256', authToken)
      .update(contextToken)
      .digest('hex');

    // ENFORCE: Twilio webhook URL MUST use public URL (never localhost)
    // Localhost is unreachable from Twilio's servers
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    if (!publicBaseUrl) {
      throw new Error(
        'PUBLIC_BASE_URL environment variable is REQUIRED for Twilio webhooks. ' +
        'Cannot use localhost - Twilio cannot reach your local machine. ' +
        'Set PUBLIC_BASE_URL to your ngrok URL or public domain (e.g., https://batlike-unneatly-maricela.ngrok-free.dev)'
      );
    }

    // GUARD: Reject any localhost URL (double-check)
    if (publicBaseUrl.includes('localhost') || publicBaseUrl.includes('127.0.0.1')) {
      throw new Error(
        `PUBLIC_BASE_URL contains localhost (${publicBaseUrl}). ` +
        'Twilio cannot reach localhost. Use PUBLIC_BASE_URL with ngrok or public domain.'
      );
    }

    // Build webhook URL for Twilio to fetch TwiML from
    const twimlUrl = `${publicBaseUrl}/twilio/voice/reminder?context=${encodeURIComponent(contextToken)}&sig=${signature}`;

    console.log(`[CALL] Using webhook-based TwiML delivery for event=${eventId}`);
    console.log(`[CALL] Webhook URL: ${twimlUrl.substring(0, 100)}...`);
    console.log(`[CALL] Reminder: "${context.meetingTitle}" at ${context.startTimeLocal} (${context.minutesRemaining}min)`);

    // Make the call with timeout wrapper
    const callPromise = client.calls.create({
      to: to,
      from: fromNumber,
      url: twimlUrl,
      statusCallback: `${publicBaseUrl}/call/status`,
      statusCallbackEvent: ['initiated', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 45
    });

    // Apply timeout safety
    const callWithTimeout = Promise.race([
      callPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Call creation timeout (45s)')), TIMEOUT_MS)
      )
    ]);

    const call = await callWithTimeout;

    // TASK 5: Log Twilio provider response with complete details
    console.log(`[CALL] Twilio call initiated successfully`);
    console.log(`[CALL] Provider response: sid=${call.sid}`);
    console.log(`[CALL] Call details: to=${maskPhoneNumber(to)}, status=${call.status}`);

    return {
      status: 'initiated',
      provider: 'twilio',
      callId: call.sid,
      to: maskPhoneNumber(to),
      message: message.substring(0, 50) + '...',
      context: { userId, eventId, incidentId },
      createdAt: new Date().toISOString()
    };

  } catch (err) {
    const elapsed = Date.now() - startTime;
    // TASK 5: Log failure clearly
    console.error(`[CALL] Twilio call failed - Error=${err.message}, Elapsed=${elapsed}ms`);

    // RETRY LOGIC: Once on specific failures
    if (shouldRetry(err) && context.retryCount !== 1) {
      console.log(`[CALL] Retrying call (attempt 2)...`);
      context.retryCount = 1;
      return makeCallViaTwilio(to, message, context);
    }

    // Graceful failure: don't crash system
    return {
      status: 'failed',
      provider: 'twilio',
      error: err.message,
      to: maskPhoneNumber(to),
      context: { userId: context.userId, eventId: context.eventId },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Determine if call error should trigger retry
 * @private
 */
function shouldRetry(err) {
  const msg = err.message.toLowerCase();
  // Retry on network/timeout errors, not on auth errors
  return msg.includes('timeout') || 
         msg.includes('econnrefused') || 
         msg.includes('enotfound') ||
         msg.includes('socket hang up');
}

/**
 * Mock implementation (for testing/development)
 * 
 * Logs call but doesn't place real call
 * Safe for development without Twilio credits
 * 
 * @private
 */
async function makeCallViaMock(to, message, context) {
  const { userId, eventId, incidentId } = context;

  // TASK 5: Log mock call initiation with full context
  console.log(`[CALL] Mock call initiating`);
  console.log(`[CALL] To=${maskPhoneNumber(to)}, User=${userId}, Event=${eventId}`);
  console.log(`[CALL] Message preview: "${message.substring(0, 60)}..."`);

  // Simulate async call processing
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockSid = `MOCK-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // TASK 5: Log mock call completion
      console.log(`[CALL] Mock call completed`);
      console.log(`[CALL] Provider response: sid=${mockSid}`);
      
      resolve({
        status: 'initiated',
        provider: 'mock',
        callId: mockSid,
        to: maskPhoneNumber(to),
        message: message.substring(0, 50) + '...',
        context: { userId, eventId, incidentId },
        note: 'MOCK - No real call placed',
        createdAt: new Date().toISOString()
      });
    }, 100);
  });
}

/**
 * Mask phone number for logging (show last 4 digits only)
 * @private
 */
function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || phoneNumber.length < 4) {
    return '****';
  }
  return `****${phoneNumber.substring(phoneNumber.length - 4)}`;
}

module.exports = {
  makeCall,
  generateMeetingReminderTwiML,  // Exported for Twilio webhook endpoint
  // Exported for testing only
  _internal: {
    incrementCallCount,
    shouldRetry,
    maskPhoneNumber,
    callTracker
  }
};
