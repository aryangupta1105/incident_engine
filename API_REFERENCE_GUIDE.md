╔════════════════════════════════════════════════════════════════════════════════╗
║                        SAVEHUB API REFERENCE GUIDE                              ║
║           Complete Flow Testing for Meeting Enforcement System                  ║
╚════════════════════════════════════════════════════════════════════════════════╝

BASE URL: http://localhost:3000

═══════════════════════════════════════════════════════════════════════════════════
SECTION 1: HEALTH & STATUS ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════════

1. HEALTH CHECK
───────────────────────────────────────────────────────────────────────────────────
GET /health

Purpose: Verify server and database connectivity

Response (200 - OK):
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2025-12-23T12:00:00.000Z"
}

Response (503 - Service Unavailable):
{
  "status": "error",
  "db": "unreachable",
  "error": "Connection failed",
  "timestamp": "2025-12-23T12:00:00.000Z"
}

cURL Example:
curl -X GET http://localhost:3000/health


═══════════════════════════════════════════════════════════════════════════════════
SECTION 2: AUTHENTICATION ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════════

2. INITIATE GOOGLE OAUTH FLOW
───────────────────────────────────────────────────────────────────────────────────
GET /auth/google

Purpose: Start Google Calendar OAuth authentication flow

Behavior:
- Redirects user to Google login page
- User authorizes calendar access
- Browser redirected to callback URL

cURL Example:
# Open in browser:
http://localhost:3000/auth/google


3. OAUTH CALLBACK (AUTO-HANDLED)
───────────────────────────────────────────────────────────────────────────────────
GET /auth/google/callback?code=<auth_code>

Purpose: Handle Google OAuth callback (automatically called by Google)

Auto-executed actions:
✓ Exchange auth_code for access token + refresh token
✓ Create/update user in database
✓ Store credentials securely
✓ Enable calendar sync for user

Response: Redirect to success page or error page


═══════════════════════════════════════════════════════════════════════════════════
SECTION 3: CALENDAR SYNC ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════════

4. TRIGGER CALENDAR SYNC
───────────────────────────────────────────────────────────────────────────────────
POST /calendar/sync

Purpose: Manually trigger calendar sync for a specific user
Note: In production, this runs automatically every 1 minute via PHASE A scheduler

Request Body:
{
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b"
}

Response (200 - Success):
{
  "success": true,
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
  "eventsProcessed": 3,
  "eventsSkipped": 2,
  "message": "Calendar sync completed",
  "ruleDecisions": [
    {
      "event_id": "event-uuid",
      "calendar_event_id": "google-event-id",
      "title": "Team Standup",
      "alerts_scheduled": 1,
      "incident_created": false,
      "reason": "scheduled 1 alert(s); no incident created"
    }
  ]
}

Response (409 - Not Connected):
{
  "error": "Conflict",
  "message": "User has not connected Google Calendar",
  "reason": "OAUTH_NOT_CONNECTED"
}

Response (409 - Token Expired):
{
  "error": "Conflict",
  "message": "OAuth token expired and refresh failed",
  "reason": "OAUTH_TOKEN_EXPIRED"
}

cURL Example:
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b"
  }'


═══════════════════════════════════════════════════════════════════════════════════
SECTION 4: MEETING ENFORCEMENT ENDPOINTS (PHASE A-D)
═══════════════════════════════════════════════════════════════════════════════════

5. MEETING CHECKIN - USER CONFIRMATION
───────────────────────────────────────────────────────────────────────────────────
POST /meetings/:eventId/checkin

Purpose: Allow users to confirm if they joined or missed a meeting
Implements: PHASE C (Manual Confirmation - Truth Layer)

Request Parameters:
- eventId: Event UUID (from calendar sync response)

Request Body (Option A - User Joined):
{
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
  "status": "JOINED"
}

Response (200 - JOINED):
{
  "success": true,
  "checkinId": "checkin-uuid",
  "status": "JOINED",
  "action": "JOINED_CONFIRMED",
  "message": "Great! All alerts cancelled. Meeting confirmed as joined."
}

Effects when status = JOINED:
✓ Cancel all PENDING alerts for this event
✓ Resolve any OPEN/ESCALATING incidents
✓ Skip all pending escalation steps
✓ Stop enforcement immediately

