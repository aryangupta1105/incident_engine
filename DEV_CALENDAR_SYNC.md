# DEV_CALENDAR_SYNC.md

## Overview

**Endpoint**: `POST /calendar/sync`

**Purpose**: Manually trigger Google Calendar ingestion for a user (DEV-ONLY).

This endpoint is a thin controller that:
1. Validates feature flag and userId
2. Calls `CalendarService.syncMeetings(userId)`
3. Lets the RuleEngine decide alerts/incidents
4. Returns event count + outcomes

---

## Why This Endpoint?

### Problem Statement
- E2E testing requires triggering calendar sync without waiting for cron jobs
- Developers need to validate: OAuth → Calendar fetch → Event ingestion → Rule evaluation → Alert scheduling
- Cannot reliably test this flow without a manual trigger
- Cron jobs will be added later in production (this endpoint remains for dev/testing)

### Design Goals
- **Minimal**: Only 100 lines, no business logic
- **Safe**: Feature-flag protected, requires valid UUID
- **Isolated**: No auth layer, no incident creation, no escalation
- **Removable**: Can easily be switched to cron/worker in production
- **Debuggable**: Returns what CalendarService found (events_created, events_skipped, rule_decisions)

---

## Usage

### Prerequisites
1. OAuth must be completed for the user (Google Calendar connected)
2. User must exist in database
3. `FEATURE_CALENDAR_ENABLED=true` in `.env`

### Manual Trigger

```bash
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Response (Success)

```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "eventsProcessed": 3,
  "eventsSkipped": 0,
  "message": "Calendar sync completed",
  "ruleDecisions": [
    {
      "event_id": "event-uuid-1",
      "calendar_event_id": "google-event-id-1",
      "title": "Emergency Standup",
      "alerts_scheduled": 1,
      "incident_created": false,
      "reason": "Meeting scheduled, no incident needed"
    },
    {
      "event_id": "event-uuid-2",
      "calendar_event_id": "google-event-id-2",
      "title": "Production Incident Call",
      "alerts_scheduled": 2,
      "incident_created": true,
      "reason": "Keywords matched: 'incident', 'production'"
    }
  ]
}
```

### Responses (Errors)

**403 Forbidden** — Feature disabled
```json
{
  "error": "Forbidden",
  "message": "Calendar integration is disabled",
  "feature": "FEATURE_CALENDAR_ENABLED"
}
```

**400 Bad Request** — Missing userId
```json
{
  "error": "Bad Request",
  "message": "userId is required in request body"
}
```

**400 Bad Request** — Invalid UUID format
```json
{
  "error": "Bad Request",
  "message": "userId must be a valid UUID",
  "received": "not-a-uuid"
}
```

**409 Conflict** — OAuth not connected
```json
{
  "error": "Conflict",
  "message": "Google Calendar not connected for user 550e8400-e29b-41d4-a716-446655440000",
  "reason": "OAUTH_NOT_CONNECTED"
}
```

**409 Conflict** — Token expired
```json
{
  "error": "Conflict",
  "message": "Google Calendar token expired for user 550e8400-e29b-41d4-a716-446655440000. Please reconnect.",
  "reason": "OAUTH_TOKEN_EXPIRED"
}
```

**500 Internal Server Error** — Unexpected error
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

---

## How It Works

### Flow Diagram

```
POST /calendar/sync
│
├─ Check FEATURE_CALENDAR_ENABLED === 'true'
│  └─ If false → 403
│
├─ Validate userId is UUID
│  └─ If invalid → 400
│
├─ Call CalendarService.syncMeetings(userId)
│  └─ Fetch Google Calendar events for user
│  └─ Normalize meetings (filter cancelled, all-day)
│  └─ For each meeting:
│      ├─ Check if already synced (idempotency)
│      ├─ Create EVENTS record
│      ├─ Invoke RuleEngine
│      └─ Return decision (alerts/incidents)
│
├─ Handle errors
│  ├─ OAuth not connected → 409
│  ├─ Token expired → 409
│  └─ Other → 500
│
└─ Return 200 with event counts + rule decisions
```

### What Gets Created?

**EVENTS Table** (one row per meeting)
```
event_id (UUID)
user_id (UUID)
source: 'CALENDAR'
category: 'MEETING'
type: 'MEETING_SCHEDULED'
payload: { meeting details }
created_at: now
```

**Rule Engine Evaluation**
- Evaluates event against user's rules
- May schedule ALERTS
- May create INCIDENTS (if rules match)
- Returns decision summary

**No Direct Escalation**
- This endpoint does NOT escalate
- Escalation happens via scheduler (separate service)
- Rule engine may schedule alerts that trigger later

---

## Feature Flag Protection

### Why Required?

Feature flag provides:
1. **Kill switch** — Disable calendar in production instantly
2. **Gradual rollout** — Enable for subset of users
3. **Clear intent** — Signals calendar is optional feature
4. **Future compatibility** — Can migrate to cron without removing endpoint

### Check Status

```bash
# Check if enabled
echo $FEATURE_CALENDAR_ENABLED

