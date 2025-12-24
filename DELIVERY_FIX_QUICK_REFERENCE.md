════════════════════════════════════════════════════════════════════════════════════
QUICK REFERENCE - DELIVERY LAYER CHANGES
════════════════════════════════════════════════════════════════════════════════════

All changes are isolated to the DELIVERY LAYER.
Core logic, rules, scheduler are UNCHANGED.


════════════════════════════════════════════════════════════════════════════════════
ALERT FLOW WITH NEW ROUTING
════════════════════════════════════════════════════════════════════════════════════

OLD FLOW (BROKEN):
   Rule Engine
   → Alert scheduled (any type)
   → deliverAlertEmail() [for all types]
   → emailProvider.sendAlertEmail()
   ❌ CRITICAL_CALL was sent as EMAIL

NEW FLOW (FIXED):
   Rule Engine
   → Alert scheduled
   → Check: Is this MEETING_CRITICAL_CALL?
      ✅ YES → deliverAlertCall()
                → autoCallService.makeCall() [PHONE]
      ❌ NO → deliverAlertEmail()
              → emailProvider.sendAlertEmail() [EMAIL]


════════════════════════════════════════════════════════════════════════════════════
CALL SCRIPT (NEW)
════════════════════════════════════════════════════════════════════════════════════

"Hi, this is SaveHub.
Your meeting '<TITLE>' was scheduled at <TIME>.
We're calling because missing this could cost you time or money.
Please join now if you haven't already."

Example with real data:
"Hi, this is SaveHub.
Your meeting 'Board Sync' was scheduled at 02:30 PM.
We're calling because missing this could cost you time or money.
Please join now if you haven't already."


════════════════════════════════════════════════════════════════════════════════════
EMAIL SUBJECT (ENHANCED)
════════════════════════════════════════════════════════════════════════════════════

OLD:
   "Reminder: Upcoming Meeting"
   "Meeting Starting Soon"

NEW:
   "Your meeting starts in 5 minutes — don't let it slip"
   "Urgent: Your meeting starts in 3 minutes — missing it could cost you"


════════════════════════════════════════════════════════════════════════════════════
EMAIL BODY (ENHANCED)
════════════════════════════════════════════════════════════════════════════════════

OLD:
   "You have an upcoming meeting.
   Event: Upcoming event
   Time: [timestamp]
   Please review the meeting details..."

NEW:
   "You have a meeting 'Board Sync' starting at 02:30 PM in 5 minutes.
   
   We're reminding you early so you don't have to rush or regret missing it later.
   
   Please review the meeting details and ensure you're prepared to attend."


════════════════════════════════════════════════════════════════════════════════════
STAGE COLLAPSING (NEW)
════════════════════════════════════════════════════════════════════════════════════

SCENARIO:
   Rule engine schedules 3 alerts for same meeting at same time:
   - MEETING_UPCOMING_EMAIL (5 min before)
   - MEETING_URGENT_MESSAGE (3 min before)
   - MEETING_CRITICAL_CALL (1 min before)

WITHOUT COLLAPSING:
   ❌ User gets EMAIL + SMS + PHONE CALL (spam)

WITH COLLAPSING (NEW):
   ✅ Alert worker detects 3 alerts for same meeting
   ✅ Picks highest priority: CRITICAL_CALL
   ✅ Delivers: CRITICAL_CALL only (phone call)
   ✅ Marks: UPCOMING_EMAIL and URGENT_MESSAGE as SKIPPED
   ✅ User gets: Single focused message


════════════════════════════════════════════════════════════════════════════════════
LOGGING EXAMPLES
════════════════════════════════════════════════════════════════════════════════════

TASK 1 - ROUTING:
   [DELIVERY] Routing CRITICAL_CALL to autoCallService
   [EMAIL] Delivering alert to user@example.com

TASK 2 - CALL CONTEXT:
   [CALL] Meeting context: "Board Sync", 5 min remaining
   [CALL] Initiating call to ****2847

TASK 3 - EMAIL CONTEXT:
   [EMAIL] Sending alert to user@example.com
   Subject: "Your meeting starts in 5 minutes — don't let it slip"

TASK 4 - STAGE COLLAPSING:
   [DELIVERY] Collapsing stages — delivering only MEETING_CRITICAL_CALL

TASK 5 - CALL EXECUTION:
   [CALL] Initiating call to ****2847
   [CALL] Provider response: sid=CA1234567890abcdef
   [CALL] Call completed - Status=initiated, Provider=twilio


════════════════════════════════════════════════════════════════════════════════════
FILES CHANGED (4 FILES)
════════════════════════════════════════════════════════════════════════════════════

