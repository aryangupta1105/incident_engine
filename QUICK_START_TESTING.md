╔════════════════════════════════════════════════════════════════════════════════╗
║                    QUICK START: END-TO-END TESTING                              ║
║              Production-Ready Testing Scenarios & Examples                      ║
╚════════════════════════════════════════════════════════════════════════════════╝

This guide provides copy-paste ready commands for testing the entire SaveHub
meeting enforcement pipeline. Run these in sequence to validate the complete
flow from authentication through incident resolution.

═══════════════════════════════════════════════════════════════════════════════════
PREREQUISITES
═══════════════════════════════════════════════════════════════════════════════════

Required:
- Node.js 16+ running
- Server started: npm start (in incident-engine folder)
- PostgreSQL database connected
- Google OAuth credentials configured

Verify Setup:
cd c:\Users\aarya\IncidentManagementSystem\incident-engine
npm start

Expected output:
  [SERVER] Server running on port 3000
  [SCHEDULER] Calendar scheduler started (1-minute tick)
  [DB] Connected to PostgreSQL


═══════════════════════════════════════════════════════════════════════════════════
PART 1: SETUP & AUTHENTICATION (ONE-TIME)
═══════════════════════════════════════════════════════════════════════════════════

STEP 1: Test Server Health
──────────────────────────

curl -X GET http://localhost:3000/health

Expected Response (200 OK):
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2025-12-23T14:30:45.123Z"
}


STEP 2: Authenticate with Google (Browser Only)
────────────────────────────────────────────────

Open browser and visit:
http://localhost:3000/auth/google

Actions:
1. Sign in with Google account
2. Grant calendar access when prompted
3. Browser shows success page
4. System stores token in database

After completion, run this to verify:

psql -U postgres -h localhost -d postgres
SELECT id, email, has_calendar_oauth FROM users WHERE email = 'your.email@gmail.com';

Expected output:
                   id                  |       email        | has_calendar_oauth
───────────────────────────────────────┼────────────────────┼────────────────────
 b3c99058-5c51-5e99-9131-7368dfb9123b | your.email@gmail.com |        true

Save the UUID (id) for next steps - we'll call it YOUR_USER_UUID


STEP 3: Verify User Created
────────────────────────────

# Replace YOUR_USER_UUID with actual UUID from previous step
curl -X GET http://localhost:3000/health

Expected: 200 OK (confirms system ready for this user)


═══════════════════════════════════════════════════════════════════════════════════
PART 2: AUTOMATIC CALENDAR SYNC & ALERT SCHEDULING (PHASE A-B)
═══════════════════════════════════════════════════════════════════════════════════

STEP 4: Trigger Calendar Sync
──────────────────────────────

# Replace YOUR_USER_UUID with the UUID from STEP 2
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b"
  }'

Expected Response (200 OK):
{
  "success": true,
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
  "eventsProcessed": 2,
  "eventsSkipped": 0,
  "message": "Calendar sync completed",
  "ruleDecisions": [
    {
      "event_id": "6d8a6c2e-3b4f-4a9b-8c1d-2e5f7a9c3b1d",
      "calendar_event_id": "google-event-id-123",
      "title": "Team Standup",
      "alerts_scheduled": 1,
      "incident_created": false,
      "reason": "scheduled 1 alert(s); no incident created"
    }
  ]
}

Save the event_id (first one in ruleDecisions) - we'll call it YOUR_EVENT_UUID

STEP 5: Verify Alerts Were Scheduled (Database Check)
──────────────────────────────────────────────────────

psql -U postgres -h localhost -d postgres
SELECT id, alert_type, status, scheduled_at FROM alerts 
  WHERE user_id = 'b3c99058-5c51-5e99-9131-7368dfb9123b'
  ORDER BY created_at DESC LIMIT 5;

Expected output (should show 1-3 alerts):
                   id                  |        alert_type         | status  |      scheduled_at
