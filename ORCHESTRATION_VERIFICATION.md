# Orchestration Verification — End-to-End Pipeline Testing

## 🎯 Purpose

This document proves that **ONE API call** (`POST /calendar/sync`) automatically triggers the entire pipeline:

1. Calendar fetch
2. Event creation
3. Rule evaluation
4. Alert scheduling
5. Email delivery
6. Incident creation (if rules match)

**No manual steps. No extra API calls. All automatic.**

---

## ✅ Pre-Flight Checklist

Before starting testing, verify:

- ✅ Server is running: `npm run dev`
- ✅ Database is initialized: `node migrate.js`
- ✅ Feature flags enabled:
  - `FEATURE_CALENDAR_ENABLED=true`
  - `FEATURE_EMAIL_ENABLED=true`
  - `FEATURE_ALERTS_ENABLED=true`
  - `FEATURE_ALERTS_ENABLED` defaults to true (OK if missing)
- ✅ OAuth completed for test user:
  - Visit `http://localhost:3000/auth/google`
  - Complete Google consent
  - Note the user UUID from response
- ✅ Google Calendar has a test account
- ✅ Email provider configured (or simulated)

---

## 📋 Step-by-Step Verification

### Step 1: Create a Test Meeting (5 minutes ahead)

**What:** Create a meeting in Google Calendar that will trigger rules

**Why:** Test meeting becomes an event, which the rule engine evaluates

**How:**

1. Go to Google Calendar (same account used for OAuth)
2. Create a new event with:
   - **Title**: `Production Incident - Database Down`
   - **Time**: 5 minutes from now
   - **Description**: `Critical database failure detected`
3. Save event

**Expected Result:**
- Event appears in Google Calendar
- Event time is ~5 minutes away
- Title contains keywords: "Production" + "Incident"

**Evidence File**: Screenshot of Google Calendar

---

### Step 2: Trigger Calendar Sync API Call

**What:** Call the single API endpoint that orchestrates everything

**Why:** Test that ONE endpoint triggers the full pipeline

**How:**

```bash
# Get your user UUID (from OAuth response or database)
USER_UUID="550e8400-e29b-41d4-a716-446655440000"

# Call the endpoint
curl -X POST http://localhost:3000/calendar/sync \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_UUID\"}"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "eventsProcessed": 1,
  "eventsSkipped": 0,
  "message": "Calendar sync completed",
  "ruleDecisions": [
    {
      "event_id": "event-uuid",
      "calendar_event_id": "google-event-id",
      "title": "Production Incident - Database Down",
      "alerts_scheduled": 1,
      "incident_created": true,
      "reason": "Keywords matched: incident, production"
    }
  ]
}
```

**Evidence File**: Response screenshot or curl output

---

### Step 3: Verify Events Table

**What:** Check that event was created from calendar sync

**Why:** Proves Calendar → Events layer works

**How:**

```bash
# Connect to database
psql -d incidents_db

# Query recent events
SELECT id, user_id, source, category, type, occurred_at 
FROM events 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC 
LIMIT 5;
```

**Expected Result:**
- One new row with:
  - `source = 'CALENDAR'`
  - `category = 'MEETING'`
  - `type = 'MEETING_SCHEDULED'`
  - `occurred_at` = meeting time
  - `user_id` = your user UUID

**Count:**
- Should see event for the "Production Incident" meeting

**Evidence:**
```
 id | source | category | type | occurred_at
----+--------+----------+------+-----------
abc | CALENDAR | MEETING | MEETING_SCHEDULED | 2024-12-21 14:30:00
```

---

### Step 4: Verify Alerts Table

**What:** Check that alert was scheduled by rule engine

**Why:** Proves Event → Rule Engine → Alert layer works

**How:**

```bash
# In database connection
SELECT id, user_id, event_id, category, alert_type, scheduled_at, status 
FROM alerts 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC 
LIMIT 5;
```

**Expected Result:**
- One or more new rows with:
  - `status = 'PENDING'` (before delivery) or `'DELIVERED'` (after)
  - `scheduled_at` = sometime soon (or in the past if email was sent)
  - `alert_type` = matches rule configuration
  - `event_id` = matches event from Step 3

**Count:**
- Should see at least 1 alert (matching "Production Incident" rule)

**Evidence:**
```
 id | category | alert_type | scheduled_at | status
----+----------+------------+--------------+--------
def | MEETING | CRITICAL | 2024-12-21 14:35:00 | DELIVERED
```

---

### Step 5: Verify Email Sent (or Queued)

**What:** Check that alert was delivered via email

**Why:** Proves Alert → Email delivery layer works

**How:**