---

Request Body (Option B - User Missed):
{
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
  "status": "MISSED"
}

Response (200 - MISSED):
{
  "success": true,
  "checkinId": "checkin-uuid",
  "status": "MISSED",
  "action": "MISSED_CONFIRMED",
  "message": "Incident created for missed meeting. Recovery escalation ladder activated.",
  "incidentCreated": true,
  "incidentId": "incident-uuid",
  "escalationStepsScheduled": 3
}

Effects when status = MISSED:
✓ Create INCIDENT (if not exists)
✓ Schedule escalation ladder:
  - +0 min: Email notification
  - +2 min: SMS/WhatsApp message
  - +5 min: Auto-call

cURL Example:
# User confirming they JOINED:
curl -X POST http://localhost:3000/meetings/event-uuid/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
    "status": "JOINED"
  }'

# User confirming they MISSED:
curl -X POST http://localhost:3000/meetings/event-uuid/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
    "status": "MISSED"
  }'


═══════════════════════════════════════════════════════════════════════════════════
SECTION 5: INCIDENT MANAGEMENT ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════════

6. ACKNOWLEDGE INCIDENT
───────────────────────────────────────────────────────────────────────────────────
POST /incidents/:id/acknowledge

Purpose: Acknowledge an incident (OPEN → ACKNOWLEDGED)

Request Parameters:
- id: Incident UUID

Response (200 - Success):
{
  "success": true,
  "incident": {
    "id": "incident-uuid",
    "user_id": "user-uuid",
    "category": "MEETING",
    "type": "MISSED_MEETING",
    "severity": "HIGH",
    "state": "ACKNOWLEDGED",
    "description": "Meeting was missed",
    "created_at": "2025-12-23T12:00:00.000Z",
    "updated_at": "2025-12-23T12:05:00.000Z"
  },
  "message": "Incident acknowledged successfully"
}

Response (409 - Invalid Transition):
{
  "error": "Conflict",
  "details": "Cannot transition from ACKNOWLEDGED to ACKNOWLEDGED"
}

cURL Example:
curl -X POST http://localhost:3000/incidents/incident-uuid/acknowledge


7. ESCALATE INCIDENT
───────────────────────────────────────────────────────────────────────────────────
POST /incidents/:id/escalate

Purpose: Escalate an incident (OPEN/ACKNOWLEDGED → ESCALATING)

Request Parameters:
- id: Incident UUID

Response (200 - Success):
{
  "success": true,
  "incident": {
    "id": "incident-uuid",
    "state": "ESCALATING",
    "escalation_count": 1,
    ...
  },
  "message": "Incident escalated successfully"
}

cURL Example:
curl -X POST http://localhost:3000/incidents/incident-uuid/escalate


8. RESOLVE INCIDENT
───────────────────────────────────────────────────────────────────────────────────
POST /incidents/:id/resolve

Purpose: Resolve an incident (any state → RESOLVED)

Request Body:
{
  "resolution_note": "User confirmed they joined the meeting"
}

Response (200 - Success):
{
  "success": true,
  "incident": {
    "id": "incident-uuid",
    "state": "RESOLVED",
    "resolved_at": "2025-12-23T12:15:00.000Z",
    "resolution_note": "User confirmed they joined the meeting",
    ...
  },
  "message": "Incident resolved successfully"
}

Effects when incident RESOLVED:
✓ Stop all escalation steps
✓ Cancel pending alerts
✓ Full audit trail recorded

cURL Example:
curl -X POST http://localhost:3000/incidents/incident-uuid/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution_note": "User confirmed they joined the meeting"
  }'


═══════════════════════════════════════════════════════════════════════════════════
SECTION 6: COMPLETE END-TO-END TESTING FLOW
═══════════════════════════════════════════════════════════════════════════════════

SCENARIO: User's Meeting Enforcement Journey

┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Verify System Health                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

curl -X GET http://localhost:3000/health

Expected: 200 OK
{
  "status": "ok",
  "db": "connected"
}


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: User Authenticates with Google (One-time Setup)                         │
└─────────────────────────────────────────────────────────────────────────────────┘

