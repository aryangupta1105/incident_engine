# Calendar Sync API — Quick Reference

## Endpoint

```
POST /calendar/sync
```

## Quick Test

```bash
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'
```

## Request

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Response (Success)

```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "eventsProcessed": 3,
  "eventsSkipped": 0,
  "message": "Calendar sync completed",
  "ruleDecisions": [...]
}
```

## Error Responses

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Missing userId | `userId is required in request body` |
| 400 | Invalid UUID | `userId must be a valid UUID` |
| 403 | Feature disabled | `Calendar integration is disabled` |
| 409 | OAuth not connected | `Google Calendar not connected for user` |
| 409 | Token expired | `Google Calendar token expired` |
| 500 | Unexpected error | Error details (dev mode only) |

## Setup

```bash
# 1. Complete OAuth first
curl http://localhost:3000/auth/google

# 2. Create meetings in Google Calendar

# 3. Trigger sync
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "<your-uuid>"}'
```

## Files

| File | Purpose |
|------|---------|
| `routes/calendarRoutes.js` | Route definition |
| `app.js` | Route mounting |
| `DEV_CALENDAR_SYNC.md` | Full documentation |
| `CALENDAR_SYNC_IMPLEMENTATION.md` | Implementation summary |

## Feature Flag

```bash
# Must be set to 'true'
FEATURE_CALENDAR_ENABLED=true
```

## What It Does

1. ✅ Validates feature flag
2. ✅ Validates userId UUID
3. ✅ Calls CalendarService.syncMeetings()
4. ✅ Fetches Google Calendar events
5. ✅ Creates EVENTS records
6. ✅ Runs RuleEngine for each event
7. ✅ Returns counts + decisions

## What It Does NOT Do

- ❌ Create incidents directly
- ❌ Escalate incidents
- ❌ Require authentication
- ❌ Hardcode API calls
- ❌ Add Redis/caching
- ❌ Add cron jobs
- ❌ Generate random UUIDs

## Logging

```
[CALENDAR_API] Sync requested for user <uuid>
[CALENDAR_API] Sync completed: <n> events created, <n> skipped
```

## Valid UUID Format

```
550e8400-e29b-41d4-a716-446655440000
^^^^^^^^-^^^^-^^^^-^^^^-^^^^^^^^^^^^
8 hex   4 hex 4 hex 4 hex   12 hex
```

## Testing

```bash
# Success case
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}'

# Feature disabled (FEATURE_CALENDAR_ENABLED=false)
# Returns 403

# OAuth not connected (new user)
# Returns 409

# Invalid UUID
# Returns 400
```

## Status Codes

- **200** ✅ Sync successful
- **400** ❌ Bad request (missing/invalid userId)
- **403** ❌ Feature disabled
- **409** ❌ Conflict (OAuth issues)
- **500** ❌ Server error

## Related APIs

- **POST /auth/google** — Complete OAuth (required first)
- **GET /incidents** — View incidents created
- **GET /health** — Check system status

## Documentation

- **DEV_CALENDAR_SYNC.md** — Complete guide with examples
- **CALENDAR_SYNC_IMPLEMENTATION.md** — Implementation details
- **API_REFERENCE.md** — Full API documentation

## Questions?

See [DEV_CALENDAR_SYNC.md](DEV_CALENDAR_SYNC.md) for detailed guide.
