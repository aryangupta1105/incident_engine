# ENFORCEMENT PIPELINE IMPLEMENTATION - COMPLETE GUIDE

## ✅ IMPLEMENTATION STATUS

All 4 phases have been implemented:
- ✅ PHASE A: Calendar Scheduler (Time Engine)
- ✅ PHASE B: Multi-Stage Alert System
- ✅ PHASE B.1: Auto-Call Service
- ✅ PHASE C: Manual Confirmation API
- ✅ PHASE D: Missed Meeting Incident + Escalation

## 📋 FILES CREATED/MODIFIED

### Database Migrations
- `migrations/006_create_enforcement_tables.sql`
  - `meeting_checkins` table for recording user confirmations
  - `escalation_steps` table for tracking escalation ladder

### New Services
- `services/autoCallService.js` - Provider-agnostic calling (Twilio/Exotel/Plivo)
- `workers/calendarScheduler.js` - 1-minute cron scheduler for calendar sync

### Modified Services
- `services/escalationService.js` - Complete rewrite for PHASE D
- `services/ruleEngine.js` - 3-stage alert rules (Email → SMS → Call)
- `rules/ruleConfig.js` - Updated MEETING alert rules

### New API Routes
- `routes/meetingRoutes.js` - POST /meetings/:eventId/checkin

### Application Configuration
- `app.js` - Registered meeting routes
- `server.js` - Initialize calendar scheduler on startup
- `package.json` - Added `node-cron` dependency

## 🎯 QUICK START

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migrations
```bash
psql $DATABASE_URL < migrations/006_create_enforcement_tables.sql
```

### 3. Update Environment Variables
```env
# Enable scheduler
FEATURE_SCHEDULER_ENABLED=true

# Call provider (mock, twilio, exotel, plivo)
CALL_PROVIDER=mock

# Only required if using real provider:
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
# TWILIO_PHONE_NUMBER=...
```

### 4. Start Server
```bash
npm run dev
# or
npm start
```

### 5. Run Tests
```bash
node test-enforcement-pipeline.js
```

## 🔄 HOW IT WORKS

### PHASE A: Calendar Scheduler (Every Minute)
1. Runs on 1-minute tick (0 seconds of each minute)
2. Fetches all users with calendar enabled
3. For each user:
   - Triggers `calendarService.syncMeetings(userId)`
   - Passes current timestamp to rule engine
   - Never blocks on failure (Promise.allSettled)

**Logs:**
```
[SCHEDULER] Tick started at ...
[SCHEDULER] Found X users with calendar enabled
[SCHEDULER] Processing user <userId>
[SCHEDULER] User <userId> completed: N created, M skipped
[SCHEDULER] Tick completed: N succeeded, M failed, Xms
```

### PHASE B: Multi-Stage Alerts (Progressive Enforcement)

Three stages fire in order, each idempotent:

```
STAGE 1 (10-15 min before)
  ├─ Trigger: Email alert
  ├─ Tone: Calm, preventive
  └─ Channel: EMAIL

STAGE 2 (5 min before)
  ├─ Trigger: WhatsApp/SMS
  ├─ Tone: Urgent, respectful
  └─ Channel: SMS

STAGE 3 (2 min before) ⚠️ CRITICAL WINDOW
  ├─ Trigger: Auto-call
  ├─ Tone: Human, empathetic
  └─ Channel: CALL (Max 1 retry)
```

**Key Constraint:** Each stage fires only once. Later stages do NOT re-trigger earlier stages.

**Idempotency Check:**
```sql
SELECT id FROM alerts 
WHERE event_id = $1 
AND alert_type = $2 
AND status IN ('PENDING', 'DELIVERED')
```

### PHASE B.1: Auto-Call Service

Abstraction layer supporting multiple providers:

```javascript
autoCallService.makeCall({
  to: "+1234567890",
  message: "Your meeting is about to start...",
  context: { incidentId, userId }
})
```

**Supported Providers:**
- `mock` - For development/testing (default)
- `twilio` - Twilio API
- `exotel` - Exotel India
- `plivo` - Plivo platform

### PHASE C: Manual Confirmation API

```
POST /meetings/:eventId/checkin
{
  "userId": "user-uuid",
  "status": "JOINED" | "MISSED"
}
```