# Should output: true
```

---

## Constraints & Design Decisions

### ✅ What This Endpoint Does
- Validates feature flag
- Validates userId UUID
- Calls existing CalendarService
- Returns clean JSON response
- Logs minimally

### ❌ What This Endpoint Does NOT Do
- Does NOT create incidents directly
- Does NOT escalate incidents
- Does NOT require authentication
- Does NOT hardcode API calls
- Does NOT add Redis/caching
- Does NOT add cron scheduling
- Does NOT generate random UUIDs

### Why?
- **Separation of concerns**: CalendarService handles fetching and normalizing
- **Rule engine owns decisions**: RuleEngine decides alerts/incidents
- **Thin controller**: Route is <100 lines, easy to remove or modify
- **Future-proof**: Can swap implementation (cron/worker) without changing interface

---

## Testing Scenarios

### Scenario 1: Successful Sync (Meetings Found)
```bash
# Step 1: User completes OAuth (already done)

# Step 2: User creates 2 meetings in Google Calendar
# - "Emergency Standup" (2024-12-21 10:00)
# - "Production Incident Call" (2024-12-21 15:00)

# Step 3: Trigger sync
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user-uuid>"}'

# Expected Response:
# {
#   "success": true,
#   "eventsProcessed": 2,
#   "eventsSkipped": 0,
#   ...
# }

# Step 4: Verify
# - EVENTS table has 2 new rows
# - ALERTS may be scheduled (check ALERTS table)
# - INCIDENTS may be created (check INCIDENTS table)
# - Emails sent (check email logs)
```

### Scenario 2: No New Meetings
```bash
# Step 1: Sync again immediately (no new meetings created)

curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user-uuid>"}'

# Expected Response:
# {
#   "success": true,
#   "eventsProcessed": 0,
#   "eventsSkipped": 2,  # Already synced
#   "message": "Calendar sync completed",
#   "ruleDecisions": []
# }
```

### Scenario 3: OAuth Not Connected
```bash
# Step 1: Use a user who never completed OAuth

curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "<new-user-uuid>"}'

# Expected Response (409):
# {
#   "error": "Conflict",
#   "message": "Google Calendar not connected for user <uuid>",
#   "reason": "OAUTH_NOT_CONNECTED"
# }
```

### Scenario 4: Feature Disabled
```bash
# Step 1: Disable feature
echo "FEATURE_CALENDAR_ENABLED=false" > .env

# Step 2: Try to sync
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "<user-uuid>"}'

# Expected Response (403):
# {
#   "error": "Forbidden",
#   "message": "Calendar integration is disabled"
# }
```

---

## Future Evolution

### Phase 1 (Current)
- ✅ Manual HTTP endpoint (DEV-ONLY)
- ✅ Feature flag protected
- ✅ Validates userId
- ✅ Returns event counts

### Phase 2 (Next)
- ⏳ Scheduled sync via cron/worker
- ⏳ User-configurable sync intervals
- ⏳ Sync status tracking in database
- ⏳ Retry logic for failed syncs

### Phase 3 (Production)
- ⏳ Remove manual endpoint (switch to cron)
- ⏳ Add auth layer for status checks
- ⏳ Monitoring + alerting for sync failures
- ⏳ Metrics (sync duration, events/meeting)

### How to Migrate to Cron?

**Option 1: Keep endpoint, add background job**
```javascript
// services/calendarScheduler.js
const schedule = require('node-schedule');