**Option A: Check Email (if SMTP configured)**
```bash
# Check your email inbox
# Look for email about "Production Incident"
# Subject should mention alert/incident
```

**Option B: Check Email Logs**
```bash
# In database connection
SELECT id, alert_id, user_id, subject, status, sent_at 
FROM email_logs 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC 
LIMIT 5;
```

**Option C: Check Server Logs**
```bash
# In terminal running server
grep "\[EMAIL\]" server.log
# Should see:
# [EMAIL] Delivering alert: ...
# [EMAIL] Delivered alert: ...
```

**Expected Result:**
- Email sent to user email address
- Subject mentions incident/alert
- Body includes meeting details
- Status = `DELIVERED`

**Evidence:**
- Email screenshot, OR
- Database log entry, OR
- Server log output

---

### Step 6: Verify Incidents Table (if rules create incidents)

**What:** Check if incident was created by rule engine

**Why:** Proves Rule Engine → Incident layer works

**How:**

```bash
# In database connection
SELECT id, user_id, event_id, category, type, severity, state, created_at 
FROM incidents 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC 
LIMIT 5;
```

**Expected Result (if your rule creates incidents):**
- One new row with:
  - `state = 'OPEN'` (initial state)
  - `event_id` = matches event from Step 3
  - `severity` = matches rule configuration
  - `category = 'MEETING'`

**Expected Result (if your rule does NOT create incidents):**
- No new rows
- That's OK — rule engine only creates alerts
- Incidents are optional per rule configuration

**Evidence:**
```
 id | category | type | severity | state | created_at
----+----------+------+----------+-------+----------
ghi | MEETING | INCIDENT | HIGH | OPEN | 2024-12-21 14:25:00
```

---

## 🔍 Pipeline Verification via Logs

**What:** Watch the server logs to see the full chain execute

**Why:** Proves each layer is called in sequence

**How:**

1. In the terminal running the server, look for these log lines (in order):

```
[CALENDAR] Sync started for user <uuid>
[CALENDAR] Fetched 1 meetings to process
[EVENTS] Creating event for meeting: "Production Incident - Database Down"
[EVENTS] Event created: <event-id>
[RULE_ENGINE] Evaluating MEETING_SCHEDULED (MEETING)
[RULE_ENGINE] Checking N alert rules
[RULE_ENGINE] Checking incident rule
[RULE_ENGINE] Decision: N alert rules, incident=true, alerts_to_schedule=1
[ALERTS] Scheduled: MEETING/CRITICAL at <timestamp>
[INCIDENT] Created: <incident-id> (MEETING/INCIDENT, severity=HIGH)
[EMAIL] Found 1 pending alerts to deliver
[EMAIL] Delivering alert: MEETING/CRITICAL
[EMAIL] Delivered alert: <alert-id>
[CALENDAR] Sync completed: 1 events created, 0 skipped
```

**Expected Pattern:**
- CALENDAR → EVENTS → RULE_ENGINE → ALERTS → INCIDENT → EMAIL
- All on ONE API call
- No manual intervention

**Evidence:**
- Copy/paste these log lines into verification report

---

## ✅ Success Criteria

You pass this verification if:

1. ✅ **Calendar → Events**: Event created in DB from Google Calendar
2. ✅ **Events → Rule Engine**: Rule engine evaluated the event
3. ✅ **Rule Engine → Alerts**: Alert(s) created in DB
4. ✅ **Alerts → Email**: Email sent or queued for delivery
5. ✅ **Rule Engine → Incidents**: Incident created (if rule matched)
6. ✅ **Single API Call**: All triggered by `POST /calendar/sync`
7. ✅ **Zero Manual Steps**: Everything automatic
8. ✅ **Logs Prove It**: Pipeline logs show full chain

---

## 🚫 Failure Cases (What NOT to do)

### ❌ If Event is NOT created:
- Check: Is FEATURE_CALENDAR_ENABLED=true?
- Check: Is user OAuth connected?
- Check: Are there actually meetings in Google Calendar?
- Check: Is meeting time >= now (not in the past)?

### ❌ If Alert is NOT created:
- Check: Are there rules defined for MEETING category?
- Check: Do the rules match the meeting (keywords, etc.)?
- Check: Is alert creation failing in logs?

### ❌ If Email is NOT sent:
- Check: Is FEATURE_EMAIL_ENABLED=true?
- Check: Is alert status PENDING in database?
- Check: Is email provider working? (check logs)
- Check: Is alert worker running? (check server logs)

### ❌ If Incident is NOT created:
- Check: Does your rule create incidents?
- Check: Do the incident conditions match?
- Check: Check rule engine logs for "incident trigger conditions not met"

