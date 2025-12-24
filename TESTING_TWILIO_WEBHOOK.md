#!/usr/bin/env node

/**
 * TESTING GUIDE: Twilio TwiML Webhook Implementation
 * 
 * This guide walks you through testing the new webhook-based TwiML delivery
 */

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                  TWILIO TWIML WEBHOOK - TESTING GUIDE                      ║
╚════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: VERIFY ENVIRONMENT SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Check your .env file has these required variables:

  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_FROM_NUMBER=+1234567890
  CALL_WEBHOOK_URL=https://<your-public-url>  (MUST be HTTPS)

What you need:
  ✓ Twilio Account SID (from Twilio Console)
  ✓ Twilio Auth Token (from Twilio Console)
  ✓ Verified Twilio phone number in E.164 format
  ✓ Public HTTPS URL (ngrok for local testing)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: SET UP NGROK FOR LOCAL TESTING (If developing locally)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ngrok is a tunneling service that exposes your local server to the internet.
Twilio needs to make HTTP requests to your server, so you need a public URL.

A. Download & Install ngrok:
   → https://ngrok.com/download
   → Extract and add to PATH

B. Run ngrok in a NEW terminal window:
   
   $ ngrok http 3000
   
   Output will show:
   ┌─────────────────────────────────────────┐
   │ Forwarding                              │
   │ https://abc123xyz789.ngrok.io -> localhost:3000 │
   │ Status                      online      │
   └─────────────────────────────────────────┘
   
   Copy the HTTPS URL (e.g., https://abc123xyz789.ngrok.io)

C. Update your .env file:
   
   CALL_WEBHOOK_URL=https://abc123xyz789.ngrok.io
   
   This tells your server what public URL to use when calling Twilio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: UPDATE TWILIO CONSOLE (CRITICAL!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  WITHOUT THIS STEP, THE FIX WILL NOT WORK ⚠️

A. Go to Twilio Console:
   https://console.twilio.com

B. Navigate to Phone Numbers:
   → Active Numbers (or your project's phone numbers)

C. Select your Twilio phone number

D. Find "Voice & Fax" section, look for "Voice":
   
   Current setting (BEFORE):
   Voice Webhook (Primary handler for calls)
   POST https://demo.twilio.com/welcome/voice/
   
   NEW setting (AFTER):
   Voice Webhook (Primary handler for calls)
   POST https://abc123xyz789.ngrok.io/twilio/voice/reminder
   (Replace abc123xyz789.ngrok.io with your ngrok URL)
   
   Method: POST

E. Save the changes

✅ Now when Twilio makes calls, it will fetch TwiML from YOUR server!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: START YOUR SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In your main terminal (NOT the ngrok terminal):

$ cd C:\\Users\\aarya\\IncidentManagementSystem\\incident-engine
$ node server.js

Expected output:
[dotenv@...] injecting env (29)...
[SERVER] Feature flags:
  calendar=true
  escalation=false
  alerts=true
  checkin=true
  scheduler=true
[ALERT_WORKER] Starting with 5000ms poll interval
[SERVER] Alert delivery worker started (5s poll interval)
[SERVER] Calendar scheduler disabled by feature flag
[SERVER] Incident Engine running on port 3000

✅ Server is running on port 3000
✅ ngrok is forwarding to https://abc123xyz789.ngrok.io
✅ Twilio has your Voice Webhook configured

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5: CREATE A TEST MEETING (in another terminal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In a NEW terminal (keep server running):

$ cd C:\\Users\\aarya\\IncidentManagementSystem\\incident-engine
$ node test-duplicate-setup.js

Output will show:
✓ Created meeting: 8568cfe9-...
✓ Meeting time: 2025-12-24T05:23:23.221Z
✓ Created MEETING_UPCOMING_EMAIL (scheduled for -12 min from meeting)
✓ Created MEETING_URGENT_MESSAGE (scheduled for -5 min from meeting)
✓ Created MEETING_CRITICAL_CALL (scheduled for -2 min from meeting)

Current state:
✓ MEETING_CRITICAL_CALL: PENDING (count: 1)
✓ MEETING_UPCOMING_EMAIL: PENDING (count: 1)
✓ MEETING_URGENT_MESSAGE: PENDING (count: 1)

📝 Next steps:
1. Wait ~5 seconds for alerts to be processed
2. Check your phone for the call
3. Verify TwiML reminder plays

Copy the meeting ID (e.g., 8568cfe9-...)
You'll use it to verify results

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6: MONITOR SERVER LOGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Watch your server terminal while the test runs.

LOOK FOR THIS SEQUENCE:

[EMAIL] Found 3 pending alerts to deliver
  ↓
[CALL] Using webhook-based TwiML delivery for event=8568cfe9-...
[CALL] Reminder context: "TEST MEETING - Duplicate Fix..." at 05:23 (3min)
[CALL] Twilio will fetch TwiML from: /twilio/voice/reminder
  ↓
[CALL] Twilio call initiated successfully
[CALL] Provider response: sid=CA1234567890abcdef
  ↓
[TWIML] Serving reminder for event=8568cfe9-...
[TWIML] Meeting: "TEST MEETING - Duplicate Fix..." at 05:23 (3min)
[TWIML] Twilio will play this TwiML to the call recipient
  ↓
[DELIVERY] Locked and marked DELIVERED: <alert-id>

✅ If you see these logs, the webhook is working!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7: CHECK YOUR PHONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Within 10 seconds, you should receive a call.

WHAT YOU'LL HEAR:

1. Ring tone
2. Twilio connects the call
3. Trial disclaimer:
   "This call is being made through Twilio. This is a trial account..."
4. ✅ YOUR CUSTOM REMINDER MESSAGE:
   "Hi, this is an important reminder from SaveHub."
   "Your meeting titled TEST MEETING - Duplicate Fix Verification starts in 3 minutes."
   "The meeting starts at 05:23. Missing this could cost you valuable time or money."
   "Please join now. Thank you."

✅ If you hear the custom message, the fix is working!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8: VERIFY DATABASE (confirm no duplicates)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After the call completes, run:

$ node verify-duplicate-test.js 8568cfe9-...
  (Replace with your meeting ID from Step 5)

Expected output:

✅ MEETING_CRITICAL_CALL
   Total: 1 | Delivered: 1 | Pending: 0

✅ MEETING_UPCOMING_EMAIL
   Total: 1 | Delivered: 1 | Pending: 0

✅ MEETING_URGENT_MESSAGE
   Total: 1 | Delivered: 1 | Pending: 0

✅ TEST PASSED!
   No duplicates detected. Each alert type delivered exactly once.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Call not received"
   → Check Twilio Console Voice Webhook URL is set correctly
   → Verify ngrok is still running
   → Check CALL_WEBHOOK_URL in .env matches ngrok URL
   → Make sure server is running (check Step 4 output)

❌ "Hear trial disclaimer but NOT custom message"
   → Voice Webhook not configured (see Step 3)
   → Or ngrok session expired (restart ngrok, update .env and Twilio Console)
   → Check server logs for [TWIML] lines

❌ "Server logs show errors at /twilio/voice/reminder"
   → Check TWILIO_AUTH_TOKEN in .env is correct
   → Verify context signature isn't corrupted
   → Look for "Invalid signature" in logs

❌ "ngrok keeps disconnecting"
   → Free ngrok sessions timeout after 2 hours
   → Just restart: ngrok http 3000
   → Update CALL_WEBHOOK_URL in .env and Twilio Console

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION DEPLOYMENT (when ready)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For production:
1. Deploy code to production server
2. Update .env: CALL_WEBHOOK_URL=https://yourdomain.com
3. In Twilio Console, update Voice Webhook:
   POST https://yourdomain.com/twilio/voice/reminder
4. No other changes needed - code works the same way

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✓ ngrok http 3000
2. ✓ Update .env: CALL_WEBHOOK_URL=https://ngrok-url
3. ✓ Update Twilio Console: Voice Webhook → https://ngrok-url/twilio/voice/reminder
4. ✓ node server.js
5. ✓ node test-duplicate-setup.js
6. ✓ Wait for call, listen for custom reminder
7. ✓ node verify-duplicate-test.js <meeting-id>

Done! 🎉

`);