# Open in browser (one-time):
http://localhost:3000/auth/google

Actions:
1. System redirects to Google login
2. User enters Google credentials
3. User grants calendar access
4. System stores refresh_token and access_token
5. System creates user record in database


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Automatic Calendar Sync (PHASE A)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

# Happens automatically every 1 minute
# OR manually trigger for testing:

curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_UUID"}'

Expected Response:
{
  "success": true,
  "eventsProcessed": 4,
  "eventsSkipped": 0,
  "ruleDecisions": [
    {
      "event_id": "event-uuid-1",
      "title": "Team Standup",
      "alerts_scheduled": 1,
      "reason": "scheduled 1 alert(s); no incident created"
    }
  ]
}

System Automatically Does:
✓ Fetch meetings from Google Calendar
✓ Create MEETING events in database
✓ Evaluate each meeting with rule engine
✓ Schedule progressive alerts (PHASE B):
  - Email at 12 minutes before
  - SMS at 5 minutes before
  - Auto-call at 2 minutes before (CRITICAL)


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 4a: SCENARIO - User Joins Meeting (Happy Path)                             │
└─────────────────────────────────────────────────────────────────────────────────┘

# User receives emails/SMS reminders
# User joins the meeting on time
# User confirms via API:

curl -X POST http://localhost:3000/meetings/EVENT_UUID/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_UUID",
    "status": "JOINED"
  }'

Expected Response:
{
  "success": true,
  "status": "JOINED",
  "action": "JOINED_CONFIRMED",
  "message": "Great! All alerts cancelled."
}

System Actions:
✓ All pending alerts CANCELLED
✓ Incident creation PREVENTED
✓ Escalation ladder stopped


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 4b: SCENARIO - User Misses Meeting (Recovery Path)                         │
└─────────────────────────────────────────────────────────────────────────────────┘

# User doesn't join the meeting
# System detects at meeting_start + 5 minute grace period (PHASE D)
# System creates INCIDENT automatically
# System schedules escalation ladder

# User can also manually confirm:

curl -X POST http://localhost:3000/meetings/EVENT_UUID/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_UUID",
    "status": "MISSED"
  }'

Expected Response:
{
  "success": true,
  "status": "MISSED",
  "action": "MISSED_CONFIRMED",
  "incidentCreated": true,
  "incidentId": "incident-uuid",
  "escalationStepsScheduled": 3
}

System Actions:
✓ Create INCIDENT with severity=HIGH
✓ Schedule escalation steps:
  +0 min: Email notification
  +2 min: SMS/WhatsApp message
  +5 min: Auto-call


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Incident Management (PHASE D Recovery)                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

5a. System sends escalation email (automatically after 0 minutes):
    Subject: "SaveHub: Meeting may have been missed"
    Body: "We're here to help you recover quickly..."

5b. System sends escalation SMS (automatically after 2 minutes):
    "You might have missed a meeting. If this was intentional, please confirm."

5c. System initiates auto-call (automatically after 5 minutes):
    "This is SaveHub checking in. A meeting may have been missed..."


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: User Acknowledges Incident                                              │
└─────────────────────────────────────────────────────────────────────────────────┘

curl -X POST http://localhost:3000/incidents/INCIDENT_UUID/acknowledge

Expected Response:
{
  "success": true,
  "incident": {
    "id": "incident-uuid",
    "state": "ACKNOWLEDGED",
    ...
  }
}


┌─────────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: User Resolves Incident                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

curl -X POST http://localhost:3000/incidents/INCIDENT_UUID/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "resolution_note": "Rescheduled meeting with team. Will attend next one."
  }'

Expected Response:
{
  "success": true,
  "incident": {
    "state": "RESOLVED",
    "resolved_at": "2025-12-23T12:30:00.000Z",
    "resolution_note": "Rescheduled meeting with team...",
    ...
  }
}

System Actions:
✓ Stop all escalation steps
✓ Mark incident RESOLVED
✓ Full audit trail recorded


═══════════════════════════════════════════════════════════════════════════════════
SECTION 7: DATA STRUCTURES & RESPONSE FORMATS
═══════════════════════════════════════════════════════════════════════════════════