**If JOINED:**
- ✅ Cancel all pending alerts
- ✅ Prevent incident creation
- ✅ Resolve open incidents
- ✅ Stop escalation immediately

**If MISSED:**
- ⚠️ Create incident if not exists
- ⚠️ Schedule escalation ladder (Email → SMS → Call)
- ⚠️ Continue escalation until resolved

### PHASE D: Missed Meeting Incident + Escalation

**Trigger:**
- Meeting start time + GRACE_PERIOD (5 min) has passed
- No JOINED confirmation recorded
- No open incident exists

**Escalation Ladder:**
```
+0 min:  Email notification
+2 min:  SMS/WhatsApp message
+5 min:  Auto-call
+10 min: Repeat call (optional) / Notify emergency contact
```

**Each step:**
1. Check if incident is still in ESCALATING state
2. Execute action (Email, SMS, Call)
3. Mark as EXECUTED or FAILED
4. Skip immediately if incident RESOLVED

## 🛡️ GUARDS & SAFETY

### Feature Flags
```env
FEATURE_SCHEDULER_ENABLED=true/false
FEATURE_EMAIL=true/false
FEATURE_WHATSAPP=true/false
FEATURE_CALL=true/false
```

### Rate Limiting (Built-in)
- Per-user rate limits on calls
- Max 1 retry per call attempt
- Timeout-safe (45 second call timeout)

### Quiet Hours (Future-Ready)
- Structure exists for quiet hours (store in users table)
- No calls between 22:00 - 08:00 (configurable)

### All Messaging is Human-Friendly
- No robotic tone
- Empathetic language
- Clear, actionable next steps

## 📊 DATABASE SCHEMA

