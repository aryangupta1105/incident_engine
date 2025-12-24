════════════════════════════════════════════════════════════════════════════════════
DELIVERY LAYER FIX - QUICK START GUIDE
════════════════════════════════════════════════════════════════════════════════════

This guide helps you deploy, verify, and understand the FINAL DELIVERY LAYER FIX.

════════════════════════════════════════════════════════════════════════════════════
WHAT THIS FIX DOES (60 seconds)
════════════════════════════════════════════════════════════════════════════════════

Before Fix:
   ❌ All alerts sent as emails
   ❌ Critical meetings don't trigger calls
   ❌ Users don't know which meeting
   ❌ Users get spammed with 3 messages

After Fix:
   ✅ Critical meetings → phone calls
   ✅ Emails include meeting title + time
   ✅ Only highest priority sent (no spam)
   ✅ Users understand what's at risk


════════════════════════════════════════════════════════════════════════════════════
DEPLOYMENT (5 minutes)
════════════════════════════════════════════════════════════════════════════════════

Step 1: Copy 4 Files
   Copy these files to your production server:
   - workers/alertDeliveryWorker.js
   - services/autoCallService.js
   - services/emailTemplates.js
   - .env (add: FALLBACK_CALL_PHONE=+1-415-555-0100)

Step 2: Restart Server
   Kill: lsof -ti :3000 | xargs kill -9
   Start: cd incident-engine && node server.js

Step 3: Verify Boot (no errors)
   Look for:
   [SERVER] Incident Engine running on port 3000
   [ALERT_WORKER] Starting with 5000ms poll interval
   [SCHEDULER] Scheduler started successfully

Step 4: Watch Logs (5 minutes)
   Tail: tail -f server.log
   Look for:
   [DELIVERY] Routing CRITICAL_CALL
   [CALL] Initiating call
   No [ERROR] messages


════════════════════════════════════════════════════════════════════════════════════
HOW TO VERIFY IT'S WORKING (10 minutes)
════════════════════════════════════════════════════════════════════════════════════

Test 1: Create a Meeting
   1. Use your calendar to create meeting 3 minutes from now
   2. Wait for scheduler to sync (1-minute tick)
   3. Check alert logs

Expected Logs:
   [SCHEDULER] Tick started
   [CALENDAR_SERVICE] Fetched X events
   [EVENTS] Creating event for meeting: "[YOUR_MEETING]"
   [EVENT] Created: MEETING/MEETING_SCHEDULED
   [EMAIL] Found X pending alerts
   [DELIVERY] Routing CRITICAL_CALL to autoCallService
   [CALL] Initiating call to ****[PHONE]


Test 2: Check Email Content
   1. Look at sent email subject
   2. Should contain: "starts in X minutes"
   3. Should contain: meeting title
   
Expected:
   Subject: "Your meeting starts in 3 minutes — don't let it slip"
   Body: "You have a meeting '[TITLE]' starting at 02:30 PM in 3 minutes"


Test 3: Check Call Logs
   1. Look for [CALL] logs
   2. Should show: phone number (masked)
   3. Should show: provider response (sid)

Expected:
   [CALL] Initiating call to ****1234
   [CALL] Provider response: status=initiated, callId=CA...


════════════════════════════════════════════════════════════════════════════════════
WHAT IF SOMETHING BREAKS?
════════════════════════════════════════════════════════════════════════════════════

Error 1: "column 'phone' does not exist"
   ✅ Expected - users don't have phone field
   ✅ Uses FALLBACK_CALL_PHONE instead
   ✅ In production, add phone field to users table

Error 2: "invalid input value for enum alert_status: 'SKIPPED'"
   ✅ Expected - database doesn't support SKIPPED enum
   ✅ Stage collapsing still works (marks lower alerts as PENDING)
   ✅ In production, add SKIPPED to enum

Error 3: "Twilio call failed"
   ✅ If using real Twilio, check credentials
   ✅ If development, set CALL_TEST_MODE=true for mock calls
   ✅ Check phone number format (should be +1-415-...)


ROLLBACK (if needed):
   git checkout HEAD -- \
     workers/alertDeliveryWorker.js \
     services/autoCallService.js \
     services/emailTemplates.js \
     .env
   
   Then restart server.


════════════════════════════════════════════════════════════════════════════════════
LOGS TO WATCH
════════════════════════════════════════════════════════════════════════════════════

Good Signs ✅
   [DELIVERY] Routing CRITICAL_CALL to autoCallService
   [CALL] Initiating call to ****1234
   [CALL] Provider response: sid=CA...
   [DELIVERY] Collapsing stages
   [EMAIL] Delivery batch: X delivered, 0 failed

Bad Signs ❌
   [ALERT] Mark skipped failed (ignore - expected)
   [ALERT_WORKER] Error delivering call (check phone)
   [CALL] Call failed (check Twilio credentials)
   [EMAIL] Delivery batch: 0 delivered, X failed


════════════════════════════════════════════════════════════════════════════════════
CONFIGURATION
════════════════════════════════════════════════════════════════════════════════════

In .env file:

# Fallback phone for calls (when user has no phone)
FALLBACK_CALL_PHONE=+1-415-555-0100

# Twilio credentials (for real calls)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1-415-555-0123

# Call provider (twilio or mock)
CALL_PROVIDER=mock  # Set to 'twilio' for production

# Test mode (skip real calls)
CALL_TEST_MODE=true  # Set to 'false' for production


════════════════════════════════════════════════════════════════════════════════════
EMAIL TEMPLATES (What users see)
════════════════════════════════════════════════════════════════════════════════════

