/**
 * Test Call Verification Script
 * 
 * Directly triggers the makeCall function to verify Twilio webhook diagnostics
 * No database writes needed - just tests the call creation and webhook tracking
 */

require('dotenv').config();
const { makeCall } = require('./services/autoCallService');

async function runTest() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST: Triggering Twilio webhook diagnostics verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Calculate meeting time
    const now = new Date();
    const meetingTime = new Date(now.getTime() + 2 * 60000); // 2 minutes from now
    
    console.log(`[TEST] Current time: ${now.toISOString()}`);
    console.log(`[TEST] Meeting time: ${meetingTime.toISOString()}`);
    console.log(`[TEST] Minutes until meeting: 2\n`);

    // Prepare call context
    const meetingTitle = 'Test Reminder Verification Call';
    const phoneNumber = process.env.DEV_PHONE_NUMBER || '+916263038693';

    console.log('[TEST] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[TEST] TRIGGERING CALL - Watch server logs for:');
    console.log('[TEST] ');
    console.log('[TEST]   IMMEDIATE (call initiated):');
    console.log('[TEST]     ✓ [CALL] Twilio call initiated successfully');
    console.log('[TEST]     ✓ [CALL] Provider response: sid=CA...');
    console.log('[TEST] ');
    console.log('[TEST]   IF WEBHOOK CALLED (correct configuration):');
    console.log('[TEST]     ✓ [TWIML] ✓ WEBHOOK CALLED BY TWILIO');
    console.log('[TEST]     ✓ [TWIML] ✓ EXECUTING REMINDER');
    console.log('[TEST]     ✓ [TWIML] Meeting: "Test Reminder Verification Call"');
    console.log('[TEST]     ✓ [TWIML] Minutes Remaining: 2');
    console.log('[TEST] ');
    console.log('[TEST]   IF WEBHOOK NOT CALLED (after 5 seconds):');
    console.log('[TEST]     ✓ [TWILIO][CRITICAL] Call created but webhook NEVER hit');
    console.log('[TEST]     ✓ [TWILIO][CRITICAL] PROBABLE CAUSE: Phone number Voice Webhook');
    console.log('[TEST]     ✓ [TWILIO][CRITICAL] REQUIRED FIX: Check Twilio Console...');
    console.log('[TEST] ');
    console.log('[TEST] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`[TEST] Making call to: ${phoneNumber}`);
    console.log(`[TEST] Meeting title: "${meetingTitle}"`);
    console.log(`[TEST] Context: 2 minutes before meeting starts\n`);

    // Make the call
    const callResult = await makeCall({
      to: phoneNumber,
      message: `Reminder: ${meetingTitle} starts in 2 minutes`,
      context: {
        userId: 'test-user-' + Date.now(),
        eventId: `evt_test_${Date.now()}`,
        incidentId: `incident_test_${Date.now()}`,
        meetingTitle: meetingTitle,
        minutesRemaining: 2,
        startTimeLocal: meetingTime.toLocaleTimeString(),
        window: {
          type: 'CRITICAL',
          secondsBeforeMeeting: 120
        }
      }
    });

    console.log(`\n[TEST] ✓ Call result received:`);
    console.log(`  - Status: ${callResult.status}`);
    console.log(`  - Provider: ${callResult.provider}`);
    if (callResult.callId) {
      console.log(`  - Call SID: ${callResult.callId}`);
    }
    if (callResult.error) {
      console.log(`  - Error: ${callResult.error}`);
    }
    console.log(`  - Timestamp: ${callResult.createdAt || new Date().toISOString()}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[TEST] Test initiated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('[TEST] What to check in server logs:');
    console.log('[TEST] ');
    console.log('[TEST] ✓ SUCCESS (if webhook is called):');
    console.log('[TEST]   Look for: [TWIML] ✓ WEBHOOK CALLED BY TWILIO');
    console.log('[TEST]   This means Twilio Console is correctly configured');
    console.log('[TEST]   The phone number can receive reminder calls');
    console.log('[TEST] ');
    console.log('[TEST] ✗ FAILURE (if webhook not called after 5 seconds):');
    console.log('[TEST]   Look for: [TWILIO][CRITICAL] Call created but webhook NEVER hit');
    console.log('[TEST]   This means phone number Voice Webhook in Twilio Console');
    console.log('[TEST]   is misconfigured or points elsewhere');
    console.log('[TEST] ');
    console.log('[TEST] Next steps:');
    console.log('[TEST] 1. Check server logs for one of the above messages');
    console.log('[TEST] 2. If CRITICAL error: Follow the steps in Twilio Console');
    console.log('[TEST] 3. Re-run this test after configuring phone number\n');

    process.exit(0);
  } catch (err) {
    console.error('[TEST] ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