───────────────────────────────────────┼──────────────────────────┼─────────┼──────────────────────────
 7c9e1f3a-2b4c-5d6e-8f9a-1b3c5d7e9f1a | MEETING_UPCOMING_EMAIL    | PENDING | 2025-12-23T14:48:00.000Z
 8d0f2g4b-3c5d-6e7f-9g0b-2c4d6e8f0g2b | MEETING_URGENT_MESSAGE    | PENDING | 2025-12-23T14:55:00.000Z
 9e1g3h5c-4d6e-7f8g-0h1c-3d5e7f9g1h3c | MEETING_CRITICAL_CALL     | PENDING | 2025-12-23T14:58:00.000Z


═══════════════════════════════════════════════════════════════════════════════════
PART 3: SCENARIO A - USER JOINS MEETING (HAPPY PATH)
═══════════════════════════════════════════════════════════════════════════════════

This scenario tests what happens when a user successfully joins a meeting:
- Confirms meeting attendance
- All alerts cancelled
- No incident created
- No escalation needed

STEP 6: User Confirms They Joined
──────────────────────────────────

# Replace YOUR_USER_UUID and YOUR_EVENT_UUID
curl -X POST http://localhost:3000/meetings/6d8a6c2e-3b4f-4a9b-8c1d-2e5f7a9c3b1d/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
    "status": "JOINED"
  }'

Expected Response (200 OK):
{
  "success": true,
  "checkinId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "status": "JOINED",
  "action": "JOINED_CONFIRMED",
  "message": "Great! All alerts cancelled. Meeting confirmed as joined."
}

STEP 7: Verify Alerts Were Cancelled
─────────────────────────────────────

psql -U postgres -h localhost -d postgres
SELECT id, alert_type, status FROM alerts 
  WHERE user_id = 'b3c99058-5c51-5e99-9131-7368dfb9123b'
  ORDER BY created_at DESC LIMIT 5;

Expected: All alerts now have status = 'CANCELLED'

STEP 8: Verify No Incident Was Created
────────────────────────────────────────

psql -U postgres -h localhost -d postgres
SELECT COUNT(*) FROM incidents 
  WHERE user_id = 'b3c99058-5c51-5e99-9131-7368dfb9123b'
  AND event_id = '6d8a6c2e-3b4f-4a9b-8c1d-2e5f7a9c3b1d';

Expected: 0 (no incident created for joined meeting)


═══════════════════════════════════════════════════════════════════════════════════
PART 4: SCENARIO B - USER MISSES MEETING (RECOVERY PATH)
═══════════════════════════════════════════════════════════════════════════════════

This scenario tests what happens when user misses a meeting:
- Incident automatically created
- Escalation ladder scheduled (Email → SMS → Call)
- User can acknowledge/escalate/resolve incident

NOTE: First create a NEW calendar sync to get fresh event

STEP 9: Trigger Fresh Calendar Sync (New Event)
────────────────────────────────────────────────

curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b"
  }'

Save a DIFFERENT event_id from ruleDecisions - call it NEW_EVENT_UUID


STEP 10: User Confirms They Missed
───────────────────────────────────

curl -X POST http://localhost:3000/meetings/NEW_EVENT_UUID/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
    "status": "MISSED"
  }'

Expected Response (200 OK):
{
  "success": true,
  "checkinId": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  "status": "MISSED",
  "action": "MISSED_CONFIRMED",
  "message": "Incident created for missed meeting. Recovery escalation ladder activated.",
  "incidentCreated": true,
  "incidentId": "cccccccc-dddd-eeee-ffff-0000000000ff",
  "escalationStepsScheduled": 3
}

Save the incidentId - we'll call it YOUR_INCIDENT_UUID


STEP 11: Verify Incident Created
─────────────────────────────────

psql -U postgres -h localhost -d postgres
SELECT id, state, severity, created_at FROM incidents 
  WHERE id = 'cccccccc-dddd-eeee-ffff-0000000000ff';

Expected output:
                   id                  | state | severity |      created_at
───────────────────────────────────────┼───────┼──────────┼──────────────────────────
 cccccccc-dddd-eeee-ffff-0000000000ff  | OPEN  | HIGH     | 2025-12-23T14:33:00.000Z