EVENT OBJECT (from calendar sync):
{
  "event_id": "UUID",
  "calendar_event_id": "google-event-id",
  "title": "Meeting Title",
  "alerts_scheduled": 1,
  "incident_created": false,
  "reason": "string explaining the decision"
}

ALERT OBJECT:
{
  "id": "UUID",
  "user_id": "UUID",
  "event_id": "UUID",
  "category": "MEETING",
  "alert_type": "MEETING_UPCOMING_EMAIL | MEETING_URGENT_MESSAGE | MEETING_CRITICAL_CALL",
  "scheduled_at": "2025-12-23T12:00:00.000Z",
  "delivered_at": null,
  "status": "PENDING | DELIVERED | CANCELLED",
  "created_at": "2025-12-23T12:00:00.000Z"
}

INCIDENT OBJECT:
{
  "id": "UUID",
  "user_id": "UUID",
  "event_id": "UUID",
  "category": "MEETING",
  "type": "MISSED_MEETING",
  "severity": "HIGH",
  "state": "OPEN | ACKNOWLEDGED | ESCALATING | RESOLVED",
  "description": "string",
  "escalation_count": 0,
  "resolved_at": null,
  "resolution_note": null,
  "created_at": "2025-12-23T12:00:00.000Z",
  "updated_at": "2025-12-23T12:00:00.000Z"
}

CHECKIN OBJECT:
{
  "id": "UUID",
  "user_id": "UUID",
  "event_id": "UUID",
  "status": "JOINED | MISSED",
  "confirmed_at": "2025-12-23T12:30:00.000Z",
  "confirmation_source": "API | AUTO_CALL | MANUAL_SMS",
  "created_at": "2025-12-23T12:30:00.000Z"
}

ESCALATION_STEP OBJECT:
{
  "id": "UUID",
  "incident_id": "UUID",
  "user_id": "UUID",
  "step_number": 1,
  "step_type": "EMAIL | SMS | CALL",
  "scheduled_at": "2025-12-23T12:30:00.000Z",
  "executed_at": "2025-12-23T12:30:15.000Z",
  "status": "PENDING | EXECUTED | FAILED | SKIPPED",
  "error_message": null,
  "created_at": "2025-12-23T12:30:00.000Z"
}


═══════════════════════════════════════════════════════════════════════════════════
SECTION 8: ERROR CODES & STATUS MEANINGS
═══════════════════════════════════════════════════════════════════════════════════

HTTP Status Codes:

200 OK
├─ Request succeeded
├─ Resource returned/updated/created
└─ Use for GET/POST/PUT that succeed

201 Created
├─ Resource created successfully
└─ Primarily for POST endpoints creating resources

400 Bad Request
├─ Invalid input validation failed
├─ Missing required fields
├─ Malformed JSON
└─ Invalid UUID format

404 Not Found
├─ Resource doesn't exist
├─ User not found
├─ Event not found
└─ Incident not found

409 Conflict
├─ Invalid state transition (e.g., ACKNOWLEDGED → ACKNOWLEDGED)
├─ OAuth not connected
├─ Token expired
└─ Duplicate resource creation attempt

500 Internal Server Error
├─ Unexpected server error
├─ Database connection failed
├─ Service error
└─ Stack trace provided in development


═══════════════════════════════════════════════════════════════════════════════════
SECTION 9: FEATURE FLAGS (Configuration)
═══════════════════════════════════════════════════════════════════════════════════

Set in .env file:

FEATURE_CALENDAR_ENABLED=true
├─ Enable/disable calendar sync endpoints
└─ Required for PHASE A scheduler to run

FEATURE_SCHEDULER_ENABLED=true
├─ Enable/disable 1-minute cron scheduler
├─ When disabled: manual sync only
└─ Required for production

FEATURE_EMAIL=true
├─ Enable email alerts
└─ Required for PHASE B Stage 1

FEATURE_WHATSAPP=true
├─ Enable WhatsApp/SMS alerts
└─ Required for PHASE B Stage 2

FEATURE_CALL=true
├─ Enable auto-call alerts
└─ Required for PHASE B Stage 3 (CRITICAL)


