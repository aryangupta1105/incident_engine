╔════════════════════════════════════════════════════════════════════════════════╗
║                      SAVEHUB ARCHITECTURE DIAGRAM                               ║
║              Complete Meeting Enforcement Pipeline (A→B→C→D)                    ║
╚════════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════════
SYSTEM ARCHITECTURE OVERVIEW
═══════════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SYSTEMS                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Google Calendar  │  │  Email Service   │  │ Twilio SMS/Call  │              │
│  │                  │  │  (SMTP)          │  │  Provider        │              │
│  │  - Fetch Events  │  │                  │  │                  │              │
│  │  - Get Attendees │  │  - Email Alerts  │  │  - SMS Messages  │              │
│  │  - Check Status  │  │  - Escalations   │  │  - Phone Calls   │              │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘              │
│           │                     │                      │                        │
│           └─────────────────────┼──────────────────────┘                        │
│                                 │                                               │
└─────────────────────────────────┼───────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          SAVEHUB BACKEND (Node.js)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  API LAYER (Express.js)                                                   │ │
│  │                                                                           │ │
│  │  GET  /health                          - Health check                     │ │
│  │  GET  /auth/google                     - OAuth flow                       │ │
│  │  POST /calendar/sync        [PHASE A]  - Calendar sync trigger            │ │
│  │  POST /meetings/:id/checkin [PHASE C]  - Meeting confirmation             │ │
│  │  POST /incidents/:id/acknowledge       - Incident management              │ │
│  │  POST /incidents/:id/escalate          - Escalation                       │ │
│  │  POST /incidents/:id/resolve           - Resolution                       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                  │                                              │
│                                  ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  SERVICE LAYER                                                            │ │
│  │                                                                           │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PHASE A: CALENDAR SCHEDULER (runs every 1 minute)               │   │ │
│  │  │  • calendarScheduler.js                                         │   │ │
│  │  │  • googleOAuth.js (token refresh)                               │   │ │
│  │  │  • calendarService.js (fetch & normalize events)                │   │ │
│  │  │  • eventService.js (create event records)                       │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                           │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PHASE B: MULTI-STAGE ALERTS (triggered by Phase A)              │   │ │
│  │  │  • ruleEngine.js (evaluate: schedule alerts?)                   │   │ │
│  │  │  • alertService.js (schedule 3 stages):                         │   │ │
│  │  │    ├─ Stage 1: Email at 12 min                                  │   │ │
│  │  │    ├─ Stage 2: SMS at 5 min                                     │   │ │
│  │  │    └─ Stage 3: Call at 2 min (CRITICAL)                         │   │ │
│  │  │  • autoCallService.js (Twilio integration)                      │   │ │
│  │  │  • alertDeliveryWorker.js (polling delivery)                    │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                           │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PHASE C: MANUAL CONFIRMATION (user action)                      │   │ │
│  │  │  • meetingRoutes.js (/meetings/:id/checkin)                     │   │ │
│  │  │  • Status options: JOINED or MISSED                             │   │ │
│  │  │  • If JOINED:                                                   │   │ │
│  │  │    ├─ Cancel all PENDING alerts                                 │   │ │
│  │  │    ├─ Resolve incidents                                         │   │ │
│  │  │    └─ End enforcement                                           │   │ │
│  │  │  • If MISSED:                                                   │   │ │
│  │  │    ├─ Create INCIDENT                                           │   │ │
│  │  │    └─ Schedule escalation ladder                                │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                           │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ PHASE D: ESCALATION LADDER (auto recovery)                      │   │ │
│  │  │  • escalationService.js (create incident + steps)               │   │ │
│  │  │  • escalationWorker.js (execute steps):                         │   │ │
│  │  │    ├─ +0 min: Email escalation                                  │   │ │
│  │  │    ├─ +2 min: SMS escalation                                    │   │ │
│  │  │    └─ +5 min: Call escalation                                   │   │ │
│  │  │  • incidentService.js (state machine):                          │   │ │
│  │  │    ├─ OPEN → ACKNOWLEDGED                                       │   │ │
│  │  │    ├─ ACKNOWLEDGED → ESCALATING                                 │   │ │
│  │  │    └─ Any → RESOLVED                                            │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                  │                                              │
│                                  ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  DATA LAYER (PostgreSQL)                                                  │ │
│  │                                                                           │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │ │
│  │  │ USERS          │  │ EVENTS         │  │ ALERTS         │            │ │
│  │  │                │  │                │  │                │            │ │
│  │  │ • id (UUID)    │  │ • id (UUID)    │  │ • id (UUID)    │            │ │
│  │  │ • email        │  │ • title        │  │ • alert_type   │            │ │
│  │  │ • oauth_tokens │  │ • start_time   │  │ • status       │            │ │
│  │  │                │  │ • user_id      │  │ • scheduled_at │            │ │
│  │  └────────────────┘  │ • status       │  │ • delivered_at │            │ │
│  │                      └────────────────┘  └────────────────┘            │ │
│  │                                                                           │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │ │
│  │  │ INCIDENTS      │  │ MEETING_CHECKINS
   │  │ ESCALATION_STEPS
   │            │ │