STEP 12: Verify Escalation Ladder Scheduled
─────────────────────────────────────────────

psql -U postgres -h localhost -d postgres
SELECT step_number, step_type, status, scheduled_at FROM escalation_steps 
  WHERE incident_id = 'cccccccc-dddd-eeee-ffff-0000000000ff'
  ORDER BY step_number;

Expected output (3 escalation steps):
 step_number |  step_type  | status  |      scheduled_at
─────────────┼─────────────┼─────────┼──────────────────────────
           1 | EMAIL       | PENDING | 2025-12-23T14:33:00.000Z
           2 | SMS         | PENDING | 2025-12-23T14:35:00.000Z
           3 | CALL        | PENDING | 2025-12-23T14:38:00.000Z


═══════════════════════════════════════════════════════════════════════════════════
PART 5: INCIDENT MANAGEMENT WORKFLOW
═══════════════════════════════════════════════════════════════════════════════════

STEP 13: Acknowledge Incident
──────────────────────────────

curl -X POST http://localhost:3000/incidents/cccccccc-dddd-eeee-ffff-0000000000ff/acknowledge \
  -H "Content-Type: application/json"

Expected Response (200 OK):
{
  "success": true,
  "incident": {
    "id": "cccccccc-dddd-eeee-ffff-0000000000ff",
    "state": "ACKNOWLEDGED",
    "created_at": "2025-12-23T14:33:00.000Z",
    "updated_at": "2025-12-23T14:35:15.000Z",
    ...
  },
  "message": "Incident acknowledged successfully"
}

Verify in database:
psql -U postgres -h localhost -d postgres
SELECT id, state FROM incidents WHERE id = 'cccccccc-dddd-eeee-ffff-0000000000ff';

Expected: state = 'ACKNOWLEDGED'


STEP 14: Escalate Incident (Optional)
──────────────────────────────────────

curl -X POST http://localhost:3000/incidents/cccccccc-dddd-eeee-ffff-0000000000ff/escalate

Expected Response (200 OK):
{
  "success": true,
  "incident": {
    "id": "cccccccc-dddd-eeee-ffff-0000000000ff",
    "state": "ESCALATING",
    "escalation_count": 1,
    ...
  },
  "message": "Incident escalated successfully"
}


STEP 15: Resolve Incident
──────────────────────────

curl -X POST http://localhost:3000/incidents/cccccccc-dddd-eeee-ffff-0000000000ff/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution_note": "Called the team. Meeting rescheduled for tomorrow. All present."
  }'

Expected Response (200 OK):
{
  "success": true,
  "incident": {
    "id": "cccccccc-dddd-eeee-ffff-0000000000ff",
    "state": "RESOLVED",
    "resolved_at": "2025-12-23T14:36:30.000Z",
    "resolution_note": "Called the team. Meeting rescheduled for tomorrow. All present.",
    ...
  },
  "message": "Incident resolved successfully"
}

Final verification:
psql -U postgres -h localhost -d postgres
SELECT id, state, resolved_at FROM incidents 
  WHERE id = 'cccccccc-dddd-eeee-ffff-0000000000ff';

Expected: state = 'RESOLVED', resolved_at = recent timestamp


═══════════════════════════════════════════════════════════════════════════════════
PART 6: ADVANCED TESTING SCENARIOS
═══════════════════════════════════════════════════════════════════════════════════

SCENARIO: Multiple Concurrent Meetings
───────────────────────────────────────

1. Trigger calendar sync (gets 3+ meetings)
2. Confirm JOINED for first meeting
3. Confirm MISSED for second meeting
4. Confirm JOINED for third meeting

Verify only one incident created for the second meeting:

psql -U postgres -h localhost -d postgres
SELECT COUNT(*) FROM incidents WHERE user_id = 'YOUR_USER_UUID';

Expected: 1 incident (only for missed meeting)


SCENARIO: Automatic Incident Creation (Grace Period)
──────────────────────────────────────────────────────

The system automatically creates incidents 5 minutes after meeting start
if user hasn't confirmed. This is PHASE D.