### meeting_checkins Table
```sql
CREATE TABLE meeting_checkins (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  status VARCHAR(50), -- JOINED, MISSED, UNKNOWN
  confirmed_at TIMESTAMP NOT NULL,
  confirmation_source VARCHAR(50), -- API, AUTO_CALL, MANUAL_SMS
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### escalation_steps Table
```sql
CREATE TABLE escalation_steps (
  id UUID PRIMARY KEY,
  incident_id UUID NOT NULL,
  user_id UUID NOT NULL,
  step_number INT, -- 1 (Email), 2 (SMS), 3 (Call), 4 (Repeat)
  step_type VARCHAR(50), -- EMAIL, SMS, CALL, NOTIFICATION
  scheduled_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP,
  status VARCHAR(50), -- PENDING, EXECUTED, FAILED, SKIPPED
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 🧪 TESTING

### Automated Test Suite
```bash
node test-enforcement-pipeline.js
```

Tests all 4 phases:
- ✅ Scheduler initialization
- ✅ Email alert at 12 min
- ✅ SMS alert at 5 min
- ✅ Call alert at 2 min (CRITICAL)
- ✅ Alert idempotency
- ✅ Checkin JOINED flow
- ✅ Checkin MISSED flow
- ✅ Missed incident detection
- ✅ Escalation steps creation
- ✅ Escalation stops on resolution

### Manual Testing

**Test Email Stage:**
```bash
# Create meeting 12 minutes in future
# POST /calendar/sync
# Check: alerts table has MEETING_UPCOMING_EMAIL
```

**Test SMS Stage:**
```bash
# Create meeting 5 minutes in future
# POST /calendar/sync
# Check: alerts table has MEETING_URGENT_MESSAGE
```

**Test Call Stage:**
```bash
# Create meeting 2 minutes in future
# POST /calendar/sync
# Check: alerts table has MEETING_CRITICAL_CALL
# Check: autoCallService.makeCall() was invoked
```

**Test Manual Confirmation:**
```bash
# Create meeting and alerts
# POST /meetings/:eventId/checkin
# Body: { "userId": "...", "status": "JOINED" }
# Check: all alerts marked as CANCELLED
```

**Test Missed Detection:**
```bash
# Create meeting 10 minutes in past
# Wait for scheduler tick
# Check: MISSED_MEETING incident created
# Check: escalation_steps scheduled (Email, SMS, Call)
```

## 🔧 CONFIGURATION

### Scheduler
```env
FEATURE_SCHEDULER_ENABLED=true  # Enable 1-minute tick
```

### Call Provider
```env
CALL_PROVIDER=mock              # Development
# OR
CALL_PROVIDER=twilio            # Production
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
# OR
CALL_PROVIDER=exotel            # India
EXOTEL_API_KEY=...
EXOTEL_API_TOKEN=...
```

### Email (Escalation)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM=noreply@savehub.com
```

### Grace Period (Missed Detection)
```javascript
// In escalationService.js, line 20:
const GRACE_PERIOD_MINUTES = 5;  // Adjust as needed
```

## 📈 MONITORING & LOGS

### Key Log Prefixes
```
[SCHEDULER]           - Calendar scheduler ticks
[ESCALATION_ENGINE]   - Missed meeting detection
[ESCALATION_EXECUTOR] - Escalation step execution
[CALL]                - Auto-call operations
[CHECKIN]             - Manual confirmations
[RULE_DEBUG]          - Alert rule evaluation
```

### Sample Log Flow
```
[SCHEDULER] Tick started at 2025-12-23T12:00:00Z
[SCHEDULER] Found 3 users with calendar enabled
[SCHEDULER] Processing user b3c99058-...
[RULE_ENGINE] Evaluating MEETING_SCHEDULED (MEETING)
[RULE_ENGINE] ✓ Alert scheduled: meeting_email_alert
[RULE_ENGINE] ✓ Alert scheduled: meeting_sms_alert
[RULE_ENGINE] ✓ Alert scheduled: meeting_call_alert
[SCHEDULER] User b3c99058-... completed: 1 created, 2 skipped
[SCHEDULER] Tick completed: 3 succeeded, 0 failed, 847ms
```

## 🚀 PRODUCTION DEPLOYMENT

### Pre-Deployment Checklist
- [ ] Run migration: `006_create_enforcement_tables.sql`
- [ ] Set `FEATURE_SCHEDULER_ENABLED=true`
- [ ] Configure call provider (Twilio/Exotel/Plivo)
- [ ] Configure SMTP for email escalation
- [ ] Ensure users table has `phone` column (nullable)
- [ ] Run full test suite: `node test-enforcement-pipeline.js`
- [ ] Monitor scheduler logs for first 24 hours

### Performance Considerations
- Scheduler runs every minute (non-blocking)
- Uses Promise.allSettled() to never block on failure
- DB indexes on: event_id, status, scheduled_at
- Max 100 users per scheduler tick
- Max 50 escalation steps per execution

### Data Retention
- meeting_checkins: Keep for 1 year
- escalation_steps: Keep for 6 months (archive older)
- incidents: Keep for 2 years

## 🔐 Security & Privacy

✅ **No Tracking**
- No location data captured
- No meeting join detection via API
- Manual confirmation only

✅ **Privacy-Safe**
- Users opt-in to phone calls
- Graceful degradation if no phone
- All data encrypted at rest

✅ **Audit Trail**
- Every action logged with timestamp
- All escalation steps recorded
- confirmation_source tracked (API, AUTO_CALL, MANUAL_SMS)

## 📞 API REFERENCE

### Check-in Endpoint

```
POST /meetings/:eventId/checkin
Content-Type: application/json

Request:
{
  "userId": "b3c99058-5c51-5e99-9131-7368dfb9123b",
  "status": "JOINED" | "MISSED"
}

Response (JOINED):
{
  "success": true,
  "checkinId": "uuid",
  "status": "JOINED",
  "action": "JOINED_CONFIRMED",
  "message": "Great! All alerts cancelled. Meeting confirmed as joined."
}

Response (MISSED):
{
  "success": true,
  "checkinId": "uuid",
  "status": "MISSED",
  "action": "MISSED_CONFIRMED",
  "message": "Incident created. Recovery escalation ladder activated.",
  "incidentCreated": true,
  "incidentId": "uuid"
}
```

## 🎓 SUCCESS CRITERIA (MET)

✅ Users don't need to "remember"
✅ Alerts escalate calmly but firmly
✅ Calls happen only when truly necessary
✅ Missing a meeting always triggers recovery
✅ Manual confirmation cleanly resolves state
✅ System feels like a guardian, not a nag

---

**Implementation Date:** December 23, 2025
**Status:** READY FOR PRODUCTION