│  │  │                │  │                │  │                │            │ │
│  │  │ • id (UUID)    │  │ • id (UUID)    │  │ • id (UUID)    │            │ │
│  │  │ • user_id      │  │ • event_id     │  │ • incident_id  │            │ │
│  │  │ • event_id     │  │ • status       │  │ • step_type    │            │ │
│  │  │ • state        │  │ • confirmed_at │  │ • status       │            │ │
│  │  │ • severity     │  │                │  │ • scheduled_at │            │ │
│  │  │                │  │                │  │ • executed_at  │            │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘            │ │
│  │                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════════
API ENDPOINT MAPPING
═══════════════════════════════════════════════════════════════════════════════════

USER JOURNEY FLOW:

┌──────────────┐
│ START: User  │
└──────┬───────┘
       │
       ▼ (one-time)
┌─────────────────────────────────────────────────────┐
│ GET /auth/google                                    │
│ → Authenticates with Google                         │
│ → Stores OAuth tokens                               │
│ → User created in database                          │
└──────────────┬──────────────────────────────────────┘
               │
               ▼ (runs every 1 minute automatically)
┌─────────────────────────────────────────────────────┐
│ [PHASE A] POST /calendar/sync                       │
│ → Fetches events from Google Calendar API           │
│ → Creates MEETING events                            │
│ → Passes to rule engine                             │
└──────────────┬──────────────────────────────────────┘
               │
               ▼ (automatic)
┌─────────────────────────────────────────────────────┐
│ [PHASE B] Alert Scheduling (internal service call) │
│ → Email alert at 12 min before                      │
│ → SMS alert at 5 min before                         │
│ → Call alert at 2 min before (CRITICAL)             │
└──────────────┬──────────────────────────────────────┘
               │
               ▼ (after meeting)
         ┌─────┴─────┐
         │           │
         ▼           ▼
    ┌────────┐   ┌─────────────────────────────────────────┐
    │ JOINED │   │ [PHASE C] POST /meetings/:id/checkin    │
    │(happy) │   │           with status=MISSED            │
    └───┬────┘   │ → Creates INCIDENT (severity: HIGH)     │
        │        │ → Schedules escalation ladder           │
        │        └──────────────┬────────────────────────────┘
        │                       │
        │                       ▼
        │        ┌────────────────────────────────────────┐
        │        │ [PHASE D] Escalation Ladder Executes   │
        │        │                                        │
        │        │ +0 min: Email escalation               │
        │        │ +2 min: SMS escalation                 │
        │        │ +5 min: Call escalation                │
        │        └──────────┬─────────────────────────────┘
        │                   │
        │                   ▼
        │        ┌────────────────────────────────────────┐
        │        │ User receives escalation communications │
        │        │ and manages incident:                   │
        │        │                                        │
        │        │ Manage Incident:                       │
        │        │ POST /incidents/:id/acknowledge        │
        │        │ POST /incidents/:id/escalate           │
        │        │ POST /incidents/:id/resolve            │
        │        └──────────┬─────────────────────────────┘
        │                   │
        └───────┬───────────┘
                │
                ▼
        ┌───────────────────┐
        │ END: Resolution   │
        │ Workflow Complete │
        └───────────────────┘


═══════════════════════════════════════════════════════════════════════════════════
DATA FLOW: MEETING TO ESCALATION
═══════════════════════════════════════════════════════════════════════════════════