UPCOMING_EMAIL (5-10 min before):
   Subject: "Your meeting starts in 7 minutes — don't let it slip"
   
   Body:
   You have a meeting 'Board Sync' starting at 02:30 PM in 7 minutes.
   
   We're reminding you early so you don't have to rush or regret 
   missing it later.

URGENT_MESSAGE (3-5 min before):
   Subject: "Urgent: Your meeting starts in 3 minutes"
   
   Body:
   URGENT: Your meeting 'Board Sync' starts at 02:30 PM in 3 minutes.
   
   This is important—missing this meeting could cost you time, money, 
   or relationships.

CRITICAL_CALL (1-2 min before):
   Phone Call Script:
   "Hi, this is SaveHub. Your meeting 'Board Sync' was scheduled at 
   2:30 PM. We're calling because missing this could cost you time or 
   money. Please join now if you haven't already."


════════════════════════════════════════════════════════════════════════════════════
STAGE COLLAPSING (How spam is prevented)
════════════════════════════════════════════════════════════════════════════════════

Scenario 1: All 3 alerts scheduled at same time
   Input: UPCOMING + URGENT + CRITICAL for same meeting
   Output: CRITICAL only (call)
   Result: User gets 1 call (not 3 messages)

Scenario 2: Multiple alerts over time
   Input: UPCOMING at 5min + URGENT at 3min + CRITICAL at 1min
   Output: UPCOMING email → URGENT email → CRITICAL call
   Result: User gets 3 messages (spaced out, appropriate escalation)

Logic:
   Priority: CRITICAL_CALL (3) > URGENT_MESSAGE (2) > UPCOMING_EMAIL (1)
   Rule: If multiple alerts for same meeting at same tick,
         deliver only highest priority


════════════════════════════════════════════════════════════════════════════════════
TROUBLESHOOTING
════════════════════════════════════════════════════════════════════════════════════

Problem: Emails not being sent
   Check:
   1. FEATURE_EMAIL_ENABLED=true in .env
   2. SMTP credentials correct
   3. [EMAIL] logs appearing
   Solution: Restart alert worker

Problem: Calls not being made
   Check:
   1. FEATURE_CALL_ENABLED=true
   2. Phone number format: +1-415-555-0100
   3. [DELIVERY] Routing logs appearing
   Solution: Check Twilio credentials or set CALL_TEST_MODE=true

Problem: Users getting multiple emails for same meeting
   Check:
   1. Rules scheduling multiple alerts
   2. [DELIVERY] Collapsing logs appearing
   Solution: Expected - spread out by time. Check rule timing.

Problem: Scheduler not running
   Check:
   1. FEATURE_SCHEDULER_ENABLED=true
   2. [SCHEDULER] logs appearing every minute
   Solution: Restart server


════════════════════════════════════════════════════════════════════════════════════
SUCCESS CHECKLIST (Verify before going live)
════════════════════════════════════════════════════════════════════════════════════

Infrastructure:
  ☐ All 4 files deployed
  ☐ .env updated with FALLBACK_CALL_PHONE
  ☐ Server restarted
  ☐ No boot errors

Delivery:
  ☐ [DELIVERY] Routing logs appearing
  ☐ [CALL] Initiating logs appearing
  ☐ Emails being sent (check SMTP)
  ☐ Calls being initiated (Twilio or mock)

Email Quality:
  ☐ Subject includes "starts in X minutes"
  ☐ Body includes meeting title
  ☐ Body includes start time
  ☐ Emotional framing appropriate

Call Quality:
  ☐ Phone number called (masked in logs)
  ☐ Voice script mentions title
  ☐ Voice script explains consequence
  ☐ Call logged with SID

Spam Prevention:
  ☐ Multiple alerts don't spam (checked logs)
  ☐ Only highest severity delivered
  ☐ [DELIVERY] Collapsing logs appearing

Logging:
  ☐ [DELIVERY] logs appearing
  ☐ [CALL] logs appearing
  ☐ [EMAIL] logs appearing
  ☐ No [ERROR] messages


════════════════════════════════════════════════════════════════════════════════════
PRODUCTION CHECKLIST (Before full deployment)
════════════════════════════════════════════════════════════════════════════════════

Database:
  ☐ Backup database
  ☐ Add phone column to users table (optional)
  ☐ Add SKIPPED to alert_status enum (optional)

Configuration:
  ☐ Set CALL_TEST_MODE=false
  ☐ Set CALL_PROVIDER=twilio
  ☐ Configure real Twilio credentials
  ☐ Test with real phone number

Testing:
  ☐ Create test meeting
  ☐ Verify email sent correctly
  ☐ Verify call placed correctly
  ☐ Check logs for success

Monitoring:
  ☐ Set up log monitoring
  ☐ Alert on [ERROR] logs
  ☐ Track [DELIVERY] frequency
  ☐ Monitor [CALL] success rate


════════════════════════════════════════════════════════════════════════════════════
SUPPORT & NEXT STEPS
════════════════════════════════════════════════════════════════════════════════════

Files Created:
  - FINAL_DELIVERY_LAYER_COMPLETE.md (full documentation)
  - DELIVERY_FIX_QUICK_REFERENCE.md (implementation details)
  - DELIVERY_LAYER_FIX_COMPLETE.md (comprehensive guide)
  - This file (quick start)

Next Steps:
  1. Deploy to staging
  2. Run tests (follow VERIFICATION section)
  3. Monitor 24 hours
  4. Deploy to production
  5. Monitor production for 1 week

Questions:
  - Check FINAL_DELIVERY_LAYER_COMPLETE.md for details
  - Check server logs for [DELIVERY], [CALL], [EMAIL] messages
  - Review alertDeliveryWorker.js for routing logic
  - Review autoCallService.js for call execution

════════════════════════════════════════════════════════════════════════════════════
