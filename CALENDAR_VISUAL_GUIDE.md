# Calendar Sync API — Visual Guide & Examples

## 🎯 What It Does (Visual)

```
┌─────────────────────────────────────────────────────────────┐
│                   POST /calendar/sync                       │
│                     (DEV-ONLY)                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                    Input: { userId }
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 1: Validate Feature Flag           │
        │ FEATURE_CALENDAR_ENABLED === 'true'?    │
        └────────────────────┬────────────────────┘
                             │
                       ✓ Pass → Continue
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 2: Validate userId UUID            │
        │ Format: 550e8400-e29b-41d4-a716-...     │
        └────────────────────┬────────────────────┘
                             │
                       ✓ Valid → Continue
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 3: Call CalendarService            │
        │ syncMeetings(userId)                    │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 4: Fetch Google Calendar Events    │
        │ - Parse attendees, times, titles        │
        │ - Filter cancelled, all-day events      │
        │ - Normalize timezones                   │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 5: Check Idempotency               │
        │ Already synced this calendar event?     │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 6: Create EVENTS Record            │
        │ - Insert into events table              │
        │ - Store calendar_event_id mapping       │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 7: Invoke RuleEngine               │
        │ evaluateEvent(event)                    │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 8: Rule Engine Decides             │
        │ - Keywords matched?                     │
        │ - Create INCIDENTS?                     │
        │ - Schedule ALERTS?                      │
        │ - Send EMAILS?                          │
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │ Step 9: Return Response                 │
        │ { success, userId, eventsProcessed,    │
        │   eventsSkipped, ruleDecisions }        │
        └────────────────────┬────────────────────┘
                             │
                    Output: 200 OK
                    (or error code)
```

---

## 📊 Example Workflows

### Workflow 1: Complete Success Path

```
Timeline: Developer triggers sync → Events created → Rules evaluated → Alerts sent

┌────────────────────────────────────────────────────────────────┐
│ SETUP                                                          │
├────────────────────────────────────────────────────────────────┤
│ ✅ OAuth completed for user: 550e8400-e29b-41d4-a716-446655   │
│ ✅ Google Calendar has meetings:                               │
│    - "Emergency Standup" (2024-12-21 10:00)                   │
│    - "Production Incident Call" (2024-12-21 15:00)            │
│ ✅ Rules enabled for "incident" keyword                        │
│ ✅ Alerts configured for "Production" meetings                 │
└────────────────────────────────────────────────────────────────┘

Step 1: Developer makes request
───────────────────────────────
  curl -X POST http://localhost:3000/calendar/sync \
    -H "Content-Type: application/json" \
    -d '{"userId": "550e8400-e29b-41d4-a716-446655"}'

Step 2: Server validates
───────────────────────
  ✅ FEATURE_CALENDAR_ENABLED = 'true'
  ✅ userId is valid UUID
  ✅ [CALENDAR_API] Sync requested for user 550e8400-...

Step 3: CalendarService fetches meetings
─────────────────────────────────────────
  GET events from Google Calendar API
  Found 2 meetings
  ✅ Emergency Standup → normalized
  ✅ Production Incident Call → normalized

Step 4: Create EVENTS records
─────────────────────────────
  INSERT INTO events (user_id, source, category, type, payload)
    VALUES ('550e8400-...', 'CALENDAR', 'MEETING', 'MEETING_SCHEDULED', ...)
  ✅ Event 1 created: abc12345-...
  ✅ Event 2 created: def67890-...

Step 5: RuleEngine evaluates
────────────────────────────
  Event 1 (Emergency Standup):
    Keywords: ['emergency', 'standup']
    Rule 1 (incident): NOT matched
    Decision: No incident, but schedule reminder alert
    ✅ ALERT created (type: REMINDER)

  Event 2 (Production Incident Call):
    Keywords: ['production', 'incident', 'call']
    Rule 1 (incident): MATCHED! ✅
    Rule 2 (critical): MATCHED! ✅
    Decision: Create INCIDENT + schedule alerts
    ✅ INCIDENT created (severity: HIGH)
    ✅ ALERT created (type: CRITICAL_ESCALATION)
    ✅ EMAIL queued to escalation team

Step 6: Response sent to developer
──────────────────────────────────
  HTTP 200 OK
  {
    "success": true,
    "userId": "550e8400-e29b-41d4-a716-446655",
    "eventsProcessed": 2,
    "eventsSkipped": 0,
    "message": "Calendar sync completed",
    "ruleDecisions": [
      {
        "event_id": "abc12345-...",
        "title": "Emergency Standup",
        "alerts_scheduled": 1,
        "incident_created": false,
        "reason": "No rules matched, reminder alert scheduled"
      },
      {
        "event_id": "def67890-...",
        "title": "Production Incident Call",
        "alerts_scheduled": 2,
        "incident_created": true,
        "reason": "Keywords matched: incident, production"
      }
    ]
  }

Step 7: Background systems run
──────────────────────────────
  ✅ [ALERTS] Alert 1 scheduled for 9:50 AM (10 min before meeting)
  ✅ [ALERTS] Alert 2 scheduled for 14:45 (15 min before meeting)
  ✅ [ESCALATION] Escalation scheduler notified of new incident
  ✅ [EMAIL] Email sent to on-call team: "Production incident detected"
  ✅ [DATABASE] All records committed

Step 8: Developer verifies results
──────────────────────────────────
  curl http://localhost:3000/incidents | jq '.incidents[-2:]'
  → Shows 2 new incidents (or 1 if rules created only 1)

  SELECT COUNT(*) FROM events WHERE user_id = '550e8400-...';
  → 2 new events

  SELECT COUNT(*) FROM alerts WHERE incident_id IS NOT NULL;
  → Shows alerts linked to incidents

✅ E2E TEST PASSED
```