To test:
1. Trigger calendar sync (gets meeting starting in 6 minutes)
2. Wait 5 minutes
3. Check if incident auto-created:

# Run this after 5 minutes:
psql -U postgres -h localhost -d postgres
SELECT id, state FROM incidents 
  WHERE user_id = 'YOUR_USER_UUID'
  AND type = 'MISSED_MEETING';

Expected: Incident CREATED with state = OPEN


SCENARIO: Token Refresh
────────────────────────

Test Google OAuth token refresh:

1. Trigger calendar sync (uses current token)
2. Wait ~10 seconds
3. Delete the access_token from database:
   
   psql -U postgres -h localhost -d postgres
   UPDATE users 
   SET access_token = '' 
   WHERE id = 'YOUR_USER_UUID';

4. Trigger calendar sync again:

   curl -X POST http://localhost:3000/calendar/sync \
     -H "Content-Type: application/json" \
     -d '{"userId": "YOUR_USER_UUID"}'

Expected: 200 OK (system auto-refreshed token using refresh_token)

Verify in logs:
Look for: [TOKEN] Refreshing access token...
          [TOKEN] Token refreshed successfully


SCENARIO: Invalid State Transitions
─────────────────────────────────────

Try to transition from ACKNOWLEDGED → ACKNOWLEDGED:

curl -X POST http://localhost:3000/incidents/cccccccc-dddd-eeee-ffff-0000000000ff/acknowledge

Expected Response (409 Conflict):
{
  "error": "Conflict",
  "details": "Cannot transition from ACKNOWLEDGED to ACKNOWLEDGED"
}


═══════════════════════════════════════════════════════════════════════════════════
PART 7: VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════════════════════════

Production Readiness Checklist - Run Through All:

AUTHENTICATION & SETUP
☐ Health check returns 200 OK
☐ Google OAuth flow works
☐ User created in database
☐ Calendar sync returns events

ALERT SYSTEM (PHASE B)
☐ Alerts scheduled for future meetings
☐ 3 alerts created (Email, SMS, Call)
☐ Alerts have correct scheduled times
☐ Alert status transitions PENDING → DELIVERED/CANCELLED

MEETING CONFIRMATION (PHASE C)
☐ User can confirm JOINED
☐ User can confirm MISSED
☐ Alerts cancelled when JOINED
☐ Incident created when MISSED
☐ Checkin record created in database

INCIDENT MANAGEMENT
☐ Incident state starts as OPEN
☐ Can transition OPEN → ACKNOWLEDGED
☐ Can transition ACKNOWLEDGED → ESCALATING
☐ Can transition any → RESOLVED
☐ Resolution note saved correctly

ESCALATION LADDER (PHASE D)
☐ 3 escalation steps created (Email, SMS, Call)
☐ Steps scheduled at correct intervals
☐ Steps execute in correct order
☐ Step status updates PENDING → EXECUTED
☐ Escalation stops when incident RESOLVED

DATA CONSISTENCY
☐ meeting_checkins table populated correctly
☐ escalation_steps table has all records
☐ Timestamps are ISO format
☐ UUIDs are valid format
☐ No NULL required fields

ERROR HANDLING
☐ 400 error for invalid status
☐ 404 error for non-existent incident
☐ 409 error for invalid state transition
☐ 409 error for OAUTH_NOT_CONNECTED
☐ Proper error messages returned

═══════════════════════════════════════════════════════════════════════════════════
PART 8: TROUBLESHOOTING & DEBUGGING
═══════════════════════════════════════════════════════════════════════════════════

If Calendar Sync Returns 409 "OAUTH_NOT_CONNECTED":
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. Verify user authenticated:                                                   │
│    curl http://localhost:3000/auth/google                                       │
│                                                                                 │
│ 2. Check database:                                                              │
│    psql -U postgres -h localhost -d postgres                                    │
│    SELECT email, has_calendar_oauth FROM users                                  │
│    WHERE has_calendar_oauth = true;                                             │
│                                                                                 │
│ 3. If no results: Run OAuth flow again                                          │
│    http://localhost:3000/auth/google                                            │
└─────────────────────────────────────────────────────────────────────────────────┘