═══════════════════════════════════════════════════════════════════════════════════
SECTION 10: TESTING CHECKLIST
═══════════════════════════════════════════════════════════════════════════════════

Complete Product Flow Testing:

□ 1. Health Check
   curl http://localhost:3000/health
   Expected: 200 OK, db: connected

□ 2. Google OAuth Setup
   Visit: http://localhost:3000/auth/google
   Expected: Redirects to Google login

□ 3. Calendar Sync (Manual)
   POST /calendar/sync with valid userId
   Expected: 200 OK, eventsProcessed >= 0

□ 4. Meeting Joined (Happy Path)
   POST /meetings/:eventId/checkin with status=JOINED
   Expected: 200 OK, alerts cancelled

□ 5. Meeting Missed (Recovery Path)
   POST /meetings/:eventId/checkin with status=MISSED
   Expected: 200 OK, incident created

□ 6. Incident Acknowledge
   POST /incidents/:id/acknowledge
   Expected: 200 OK, state=ACKNOWLEDGED

□ 7. Incident Escalate
   POST /incidents/:id/escalate
   Expected: 200 OK, state=ESCALATING

□ 8. Incident Resolve
   POST /incidents/:id/resolve with resolution_note
   Expected: 200 OK, state=RESOLVED

□ 9. Escalation Ladder Execution
   Check database for escalation_steps with:
   - step_type: EMAIL, SMS, CALL
   - status: PENDING → EXECUTED
   - scheduled_at times correct

□ 10. Token Refresh
    Leave session 1+ hours
    Run sync again
    Expected: Token refreshed, sync succeeds


═══════════════════════════════════════════════════════════════════════════════════
SECTION 11: DEBUGGING TIPS
═══════════════════════════════════════════════════════════════════════════════════

Enable detailed logging:
NODE_ENV=development node server.js

Look for these log prefixes:
[SERVER]           - Server startup/shutdown
[SCHEDULER]        - PHASE A calendar scheduler
[CALENDAR_API]     - Calendar sync endpoint
[RULE_ENGINE]      - PHASE B alert rules
[CHECKIN]          - PHASE C manual confirmation
[ESCALATION_ENGINE] - PHASE D missed detection
[ESCALATION_EXECUTOR] - PHASE D escalation execution
[CALL]             - Auto-call service
[TOKEN]            - OAuth token refresh

Check database state:
psql -U postgres -h localhost -d postgres
SELECT * FROM events ORDER BY created_at DESC LIMIT 5;
SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5;
SELECT * FROM incidents ORDER BY created_at DESC LIMIT 5;
SELECT * FROM meeting_checkins ORDER BY created_at DESC LIMIT 5;
SELECT * FROM escalation_steps ORDER BY created_at DESC LIMIT 5;


═══════════════════════════════════════════════════════════════════════════════════
SECTION 12: COMMON ERRORS & SOLUTIONS
═══════════════════════════════════════════════════════════════════════════════════

Error: "OAUTH_NOT_CONNECTED"
├─ Cause: User hasn't authenticated with Google
├─ Solution: Visit /auth/google to authenticate
└─ Status: 409 Conflict

Error: "OAUTH_TOKEN_EXPIRED"
├─ Cause: Access token expired
├─ Solution: System auto-refreshes using refresh_token
├─ If fails: Re-authenticate via /auth/google
└─ Status: 409 Conflict

Error: "Invalid state transition"
├─ Cause: Tried to transition incident to same state
├─ Example: ACKNOWLEDGED → ACKNOWLEDGED
├─ Solution: Check current state, use valid transition
└─ Status: 409 Conflict

Error: "Event not found"
├─ Cause: EventId doesn't exist or wrong userId
├─ Solution: Verify eventId from calendar sync response
└─ Status: 404 Not Found

Error: "userId and eventId are required"
├─ Cause: Missing required fields in request
├─ Solution: Include both userId and eventId
└─ Status: 400 Bad Request

Error: "status must be JOINED or MISSED"
├─ Cause: Invalid status value
├─ Solution: Use only "JOINED" or "MISSED"
└─ Status: 400 Bad Request

═══════════════════════════════════════════════════════════════════════════════════
END OF API REFERENCE GUIDE
═══════════════════════════════════════════════════════════════════════════════════