Timeline for a meeting scheduled at 14:00:

    TIME    │ EVENT                          │ API ENDPOINT / SYSTEM ACTION
    ────────┼────────────────────────────────┼─────────────────────────────
    13:59   │ PHASE A runs                   │ POST /calendar/sync (internal)
            │ Sync fetches from Google       │
            │ Event created (status=OPEN)   │
    ────────┼────────────────────────────────┼─────────────────────────────
    13:48   │ PHASE B Stage 1                │ Email alert sent
            │ (12 min before)                │ Status: DELIVERED
    ────────┼────────────────────────────────┼─────────────────────────────
    13:55   │ PHASE B Stage 2                │ SMS alert sent
            │ (5 min before)                 │ Status: DELIVERED
    ────────┼────────────────────────────────┼─────────────────────────────
    13:58   │ PHASE B Stage 3 (CRITICAL)     │ Auto-call placed
            │ (2 min before)                 │ Status: DELIVERED
    ────────┼────────────────────────────────┼─────────────────────────────
    14:00   │ Meeting STARTS                 │ (no API call)
    ────────┼────────────────────────────────┼─────────────────────────────
    14:02   │ SCENARIO A: User Joins         │ POST /meetings/EVENT_UUID/
            │                                │ checkin (status=JOINED)
            │                                │ → Alerts cancelled
            │                                │ → Incident resolved
            │                                │ → Workflow ends
    ────────┼────────────────────────────────┼─────────────────────────────
    14:05   │ Meeting ENDS                   │ (no API call)
    ────────┼────────────────────────────────┼─────────────────────────────
    14:10   │ SCENARIO B: User Missed        │ POST /meetings/EVENT_UUID/
            │ [OR auto-detected after        │ checkin (status=MISSED)
            │  5-min grace period]           │ → Incident created
            │                                │ → Escalation steps scheduled
    ────────┼────────────────────────────────┼─────────────────────────────
    14:10   │ PHASE D Step 1: Email          │ Email escalation sent
            │                                │ Status: EXECUTED
    ────────┼────────────────────────────────┼─────────────────────────────
    14:12   │ PHASE D Step 2: SMS            │ SMS escalation sent
            │                                │ Status: EXECUTED
    ────────┼────────────────────────────────┼─────────────────────────────
    14:15   │ PHASE D Step 3: Call           │ Auto-call placed
            │                                │ Status: EXECUTED
    ────────┼────────────────────────────────┼─────────────────────────────
    14:16   │ User Acknowledges              │ POST /incidents/INCIDENT_UUID/
            │                                │ acknowledge
            │                                │ State: OPEN → ACKNOWLEDGED
    ────────┼────────────────────────────────┼─────────────────────────────
    14:18   │ User Resolves                  │ POST /incidents/INCIDENT_UUID/
            │                                │ resolve (with resolution note)
            │                                │ State: → RESOLVED
            │                                │ Escalation stops
    ────────┴────────────────────────────────┴─────────────────────────────


═══════════════════════════════════════════════════════════════════════════════════
STATE MACHINES
═══════════════════════════════════════════════════════════════════════════════════

INCIDENT STATE MACHINE:
────────────────────────

                    ┌──────────┐
                    │   OPEN   │
                    └─────┬────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │acknowledge() │  │escalate()    │  │resolve()     │
    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ACKNOWLEDGED  │  │ESCALATING    │  │ RESOLVED     │
    └──────┬───────┘  └──────┬───────┘  └──────────────┘
           │                 │
           ▼                 ▼
      escalate()      (auto on manual escalate)
           │
           └─────────┬──────────────────────┐
                     │                      │
                     ▼                      ▼
              ┌──────────────┐       ┌──────────────┐
              │ ESCALATING   │       │ RESOLVED     │
              │ (high prio)  │       │ (end state)  │
              └──────┬───────┘       └──────────────┘
                     │
                     ▼
                resolve()
                     │
                     ▼
              ┌──────────────┐
              │ RESOLVED     │
              │ (end state)  │
              └──────────────┘


ALERT STATUS MACHINE:
─────────────────────

    ┌─────────┐
    │ PENDING │
    └────┬────┘
         │
    ┌────┴─────────┬──────────────┐
    │              │              │
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌──────────┐
│DELIVERED
   │   │CANCELLED    │   │FAILED    │
└────────┘   └──────────┘   └──────────┘


═══════════════════════════════════════════════════════════════════════════════════
DATABASE RELATIONSHIPS
═══════════════════════════════════════════════════════════════════════════════════

users
  ├─ 1─────────∞ events (user_id)
  ├─ 1─────────∞ incidents (user_id)
  ├─ 1─────────∞ alerts (user_id)
  ├─ 1─────────∞ meeting_checkins (user_id)
  └─ 1─────────∞ escalation_steps (user_id)

events
  ├─ 1─────────∞ alerts (event_id)
  ├─ 1─────────∞ incidents (event_id)
  └─ 1─────────∞ meeting_checkins (event_id)

incidents
  ├─ 1─────────∞ escalation_steps (incident_id)
  └─ 1─────────∞ meeting_checkins (incident_id - optional)


═══════════════════════════════════════════════════════════════════════════════════
REQUEST FLOW SUMMARY
═══════════════════════════════════════════════════════════════════════════════════

Synchronous API Calls (Immediate Response):
├─ GET /health                      ✓ ~50ms
├─ GET /auth/google                 ✓ ~200ms (redirect)
├─ POST /calendar/sync              ✓ ~300-500ms (+ async operations)
├─ POST /meetings/:id/checkin       ✓ ~100ms (+ async operations)
├─ POST /incidents/:id/acknowledge  ✓ ~50ms
├─ POST /incidents/:id/escalate     ✓ ~50ms (+ async operations)
└─ POST /incidents/:id/resolve      ✓ ~50ms