---

## 📊 Summary Table

| Layer | Table | Status Check | Log Output |
|-------|-------|--------------|------------|
| Calendar | (API) | `[CALENDAR] Sync started...` | Started/completed |
| Events | `events` | 1 row created | `[EVENTS] Event created` |
| Rule Engine | (logic) | Evaluated conditions | `[RULE_ENGINE] Decision:...` |
| Alerts | `alerts` | 1+ rows created | `[ALERTS] Scheduled...` |
| Email | `email_logs` or inbox | 1 sent/queued | `[EMAIL] Delivered...` |
| Incidents | `incidents` | 0+ rows (optional) | `[INCIDENT] Created...` |

---

## 🔐 Orchestration Guarantees

This system guarantees:

1. **Automatic Execution**: No manual API calls needed after `/calendar/sync`
2. **Single Trigger**: Only ONE endpoint triggers the pipeline
3. **Deterministic**: Same input always produces same output
4. **Failure Safe**: Errors logged, pipeline continues
5. **Feature Gated**: Each layer respects feature flags
6. **Decoupled**: Each layer is independent (can fail without crashing others)
7. **Idempotent**: Re-running sync doesn't duplicate events

---

## 📝 Verification Report Template

Use this template to document your verification:

```markdown
# Verification Report — [DATE]

## Pre-Flight
- Server started: ✅
- Database migrated: ✅
- Feature flags enabled: ✅
- OAuth completed for user: [USER_UUID]

## Step 1: Create Meeting
- Meeting title: "Production Incident - Database Down"
- Time: [DATETIME]
- Link: [SCREENSHOT]

## Step 2: Call API
- Command: [CURL COMMAND]
- Response: [JSON RESPONSE]
- Status: 200 OK ✅

## Step 3: Verify Events
- Events count: 1 ✅
- Event ID: [EVENT_ID]
- Source: CALENDAR ✅

## Step 4: Verify Alerts
- Alerts count: 1 ✅
- Alert ID: [ALERT_ID]
- Status: PENDING/DELIVERED ✅

## Step 5: Verify Email
- Email sent: ✅
- Date received: [DATETIME]
- Subject: [SUBJECT]

## Step 6: Verify Incidents
- Incidents count: [COUNT] ✅
- Incident ID: [INCIDENT_ID] (if created)
- State: OPEN ✅

## Logs Verification
- [CALENDAR] Sync started ✅
- [EVENTS] Event created ✅
- [RULE_ENGINE] Decision made ✅
- [ALERTS] Scheduled ✅
- [EMAIL] Delivered ✅
- [INCIDENT] Created ✅ (if applicable)

## Conclusion
✅ ORCHESTRATION VERIFIED — Full pipeline executes from ONE API call
```

---

## 🎓 What This Proves

When you complete this verification, you prove:

1. **Architecture is Sound**: All layers work together seamlessly
2. **No Manual Sequencing**: No human needs to call APIs in order
3. **Automation is Real**: The system thinks, decides, and acts on its own
4. **Product Requirement Met**: "One API call ingests calendar data and automatically creates events, evaluates rules, creates alerts/incidents, and delivers notifications"

---

## 🔄 Troubleshooting

### "Sync says success but nothing appears in database"
- Check: Are feature flags all true?
- Check: Does the meeting actually exist in Google Calendar?
- Check: Is the meeting in the future (>= now)?
- Check: Do logs show any errors after [CALENDAR] started?

### "Events created but no alerts"
- Check: Are there rules for MEETING category?
- Check: Do the rules' conditions match the meeting?
- Check: Are alert rules enabled? (FEATURE_ALERTS_ENABLED)
- Check: What does [RULE_ENGINE] say in logs?

### "Alerts created but not delivered"
- Check: Is FEATURE_EMAIL_ENABLED=true?
- Check: Is email provider working? (test it separately)
- Check: Does server log show [EMAIL] Delivering...?
- Check: Does alert status show PENDING or DELIVERED?

### "Everything looks good but want extra certainty"
- Run verification multiple times with different meetings
- Check that events are idempotent (syncing again doesn't duplicate)
- Test failure scenarios (disable feature flag, clear rules, etc.)

---

## 📞 Questions?

If something doesn't work:

1. Check server logs first: `[CALENDAR]`, `[EVENTS]`, `[RULE_ENGINE]`, `[ALERTS]`, `[EMAIL]`, `[INCIDENT]`
2. Check database for intermediate state
3. Review relevant service file for logic
4. Check feature flags are all true
5. Verify OAuth is complete and tokens valid

---

**Status**: Ready for verification  
**Last Updated**: December 20, 2025  
**Version**: 1.0
