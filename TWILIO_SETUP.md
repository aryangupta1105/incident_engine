╔════════════════════════════════════════════════════════════════════════════════╗
║                        TWILIO PRODUCTION SETUP GUIDE                            ║
║                  Real Auto-Call Integration for SaveHub                         ║
╚════════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════════
SECTION 1: OVERVIEW
═══════════════════════════════════════════════════════════════════════════════════

The auto-call service has been upgraded to support REAL Twilio calls while
maintaining backward compatibility with mock calls for development.

✓ Real calls placed during critical window (2-3 min before meeting)
✓ Mock calls in development (no charges)
✓ Rate limiting: max 2 calls per user/meeting
✓ Timeout safety: 45 seconds max
✓ Retry logic: once on failure
✓ Graceful failure: never crashes system
✓ Production-grade logging


═══════════════════════════════════════════════════════════════════════════════════
SECTION 2: REQUIRED ENVIRONMENT VARIABLES
═══════════════════════════════════════════════════════════════════════════════════

Add to your .env file:

CALL_PROVIDER=twilio
│
├─ Options: "twilio" or "mock"
├─ Development default: "mock"
└─ Production default: "twilio"


TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
│
├─ Source: Twilio Console (https://console.twilio.com)
├─ Location: Account Settings → Account SID
├─ Format: Starts with "AC"
└─ Security: KEEP SECRET - never commit to repo

TWILIO_AUTH_TOKEN=your_auth_token_here
│
├─ Source: Twilio Console (https://console.twilio.com)
├─ Location: Account Settings → Auth Token
├─ Format: 32-character hex string
├─ Security: KEEP SECRET - rotate regularly in production
└─ Warning: If exposed, regenerate immediately in console

TWILIO_FROM_NUMBER=+14782261600
│
├─ Your Twilio phone number
├─ Source: Twilio Console → Phone Numbers → Manage Numbers
├─ Format: +1 (US), must include country code
├─ Cost: Charged per outbound call
└─ Note: Must be verified/purchased in Twilio account

CALL_WEBHOOK_URL=https://your-app-domain.com
│
├─ Your app's base URL
├─ Used for call status callbacks
├─ Development: http://localhost:3000
├─ Production: https://yourdomain.com
└─ Important: MUST be HTTPS in production for security

CALL_TEST_MODE=false
│
├─ Set to "true" to skip actual calls (simulate)
├─ Development: "true" (recommended for dev/testing)
├─ Production: "false"
└─ Useful: Test logic without Twilio charges


═══════════════════════════════════════════════════════════════════════════════════
SECTION 3: GETTING TWILIO CREDENTIALS (STEP BY STEP)
═══════════════════════════════════════════════════════════════════════════════════

STEP 1: Create Twilio Account
──────────────────────────────
1. Visit: https://www.twilio.com/console
2. Sign up for free trial or create account
3. Receive $15 credit for trial

STEP 2: Get Account SID & Auth Token
────────────────────────────────────
1. Go to: https://console.twilio.com
2. Look at top left - you'll see:
   Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Auth Token: (click to reveal)
3. Copy both values
4. Add to .env:
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_token_here

STEP 3: Get or Create Phone Number
───────────────────────────────────
1. Go to: https://console.twilio.com/phone-numbers
2. Option A - Create Trial Number (free):
   - Click "Get a Trial Phone Number"
   - Accept default country
   - Confirm and note the number
   
3. Option B - Buy Production Number:
   - Click "Buy a Number"
   - Choose country/area code
   - Select features (voice)
   - Complete purchase

4. Add to .env:
   TWILIO_FROM_NUMBER=+1234567890

STEP 4: Set Webhook URL (for Status Callbacks)
───────────────────────────────────────────────
Development (localhost):
  CALL_WEBHOOK_URL=http://localhost:3000

Production (must be HTTPS):
  CALL_WEBHOOK_URL=https://yourdomain.com

Note: Webhooks will be POST requests to:
  - /call/status (call status updates)
  - /call/response (DTMF key press responses)


═══════════════════════════════════════════════════════════════════════════════════
SECTION 4: INSTALLATION & SETUP
═══════════════════════════════════════════════════════════════════════════════════

Step 1: Install Twilio SDK
───────────────────────────
npm install twilio

Step 2: Configure .env File
────────────────────────────

Development (uses MOCK calls - no charges):
  CALL_PROVIDER=mock
  NODE_ENV=development
  # Optional - Twilio creds not needed for mock

Production (uses REAL calls):
  CALL_PROVIDER=twilio
  NODE_ENV=production
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=your_token_here
  TWILIO_FROM_NUMBER=+1234567890
  CALL_WEBHOOK_URL=https://yourdomain.com

Step 3: Verify Installation
────────────────────────────
npm start

Check logs for:
  [CALL] Provider=twilio
  or
  [CALL] Provider=mock


═══════════════════════════════════════════════════════════════════════════════════
SECTION 5: TESTING CALLS SAFELY
═══════════════════════════════════════════════════════════════════════════════════

Option 1: MOCK MODE (Recommended for Development)
──────────────────────────────────────────────────
Set in .env:
  CALL_PROVIDER=mock
  CALL_TEST_MODE=true

Behavior:
  ✓ Calls logged to console
  ✓ No actual calls placed
  ✓ No Twilio charges
  ✓ Logs show: [CALL][MOCK] Mock call initiated

To Test:
  1. Start server: npm start
  2. Trigger a missed meeting scenario
  3. Watch logs for mock call
  4. Example log:
     [CALL][MOCK] Mock call initiated
     [CALL][MOCK] To=****1234
     [CALL][MOCK] Message="This is SaveHub..."


Option 2: TEST MODE (Simulate Real Calls Without Charges)
──────────────────────────────────────────────────────────
Set in .env:
  CALL_PROVIDER=twilio
  CALL_TEST_MODE=true

Behavior:
  ✓ Twilio SDK initialized
  ✓ Calls simulated (not placed)
  ✓ No charges
  ✓ Returns mock response
  ✓ Logs show: [CALL] TEST MODE - Call not placed

To Test:
  1. Add valid Twilio credentials to .env
  2. Set CALL_TEST_MODE=true
  3. Start server: npm start
  4. Trigger missed meeting scenario
  5. Logs show simulated call
  6. Check database: escalation_steps.status = 'EXECUTED'


Option 3: PRODUCTION TEST (Real Calls)
──────────────────────────────────────
Set in .env:
  CALL_PROVIDER=twilio
  CALL_TEST_MODE=false

⚠️  WARNING: This will place REAL calls and incur charges!
⚠️  Test with a valid phone number you own!

To Test Safely:
  1. Set your own phone number in database
  2. Trigger missed meeting scenario
  3. Your phone will ring in ~2-3 minutes
  4. Answer or let it ring - both work
  5. Check logs for call SID
  6. Check Twilio console for call record


═══════════════════════════════════════════════════════════════════════════════════
SECTION 6: HOW IT WORKS (TECHNICAL FLOW)
═══════════════════════════════════════════════════════════════════════════════════

Timeline: Meeting at 14:00

13:59 - PHASE A: Calendar sync
        Events created, alerts scheduled

13:48 - PHASE B Stage 1: Email alert sent

13:55 - PHASE B Stage 2: SMS alert sent

13:58 - PHASE B Stage 3 CRITICAL: Auto-call triggered
        
        [Execution Flow]
        1. escalationWorker checks pending steps
        2. Step type = CALL, in critical window (2-3 min)
        3. autoCallService.makeCall() called with:
           {
             to: "+1234567890",
             message: "This is SaveHub calling about meeting...",
             context: {
               userId: "user-uuid",
               eventId: "event-uuid",
               incidentId: "incident-uuid",
               window: { type: "CRITICAL", secondsBeforeMeeting: 120 }
             }
           }
        
        4. Safety guards check:
           ✓ Rate limit: <2 calls for this user/event
           ✓ Critical window: 2-3 min before
           ✓ Not resolved: incident still OPEN/ESCALATING
        
        5. CALL_PROVIDER check:
           If "twilio":
             - Create Twilio client
             - Generate TwiML (call script)
             - client.calls.create() → places real call
             - Logs call SID
           
           If "mock":
             - Log [CALL][MOCK]
             - Return simulated response
        
        6. User receives call
           - Hears: "This is SaveHub checking in about Team Standup..."
           - Can press 1 = JOINED, 2 = MISSED
           - Or just hang up

14:00 - Meeting starts

14:10 - If user didn't respond:
        PHASE D: Escalation ladder continues
        Incident state: OPEN → ACKNOWLEDGED → ESCALATING
        User can manually manage via API


═══════════════════════════════════════════════════════════════════════════════════
SECTION 7: PRODUCTION SAFETY FEATURES
═══════════════════════════════════════════════════════════════════════════════════

RATE LIMITING
─────────────
Max calls per user/meeting: 2

Tracker keeps count in memory
After 10 minutes: tracker entry removed
If 2 calls already placed: return rate_limited status
Log: [CALL] RATE LIMITED - User X already has 2 calls

Example:
  User misses meeting
  Escalation step 1: Email sent
  Escalation step 2: SMS sent
  Escalation step 3: Call sent (1st call)
  If system retries: Call sent (2nd call) ✓
  If system retries again: [CALL] RATE LIMITED ✓


HARD STOP - CRITICAL WINDOW ONLY
─────────────────────────────────
Calls ONLY happen 2-3 minutes before meeting
Outside this window: call skipped

Guard check:
  if (window.secondsBeforeMeeting > 180) {
    return { status: 'skipped', reason: 'outside_critical_window' };
  }

Log: [CALL] HARD STOP - Outside critical window (240s before)

Prevents:
  ✗ Calls at wrong times
  ✗ Excessive interruptions
  ✗ Unexpected charges


TIMEOUT SAFETY
──────────────
Call creation timeout: 45 seconds
If Twilio API doesn't respond: fail gracefully

Implementation:
  const callWithTimeout = Promise.race([
    client.calls.create(...),
    timeout(45000)
  ]);

If timeout: returns failed status (doesn't crash)
Log: [CALL] Twilio error - Reason=Call creation timeout (45s)


RETRY LOGIC
───────────
Retry only once, only on network errors
Not on auth errors (credentials invalid)

Retryable errors:
  ✓ Timeout
  ✓ Connection refused
  ✓ DNS not found
  ✓ Socket hang up

Non-retryable errors:
  ✗ Invalid credentials
  ✗ Account suspended
  ✗ Invalid phone number

After retry attempt 2: fails gracefully
Log: [CALL] Call failed - Reason=error_message


GRACEFUL FAILURE
────────────────
Errors NEVER crash system
If call fails:
  1. Log error details
  2. Return { status: 'failed', error: '...' }
  3. Escalation workflow continues
  4. System stays operational

Example failure response:
  {
    status: 'failed',
    provider: 'twilio',
    error: 'Twilio credentials not configured',
    to: '****1234',
    context: { userId: '...', eventId: '...' },
    timestamp: '2025-12-23T14:58:30.000Z'
  }


INCIDENT RESOLUTION STOPS CALLS
────────────────────────────────
Calls stop immediately when:

1. User confirms JOINED:
   POST /meetings/:eventId/checkin { status: "JOINED" }
   → All pending escalation steps cancelled
   → Incident resolved
   → No more calls placed

2. Incident manually resolved:
   POST /incidents/:id/resolve
   → All pending escalation steps cancelled
   → No more calls placed


═══════════════════════════════════════════════════════════════════════════════════
SECTION 8: MONITORING & TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════════

Check Call Logs
───────────────
Development:
  Look for: [CALL] in console output
  
  Example logs:
  [CALL] Provider=twilio
  [CALL] Initiating call to ****1234
  [CALL] Creating TwiML for event=abc123, user=xyz789
  [CALL] Twilio call initiated
  [CALL] Call SID=CA1234567890abcdef
  [CALL] Call completed - Status=initiated, Provider=twilio

Production:
  Logs saved to: process.stderr or log file
  Filter for: [CALL]
  Search for: call SID for tracking


Check Twilio Console
────────────────────
1. Visit: https://console.twilio.com/logs/calls
2. See all calls placed
3. Status: completed, failed, no-answer
4. Duration: call length
5. Cost: charges incurred
6. Debug: click call for details


Database Monitoring
───────────────────
Check escalation_steps table:
  SELECT * FROM escalation_steps 
  WHERE step_type = 'CALL'
  ORDER BY created_at DESC
  LIMIT 10;

Fields to monitor:
  - step_number: which step (1=email, 2=sms, 3=call)
  - status: PENDING, EXECUTED, FAILED, SKIPPED
  - executed_at: when call placed
  - error_message: if failed

Query to find failed calls:
  SELECT incident_id, status, error_message FROM escalation_steps 
  WHERE step_type = 'CALL' AND status = 'FAILED'
  ORDER BY created_at DESC;


Common Issues & Solutions
─────────────────────────

Issue 1: No calls being placed
  Check: CALL_PROVIDER env var
  Fix: Set CALL_PROVIDER=twilio (or mock for dev)
  
Issue 2: Credentials error
  Check: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
  Fix: Verify in Twilio console, update .env
  
Issue 3: Rate limited
  Symptom: [CALL] RATE LIMITED - User X already has 2 calls
  Cause: 2 calls already placed for this meeting
  Expected: By design (safety feature)
  
Issue 4: Call timeout
  Symptom: [CALL] Twilio error - Reason=Call creation timeout (45s)
  Cause: Twilio API slow
  System: Automatically retries once
  
Issue 5: Call outside critical window
  Symptom: [CALL] HARD STOP - Outside critical window
  Cause: Escalation step triggered >3 min before meeting
  Expected: By design (safety feature)
  
Issue 6: Invalid phone number
  Symptom: [CALL] Twilio error - Reason=Invalid phone number
  Cause: User's phone number not in E.164 format
  Fix: Store numbers as +1234567890


═══════════════════════════════════════════════════════════════════════════════════
SECTION 9: COST MANAGEMENT
═══════════════════════════════════════════════════════════════════════════════════

Twilio Pricing (US)
────────────────────
Inbound call: $0.0075 per minute
Outbound call: $0.025 per minute
Minimum charge: minimum $0.01

Per-call cost estimate:
  - Average meeting reminder call: 2-3 minutes
  - Cost per call: ~$0.05-$0.08
  - Cost per user/day: depends on meetings missed

Optimize Cost
─────────────
1. Limit to CRITICAL cases only
   ✓ Only call when user misses meeting (phase D)
   ✓ Max 2 calls per meeting (rate limit)
   ✓ Don't call during early alert phases

2. Use shorter messages
   ✓ Current: "This is SaveHub checking in..."
   ✓ Shorter = less call duration = less cost

3. Monitor usage
   ✓ Check Twilio console daily
   ✓ Set alerts for unexpected charges
   ✓ Review per-user call counts

4. Test in mock mode first
   ✓ All development: CALL_PROVIDER=mock
   ✓ Only production: CALL_PROVIDER=twilio


Monthly Cost Example
─────────────────────
100 users
30 days
5% miss rate (5 users/day)
Average 2 calls per missed meeting

Calculation:
  5 users/day × 30 days = 150 missed meetings
  150 × 2 calls = 300 calls/month
  300 calls × $0.07/call = $21/month

✓ Acceptable for production B2C product


═══════════════════════════════════════════════════════════════════════════════════
SECTION 10: SWITCHING BETWEEN MOCK & REAL
═══════════════════════════════════════════════════════════════════════════════════

Development (use MOCK - no charges)
───────────────────────────────────
.env:
  CALL_PROVIDER=mock
  NODE_ENV=development

Result:
  [CALL][MOCK] Mock call initiated
  [CALL][MOCK] To=****1234
  (no actual call placed)

Restart server: npm start


Production (use TWILIO - real calls)
────────────────────────────────────
.env:
  CALL_PROVIDER=twilio
  NODE_ENV=production
  TWILIO_ACCOUNT_SID=ACxxxxxxxx...
  TWILIO_AUTH_TOKEN=your_token
  TWILIO_FROM_NUMBER=+1234567890
  CALL_WEBHOOK_URL=https://yourdomain.com

Result:
  [CALL] Provider=twilio
  [CALL] Twilio call initiated
  [CALL] Call SID=CA1234567890...
  (real call placed, charges incurred)

Restart server: npm start


Switch Back to MOCK (Emergency)
───────────────────────────────
If too many charges or bugs found:
  1. Update .env: CALL_PROVIDER=mock
  2. Restart: npm start
  3. Calls will be logged, not placed
  4. Fix issues
  5. Re-enable: CALL_PROVIDER=twilio


═══════════════════════════════════════════════════════════════════════════════════
SECTION 11: SECURITY & BEST PRACTICES
═══════════════════════════════════════════════════════════════════════════════════

Never Commit Secrets
────────────────────
.gitignore must include:
  .env
  .env.local
  .env.production

Command:
  echo ".env" >> .gitignore
  git add .gitignore
  git commit


Rotate Auth Tokens
───────────────────
Production best practice:
  - Rotate TWILIO_AUTH_TOKEN every 90 days
  - Use Twilio API keys instead of master token
  - Set token rotation reminder

To rotate:
  1. Generate new token in Twilio console
  2. Update TWILIO_AUTH_TOKEN in secure storage
  3. Verify new token works
  4. Revoke old token in console


Phone Number Privacy
─────────────────────
Logs mask phone numbers:
  Input: +1-234-567-8901
  Logged: ****8901
  
No full phone numbers logged (good for GDPR/privacy)
Only last 4 digits shown in logs


Webhook Security
────────────────
Callbacks from Twilio:
  POST /call/status
  POST /call/response

Verify requests are from Twilio:
  1. Check X-Twilio-Signature header
  2. Validate against auth token
  3. Implementation: use twilio SDK middleware
  
Recommended:
  const TwilioExpressValidator = require('twilio').webhook;
  app.post('/call/status', TwilioExpressValidator(authToken), handler);


═══════════════════════════════════════════════════════════════════════════════════
SECTION 12: SUPPORT & REFERENCES
═══════════════════════════════════════════════════════════════════════════════════

Twilio Documentation
────────────────────
Official docs: https://www.twilio.com/docs
API reference: https://www.twilio.com/docs/voice/api
Node.js SDK: https://www.twilio.com/docs/libraries/node

Quick Links:
  - Make calls: https://www.twilio.com/docs/voice/make-calls
  - TwiML reference: https://www.twilio.com/docs/voice/twiml
  - Status callbacks: https://www.twilio.com/docs/voice/status-callbacks
  - Console: https://console.twilio.com


Support
───────
Issue with implementation:
  Check: autoCallService.js comments
  Logs: [CALL] tags in console
  Test: CALL_TEST_MODE=true

Issue with Twilio account:
  Contact: https://support.twilio.com
  Account: Your Twilio account login


═══════════════════════════════════════════════════════════════════════════════════
QUICK REFERENCE CARD
═══════════════════════════════════════════════════════════════════════════════════

Development:
  CALL_PROVIDER=mock
  CALL_TEST_MODE=true
  Result: [CALL][MOCK] logged, no calls placed

Production:
  CALL_PROVIDER=twilio
  TWILIO_ACCOUNT_SID=ACxxxxxxxx...
  TWILIO_AUTH_TOKEN=token
  TWILIO_FROM_NUMBER=+1234567890
  Result: Real calls placed, charges incurred

Test Production Logic (no charges):
  CALL_PROVIDER=twilio
  CALL_TEST_MODE=true
  Result: Twilio SDK initialized, calls simulated

Verify Setup:
  npm start
  Check logs for: [CALL] Provider=...

Check Calls:
  Logs: Look for [CALL] tags
  Database: SELECT * FROM escalation_steps WHERE step_type='CALL'
  Twilio console: https://console.twilio.com/logs/calls

Emergency (disable calls):
  CALL_PROVIDER=mock
  npm restart

═══════════════════════════════════════════════════════════════════════════════════
PRODUCTION READY ✓
═══════════════════════════════════════════════════════════════════════════════════

Twilio integration is complete and production-ready.

Safety features:
  ✓ Rate limiting (max 2 calls/meeting)
  ✓ Critical window only (2-3 min before)
  ✓ Timeout safety (45 sec max)
  ✓ Retry once on failure
  ✓ Graceful failure (no crashes)
  ✓ Call tracking (in-memory + database)
  ✓ Phone masking (privacy)
  ✓ Incident resolution stops calls

Next steps:
  1. Add Twilio credentials to .env
  2. npm install twilio
  3. Set CALL_PROVIDER=twilio
  4. Deploy to production
  5. Monitor logs and costs

═══════════════════════════════════════════════════════════════════════════════════