### Workflow 2: No New Meetings

```
┌────────────────────────────────────────────────────────────────┐
│ SETUP                                                          │
├────────────────────────────────────────────────────────────────┤
│ ✅ OAuth completed                                              │
│ ⚠️ No new meetings created in Google Calendar                   │
│ ⚠️ Previous sync already processed existing meetings             │
└────────────────────────────────────────────────────────────────┘

Request:
────────
  curl -X POST http://localhost:3000/calendar/sync ...

Response (200 OK):
──────────────────
  {
    "success": true,
    "userId": "550e8400-...",
    "eventsProcessed": 0,
    "eventsSkipped": 2,         ← Already synced
    "message": "Calendar sync completed",
    "ruleDecisions": []         ← No decisions (no new events)
  }

Interpretation:
───────────────
  ✅ Sync completed successfully
  ✅ No errors
  ✅ No new events (idempotency working)
  ✅ Nothing new to process
```

### Workflow 3: Feature Disabled

```
┌────────────────────────────────────────────────────────────────┐
│ SETUP                                                          │
├────────────────────────────────────────────────────────────────┤
│ ⚠️ FEATURE_CALENDAR_ENABLED=false in .env                        │
│ ⚠️ Server restarted                                              │
└────────────────────────────────────────────────────────────────┘

Request:
────────
  curl -X POST http://localhost:3000/calendar/sync \
    -H "Content-Type: application/json" \
    -d '{"userId": "550e8400-..."}'

Response (403 Forbidden):
─────────────────────────
  {
    "error": "Forbidden",
    "message": "Calendar integration is disabled",
    "feature": "FEATURE_CALENDAR_ENABLED"
  }

Interpretation:
───────────────
  ⚠️ Endpoint is disabled (kill switch active)
  ⚠️ No calendar operations performed
  ⚠️ To enable: set FEATURE_CALENDAR_ENABLED=true + restart

Action:
──────
  Dev: "Hmm, calendar is disabled. Let me check .env"
  Dev: "Ah, FEATURE_CALENDAR_ENABLED=false. Let me enable it."
  Dev: Updates .env → Restarts server → Tries again → ✅ Works
```

### Workflow 4: OAuth Not Connected

```
┌────────────────────────────────────────────────────────────────┐
│ SETUP                                                          │
├────────────────────────────────────────────────────────────────┤
│ ⚠️ Using new user UUID                                          │
│ ⚠️ User never completed OAuth                                   │
│ ⚠️ No credentials in database                                   │
└────────────────────────────────────────────────────────────────┘

Request:
────────
  curl -X POST http://localhost:3000/calendar/sync \
    -H "Content-Type: application/json" \
    -d '{"userId": "00000000-0000-0000-0000-000000000000"}'

Response (409 Conflict):
────────────────────────
  {
    "error": "Conflict",
    "message": "Google Calendar not connected for user 00000000-...",
    "reason": "OAUTH_NOT_CONNECTED"
  }

Interpretation:
───────────────
  ⚠️ User has not authorized Google Calendar access
  ⚠️ No credentials to fetch calendar events
  ⚠️ Must complete OAuth first

Action:
──────
  Dev: "Let me complete OAuth for this user"
  Dev: Visit http://localhost:3000/auth/google
  Dev: Click "Google Sign In"
  Dev: Grant Google Calendar permissions
  Dev: ✅ Credentials saved
  Dev: Try sync again → ✅ Works now
```

---

## 🔄 Data Flow Diagram