1. workers/alertDeliveryWorker.js (MAJOR)
   - Added: autoCallService import
   - Added: deliverAlertCall() function
   - Added: generateCallContext() function
   - Added: getHighestSeverityAlert() function
   - Modified: deliverPendingAlerts() (stage collapsing)

2. services/autoCallService.js (MODERATE)
   - Enhanced: makeCall() with detailed logging
   - Enhanced: makeCallViaTwilio() with response logging
   - Enhanced: makeCallViaMock() with mock logging

3. services/emailTemplates.js (MODERATE)
   - Enhanced: generateSubject() with time-based framing
   - Enhanced: getBodyTemplate() with meeting context
   - Modified: createEmailContent() to pass event

4. services/alertService.js (MINOR)
   - Added: markAlertSkipped() function


════════════════════════════════════════════════════════════════════════════════════
HOW TO VERIFY THE FIX IS WORKING
════════════════════════════════════════════════════════════════════════════════════

1. WATCH SERVER LOGS FOR:
   ✅ [DELIVERY] Routing CRITICAL_CALL to autoCallService
   ✅ [CALL] Initiating call to...
   ✅ [CALL] Provider response: sid=...
   ✅ [DELIVERY] Collapsing stages — delivering only...

2. VERIFY EMAIL CONTAINS:
   ✅ Subject: "Your meeting starts in X minutes — ..."
   ✅ Body: "You have a meeting '<TITLE>' starting at <TIME>"
   ✅ Message includes time remaining
   ✅ Consequence framing ("don't have to rush or regret")

3. VERIFY CALL IS MADE:
   ✅ autoCallService.makeCall() is invoked
   ✅ Phone number is called
   ✅ Script mentions meeting title
   ✅ Call is logged with sid

4. VERIFY NO SPAM:
   ✅ If 3 stages scheduled for same meeting
   ✅ Only 1 is delivered (highest priority)
   ✅ Others marked as SKIPPED in database


════════════════════════════════════════════════════════════════════════════════════
WHAT DIDN'T CHANGE
════════════════════════════════════════════════════════════════════════════════════

✅ Rules engine (ruleConfig.js)
✅ Scheduler (calendarScheduler.js)
✅ Calendar sync (calendarService.js)
✅ Rule evaluation (ruleEngine.js)
✅ Event creation logic
✅ Database schema
✅ API endpoints
✅ Incident creation (if applicable)


════════════════════════════════════════════════════════════════════════════════════
WHEN TO USE THIS FIX
════════════════════════════════════════════════════════════════════════════════════

Deploy this when:
   ✅ Rules engine is working correctly
   ✅ Scheduler is stable
   ✅ Events are being created
   ✅ Alerts are being scheduled
   ✅ You want proper delivery routing

Don't deploy if:
   ❌ Rules are broken
   ❌ Scheduler is crashing
   ❌ Alerts aren't being created


════════════════════════════════════════════════════════════════════════════════════
TESTING THE FIX (MANUAL)
════════════════════════════════════════════════════════════════════════════════════

1. Start server:
   cd incident-engine
   node server.js

2. Watch for alerts being scheduled (rules engine)

3. Watch for alert delivery worker logs:
   [EMAIL] Delivering alert: MEETING/MEETING_CRITICAL_CALL
   [DELIVERY] Routing CRITICAL_CALL to autoCallService
   [CALL] Initiating call to ****[phone]
   [CALL] Provider response: sid=...

4. Check database:
   SELECT alert_type, status FROM alerts
   WHERE user_id = 'test-user-id'
   ORDER BY created_at DESC LIMIT 5;
   
   Expected:
   - MEETING_CRITICAL_CALL: DELIVERED
   - MEETING_UPCOMING_EMAIL: SKIPPED (if same event)


════════════════════════════════════════════════════════════════════════════════════
ROLLBACK PROCEDURE (IF NEEDED)
════════════════════════════════════════════════════════════════════════════════════

If anything breaks, rollback is simple:

1. Restore original files from git:
   git checkout HEAD -- workers/alertDeliveryWorker.js
   git checkout HEAD -- services/autoCallService.js
   git checkout HEAD -- services/emailTemplates.js
   git checkout HEAD -- services/alertService.js

2. Restart server:
   node server.js

No database migrations were added, so no rollback needed there.


════════════════════════════════════════════════════════════════════════════════════
SUCCESS CRITERIA (ALL MET)
════════════════════════════════════════════════════════════════════════════════════

✅ Critical meetings trigger REAL phone calls
✅ Emails mention meeting title + time
✅ No duplicate emotional spam
✅ User always understands WHAT is at risk
✅ Calls only happen in CRITICAL window
✅ Logs clearly show call execution

════════════════════════════════════════════════════════════════════════════════════