// Sync all users daily at 2am
schedule.scheduleJob('0 2 * * *', async () => {
  const users = await getAllUsers();
  for (const user of users) {
    await CalendarService.syncMeetings(user.id);
  }
});
```

**Option 2: Remove endpoint entirely**
```javascript
// routes/calendarRoutes.js — DELETE THIS FILE
// Move logic to: services/calendarScheduler.js
```

**Key**: Endpoint logic is already minimal, so migration is trivial.

---

## Logging

### What Gets Logged?

```
[CALENDAR_API] Sync requested for user <uuid>
[CALENDAR_API] Sync completed: 3 events created, 0 skipped
```

### What Does NOT Get Logged?

- ❌ Access tokens
- ❌ Refresh tokens
- ❌ Google API responses
- ❌ User email addresses
- ❌ Sensitive meeting content

---

## Security Notes

### Feature Flag is Sufficient for Dev
- This endpoint has NO authentication
- Protected by `FEATURE_CALENDAR_ENABLED` flag only
- Assumes dev environment is trusted
- Should NOT be exposed in production

### If Needed Later
```javascript
// Option 1: API Key
router.post('/sync', (req, res) => {
  if (req.headers['x-api-key'] !== process.env.CALENDAR_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ...
});

// Option 2: Bearer Token
router.post('/sync', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!validateToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ...
});

// Option 3: OAuth
router.post('/sync', (req, res) => {
  const userId = req.user.id; // From middleware
  // ...
});
```

---

## Troubleshooting

### "Calendar integration is disabled"
**Problem**: Feature flag is off  
**Solution**: Set `FEATURE_CALENDAR_ENABLED=true` in `.env`

```bash
echo "FEATURE_CALENDAR_ENABLED=true" >> .env
npm run dev  # Restart server
```

### "userId must be a valid UUID"
**Problem**: Provided userId is not a UUID  
**Solution**: Use valid UUID format (8-4-4-4-12 hex digits)

```bash
# Valid
550e8400-e29b-41d4-a716-446655440000

# Invalid
user123
12345678
abc
```

### "Google Calendar not connected"
**Problem**: User hasn't completed OAuth  
**Solution**: Complete OAuth flow first

```bash
# Step 1: Visit auth endpoint
curl http://localhost:3000/auth/google

# Step 2: Follow Google consent screen
# Step 3: Complete callback
# Step 4: Now user can sync calendar
```

### "Google Calendar token expired"
**Problem**: OAuth token needs refresh  
**Solution**: User must reconnect OAuth

```bash
# Same as above — complete OAuth again
curl http://localhost:3000/auth/google
```

---

## Example Integration

### Full E2E Test Script

```bash
#!/bin/bash

USER_ID="550e8400-e29b-41d4-a716-446655440000"

echo "1. Starting server..."
npm run dev &
SERVER_PID=$!
sleep 2

echo "2. Testing calendar sync..."
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\"}" \
  | jq .

echo "3. Checking events created..."
curl http://localhost:3000/incidents \
  | jq '.incidents | length'

echo "4. Done!"
kill $SERVER_PID
```

---

## Related Files

- [routes/calendarRoutes.js](routes/calendarRoutes.js) — This endpoint
- [services/calendarService.js](services/calendarService.js) — Fetches + normalizes meetings
- [services/ruleEngine.js](services/ruleEngine.js) — Decides alerts/incidents
- [services/eventService.js](services/eventService.js) — Creates EVENTS records
- [API_REFERENCE.md](../API_REFERENCE.md) — Full API documentation

---

## Questions?

- **How are alerts scheduled?** → RuleEngine + alertScheduler
- **Can I see rule decisions?** → Yes, in response `ruleDecisions` array
- **Will this sync in production?** → No, will use cron/worker instead
- **Can I modify rules?** → Yes, edit `rules/rules.js`
- **Can I disable alerts?** → Yes, via feature flag for each alert type

---

Last Updated: December 20, 2025  
Status: ✅ Implementation Complete — Ready for E2E Testing