```
┌─────────────────────┐
│   HTTP Request      │
│ POST /calendar/sync │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│  calendarRoutes.js           │
│ ─────────────────────────────│
│ • Validate feature flag      │
│ • Validate UUID              │
│ • Log request                │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  CalendarService             │
│ ─────────────────────────────│
│ syncMeetings(userId)         │
└──────────┬───────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌──────────────────┐
│ Google │  │ Database         │
│ Calendar│  │ ──────────────── │
│ API    │  │ • Get OAuth creds│
│        │  │ • Check idempotency
└────┬───┘  └────────┬─────────┘
     │               │
     ▼               │
┌──────────────────────────────┐
│  Normalize Meetings          │
│  ─────────────────────────── │
│  • Parse JSON                │
│  • Filter cancelled/all-day  │
│  • Normalize timezones       │
│  • Extract keywords          │
└──────────┬───────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌──────────┐  ┌──────────────────┐
│ Create   │  │ Database         │
│ EVENTS   │  │ ──────────────── │
│ Records  │  │ INSERT events    │
│          │  │ INSERT mappings  │
└────┬─────┘  └──────────────────┘
     │
     ▼
┌──────────────────────────────┐
│  RuleEngine                  │
│ ─────────────────────────────│
│ evaluateEvent(event)         │
│  • Check keywords            │
│  • Match rules               │
│  • Decide alerts/incidents   │
└──────────┬───────────────────┘
           │
    ┌──────┼──────┐
    │      │      │
    ▼      ▼      ▼
┌────┐ ┌────┐ ┌──────┐
│ALERT│ │INC│ │EMAIL │
│     │ │   │ │ QUEUE│
└──┬──┘ └──┬┘ └───┬──┘
   │      │       │
   └──────┼───────┘
          │
          ▼
    ┌─────────────┐
    │ Database    │
    │ (Alerts,    │
    │  Incidents, │
    │  Emails)    │
    └──────┬──────┘
           │
           ▼
┌──────────────────────────────┐
│  HTTP Response (200)         │
│ ─────────────────────────────│
│ {                            │
│   success: true,             │
│   eventsProcessed: 2,        │
│   ruleDecisions: [...]       │
│ }                            │
└──────────────────────────────┘
```

---

## 📈 Response Codes at a Glance

```
200 ✅ Success
    └─ Events synced, rules evaluated, responses returned

400 ❌ Bad Request
    ├─ Missing userId
    └─ Invalid UUID format

403 ❌ Forbidden
    └─ FEATURE_CALENDAR_ENABLED !== 'true'

409 ❌ Conflict
    ├─ OAuth not connected
    └─ OAuth token expired

500 ❌ Server Error
    └─ Database, network, or other unexpected error
```

---

## 🧪 Testing in Postman

### Collection Setup

```json
{
  "info": {
    "name": "Calendar Sync API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Sync Calendar (Success)",
      "request": {
        "method": "POST",
        "url": {
          "raw": "http://localhost:3000/calendar/sync",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["calendar", "sync"]
        },
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"userId\": \"550e8400-e29b-41d4-a716-446655440000\"}"
        }
      }
    },
    {
      "name": "Test Invalid UUID",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/calendar/sync",
        "body": {
          "mode": "raw",
          "raw": "{\"userId\": \"not-a-uuid\"}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": ["pm.expect(pm.response.code).to.equal(400);"]
          }
        }
      ]
    },
    {
      "name": "Test Feature Disabled",
      "request": {
        "method": "POST",
        "url": "http://localhost:3000/calendar/sync",
        "body": {
          "mode": "raw",
          "raw": "{\"userId\": \"550e8400-e29b-41d4-a716-446655440000\"}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "// Assuming FEATURE_CALENDAR_ENABLED=false",
              "pm.expect(pm.response.code).to.equal(403);"
            ]
          }
        }
      ]
    }
  ]
}
```

---

## 🔐 Security Model

```
┌────────────────────────────────────────────────┐
│      DEV-ONLY SECURITY                         │
├────────────────────────────────────────────────┤
│                                                │
│  Layer 1: Feature Flag                         │
│  ─────────────────────────                     │
│  ✅ FEATURE_CALENDAR_ENABLED check             │
│  ✅ Kill switch in production                  │
│  ✅ Can disable in seconds                     │
│                                                │
│  Layer 2: UUID Validation                      │
│  ──────────────────────────                    │
│  ✅ Must be valid UUID format                  │
│  ✅ Prevents injection/random IDs              │
│  ✅ 400 error on invalid format                │
│                                                │
│  Layer 3: Existing User Check                  │
│  ────────────────────────────────              │
│  ✅ OAuth flow validates user exists           │
│  ✅ CalendarService checks credentials         │
│  ✅ 409 error if OAuth missing                 │
│                                                │
│  Layer 4: Safe Logging                         │
│  ──────────────────────                        │
│  ✅ No tokens logged                           │
│  ✅ No sensitive data in responses             │
│  ✅ Minimal logging (prod-safe)                │
│                                                │
│  Layer 5: Thin Controller                      │
│  ──────────────────────────                    │
│  ✅ No business logic                          │
│  ✅ Delegates to trusted services              │
│  ✅ CalendarService owns the risk              │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 🎯 Key Takeaways

1. **Single Purpose**: Manually trigger calendar sync (DEV-ONLY)
2. **Feature Flagged**: Can be disabled instantly
3. **Safe Validation**: UUID check prevents misuse
4. **Minimal Code**: 131 lines (thin controller)
5. **Delegates Work**: Calls existing CalendarService
6. **Rule Engine Decides**: Endpoint doesn't create incidents
7. **Comprehensive Docs**: 4 documentation files
8. **Ready for Production**: Can be removed/replaced easily

---

**Ready to test?** 🚀

```bash
npm run dev
```

Then:

```bash
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-uuid-here"}'
```

---

Last Updated: December 20, 2025