Asynchronous Background Tasks:
├─ Calendar Scheduler               ✓ Every 1 minute (cron)
├─ Alert Delivery Worker            ✓ Every 10 seconds (polling)
├─ Escalation Executor              ✓ Every 30 seconds (polling)
└─ Token Refresh (on-demand)        ✓ Auto-retry with backoff


═══════════════════════════════════════════════════════════════════════════════════
INTEGRATION POINTS
═══════════════════════════════════════════════════════════════════════════════════

External Service Integrations:

Google Calendar API
├─ Endpoint: https://www.googleapis.com/calendar/v3/
├─ Used by: calendarService.js
├─ Purpose: Fetch upcoming events
├─ Auth: OAuth2 with refresh token
└─ Failure Mode: Return 409 OAUTH_TOKEN_EXPIRED

Email Service (SMTP)
├─ Config: SMTP_HOST, SMTP_USER, SMTP_PASSWORD
├─ Used by: alertService.js (Stage 1)
├─ Purpose: Send email alerts
├─ Schedule: 12 minutes before meeting
└─ Failure Mode: Log error, continue escalation

SMS Service (Twilio)
├─ Config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
├─ Used by: autoCallService.js (Stage 2)
├─ Purpose: Send SMS/WhatsApp messages
├─ Schedule: 5 minutes before meeting
└─ Failure Mode: Retry 3x, fallback to call

Call Service (Twilio)
├─ Config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
├─ Used by: autoCallService.js (Stage 3 - CRITICAL)
├─ Purpose: Auto-dial for confirmation
├─ Schedule: 2 minutes before meeting
└─ Failure Mode: Log error, mark as failed


═══════════════════════════════════════════════════════════════════════════════════
OPERATIONAL COMMANDS
═══════════════════════════════════════════════════════════════════════════════════

Start System:
  npm start

Check Health:
  curl http://localhost:3000/health

View Logs (Development):
  NODE_ENV=development npm start

Database Queries:
  psql -U postgres -h localhost -d postgres
  
  SELECT COUNT(*) FROM events;
  SELECT COUNT(*) FROM alerts WHERE status = 'PENDING';
  SELECT * FROM incidents WHERE state = 'OPEN';
  SELECT * FROM escalation_steps WHERE status = 'PENDING';

Test Calendar Sync:
  curl -X POST http://localhost:3000/calendar/sync \
    -d '{"userId": "YOUR_USER_UUID"}' \
    -H "Content-Type: application/json"

Test Meeting Checkin:
  curl -X POST http://localhost:3000/meetings/EVENT_UUID/checkin \
    -d '{"userId": "YOUR_USER_UUID", "status": "JOINED"}' \
    -H "Content-Type: application/json"


═══════════════════════════════════════════════════════════════════════════════════
FEATURE FLAGS
═══════════════════════════════════════════════════════════════════════════════════

Set in .env file:

FEATURE_CALENDAR_ENABLED=true    │ Enable calendar sync endpoint
FEATURE_SCHEDULER_ENABLED=true   │ Enable 1-minute cron scheduler  
FEATURE_EMAIL=true               │ Enable email alerts (Stage 1)
FEATURE_WHATSAPP=true            │ Enable SMS alerts (Stage 2)
FEATURE_CALL=true                │ Enable auto-call (Stage 3)


═══════════════════════════════════════════════════════════════════════════════════
COMPLETE API LIST
═══════════════════════════════════════════════════════════════════════════════════

1. GET /health
   Status: ✓ READY
   Purpose: System health check
   Response: {status, db, timestamp}

2. GET /auth/google
   Status: ✓ READY
   Purpose: Initiate Google OAuth
   Response: Redirect to Google login

3. GET /auth/google/callback
   Status: ✓ READY
   Purpose: Google OAuth callback
   Response: Store tokens, create user

4. POST /calendar/sync
   Status: ✓ READY
   Purpose: Sync calendar events (PHASE A)
   Request: {userId}
   Response: {success, eventsProcessed, eventsSkipped, ruleDecisions}

5. POST /meetings/:eventId/checkin
   Status: ✓ READY
   Purpose: Confirm meeting attendance (PHASE C)
   Request: {userId, status: "JOINED"|"MISSED"}
   Response: {success, checkinId, status, action}

6. POST /incidents/:id/acknowledge
   Status: ✓ READY
   Purpose: Acknowledge incident
   Response: {success, incident}

7. POST /incidents/:id/escalate
   Status: ✓ READY
   Purpose: Escalate incident
   Response: {success, incident}

8. POST /incidents/:id/resolve
   Status: ✓ READY
   Purpose: Resolve incident
   Request: {resolution_note}
   Response: {success, incident}

═══════════════════════════════════════════════════════════════════════════════════
END OF ARCHITECTURE DIAGRAM
═══════════════════════════════════════════════════════════════════════════════════