If Calendar Sync Returns 409 "OAUTH_TOKEN_EXPIRED":
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. Check token refresh logs:                                                    │
│    NODE_ENV=development node server.js                                          │
│    Look for: [TOKEN] Refreshing...                                              │
│                                                                                 │
│ 2. If refresh fails:                                                            │
│    - Verify GOOGLE_REFRESH_TOKEN is set in .env                                │
│    - Verify refresh_token in users table is not empty                           │
│    - Re-run OAuth: http://localhost:3000/auth/google                            │
└─────────────────────────────────────────────────────────────────────────────────┘

If Alerts Not Scheduled:
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. Check rule engine logs:                                                      │
│    NODE_ENV=development node server.js                                          │
│    Look for: [RULE_ENGINE]                                                      │
│                                                                                 │
│ 2. Verify feature flags in .env:                                                │
│    FEATURE_EMAIL=true                                                           │
│    FEATURE_WHATSAPP=true                                                        │
│    FEATURE_CALL=true                                                            │
│                                                                                 │
│ 3. Check events table:                                                          │
│    SELECT COUNT(*) FROM events;                                                 │
│    If 0: Calendar sync not running or failed                                    │
│                                                                                 │
│ 4. Check alerts table:                                                          │
│    SELECT * FROM alerts ORDER BY created_at DESC LIMIT 1;                       │
│    If empty: Alerts not scheduled by rule engine                                │
└─────────────────────────────────────────────────────────────────────────────────┘

If Incident Not Created on MISSED:
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. Verify checkin created:                                                      │
│    psql -U postgres -h localhost -d postgres                                    │
│    SELECT * FROM meeting_checkins                                               │
│    WHERE status = 'MISSED' ORDER BY created_at DESC LIMIT 1;                    │
│                                                                                 │
│ 2. Check incident creation logs:                                                │
│    NODE_ENV=development node server.js                                          │
│    Look for: [CHECKIN] Creating incident...                                     │
│                                                                                 │
│ 3. Verify incidents table:                                                      │
│    SELECT * FROM incidents ORDER BY created_at DESC LIMIT 1;                    │
│    If empty: Incident creation service failed                                   │
└─────────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════════
PART 9: PRODUCTION DEPLOYMENT CHECKLIST
═══════════════════════════════════════════════════════════════════════════════════

Before deploying to production:

SECURITY
☐ All .env secrets configured
☐ GOOGLE_CLIENT_SECRET not in code
☐ DATABASE_URL using strong password
☐ SMTP_PASSWORD for emails configured
☐ TWILIO_AUTH_TOKEN for SMS configured

FEATURES
☐ FEATURE_SCHEDULER_ENABLED=true
☐ FEATURE_CALENDAR_ENABLED=true
☐ FEATURE_EMAIL=true
☐ FEATURE_WHATSAPP=true
☐ FEATURE_CALL=true

DATABASE
☐ All migrations run successfully:
   npm run migrate
☐ Required tables created:
   users, events, alerts, incidents, meeting_checkins, escalation_steps
☐ Database backed up
☐ Connection pooling configured

MONITORING
☐ Error logging configured (Sentry/LogRocket)
☐ Alerts configured for:
  - 500 errors
  - Database connection failures
  - Token refresh failures
  - Escalation failures
☐ Health check endpoint monitored

TESTING
☐ All 13+ tests pass: npm test
☐ Manual end-to-end flow verified
☐ Load testing completed (concurrent users)
☐ Database recovery tested
☐ Token refresh tested in production

DOCUMENTATION
☐ API_REFERENCE_GUIDE.md reviewed
☐ Quick start guide verified
☐ Team trained on deployment
☐ Rollback procedure documented


═══════════════════════════════════════════════════════════════════════════════════
END OF QUICK START GUIDE
═══════════════════════════════════════════════════════════════════════════════════

For complete API details, see: API_REFERENCE_GUIDE.md
For code implementation details, check: /services and /routes folders
For database schema, run: psql -U postgres -h localhost -d postgres
