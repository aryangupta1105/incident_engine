# STEP 2: Alerts (Awareness Layer) — COMPLETE ✅

**Status:** Fully implemented and tested
**Tests Passing:** 15/15 ✅
**Migration:** Applied successfully

---

## Overview

STEP 2 implements the **Alerts layer** — a completely separate, awareness-only notification system that is **fully decoupled from incidents** and **never escalates**.

### Key Design Principles

1. **Awareness-Only**: Alerts are informational signals. They exist to inform users but do NOT drive incident management.
2. **Never Escalates**: Alerts do not create incidents, change incident state, or trigger escalation workflows.
3. **Category-Agnostic**: Works with any category string (MEETING, FINANCE, HEALTH, DELIVERY, SECURITY, OTHER, or custom).
4. **Immutable After Delivery**: Once an alert is delivered, it becomes a permanent audit record.
5. **Decoupled Services**: AlertService and alertDeliveryWorker have zero dependencies on incident/escalation logic.
6. **Simulated Delivery**: No external services (email, SMS, push) — delivery is logged locally for testing.

---

## Architecture

### Alerts Data Model

```
alerts table:
├─ id (UUID) - Primary key
├─ user_id (UUID) - Foreign key to users
├─ event_id (UUID, nullable) - Optional reference to source event
├─ category (VARCHAR) - Alert category (any string)
├─ alert_type (VARCHAR) - Alert type identifier
├─ scheduled_at (TIMESTAMP) - When to deliver alert
├─ delivered_at (TIMESTAMP, nullable) - When delivered (immutable after)
├─ status (ENUM) - PENDING | DELIVERED | CANCELLED
├─ created_at (TIMESTAMP) - Record creation time
└─ updated_at (TIMESTAMP) - Last modification time
```

### Alert Status Lifecycle

```
PENDING ──[Delivery Worker]──> DELIVERED (immutable)
  ↓
[Manual Cancellation]
  ↓
CANCELLED
```

**Rules:**
- Can only transition from PENDING to DELIVERED (via delivery worker)
- Can only cancel PENDING alerts (not DELIVERED or CANCELLED)
- DELIVERED status is immutable (no updates allowed)
- Cancelled alerts are permanent audit records

### Services & Components

#### 1. **AlertService** (`services/alertService.js`)

Core business logic for alerts. Zero knowledge of incidents.

**Core Methods:**

```javascript
// Schedule an alert for future delivery
scheduleAlert({
  userId,       // Required
  eventId,      // Optional - can reference an event for context
  category,     // Required - any string (MEETING, FINANCE, etc)
  alertType,    // Required - alert type identifier
  scheduledAt   // Required - Date when to deliver
})
→ Returns: alert object with status=PENDING

// Get alerts due for delivery
getPendingAlerts(now = new Date(), limit = 100)
→ Returns: array of alerts where status=PENDING AND scheduled_at <= now

// Mark alert as delivered (idempotent)
markAlertDelivered(alertId)
→ Returns: alert object with status=DELIVERED, delivered_at set
→ Safe to call twice (second call is no-op)
```

**Supporting Methods:**

```javascript
// Cancel a pending alert
cancelAlert(alertId)
→ Only works for PENDING alerts
→ Throws error if DELIVERED or CANCELLED

// Get all alerts for a user (dashboard)
getUserAlerts(userId, options = {})
→ Optional filters: status, category, limit, offset

// Fetch single alert
getAlertById(alertId)
→ Returns: alert object or null
```

**Key Properties:**
- ✅ Zero incident references
- ✅ Zero escalation logic
- ✅ Category-agnostic (accepts any string)
- ✅ Immutability enforced via design
- ✅ Idempotent operations (safe for retry)

---

#### 2. **Alert Delivery Worker** (`workers/alertDeliveryWorker.js`)

Simulated worker that processes pending alerts and delivers them.

**Key Functions:**

```javascript
// Process all pending alerts due for delivery
deliverPendingAlerts()
→ Gets pending alerts with scheduled_at <= now
→ Simulates delivery (logs to console)
→ Marks each as delivered
→ Returns report: { count, successful, failed, duration }

// Start long-running worker with polling
startWorker(options = { pollIntervalMs: 10000 })
→ Returns: cleanup function to stop worker
→ Polls every N milliseconds
→ Logs delivery events
→ Continues on errors (one failure doesn't stop others)

// Single poll (useful for testing)
poll()
→ Returns: report from deliverPendingAlerts()
```

**Delivery Simulation:**
```
[ALERT_DELIVERY] Type=MEETING_UPCOMING Category=MEETING User=b28251b0 Event=no-event ScheduledAt=2025-12-20T05:27:26.713Z
```

**Key Properties:**
- ✅ Simulated delivery (console.log only)
- ✅ No external services
- ✅ Zero incident creation
- ✅ Error resilient (continues on failures)
- ✅ Fully decoupled from incident system

---

## Database Schema

### Migration: `migrations/004_create_alerts_table.sql`

Creates alerts table with:
- UUID primary key
- Foreign keys to users and events (events FK is nullable)
- Alert status ENUM (PENDING, DELIVERED, CANCELLED)
- 7 performance indexes:
  - Single column: user_id, status, scheduled_at, event_id, category
  - Composite: (user_id, status, scheduled_at) — for pending alert queries
  - Partial: scheduled_at WHERE status=PENDING — for due alerts

- Auto-update trigger for updated_at timestamp
- Comments explaining immutability and decoupling

---

## Test Suite: `test-step2-alerts.js`

**15 comprehensive tests** covering all functionality:

### Test Coverage

1. ✅ **Schedule alert without event** — Alerts can exist independently
2. ✅ **Schedule alert with event** — Alerts can reference events
3. ✅ **Multiple categories** — HEALTH, DELIVERY, SECURITY, OTHER, etc.
4. ✅ **Get pending alerts (none due)** — Empty array for future alerts
5. ✅ **Schedule alert in past** — Immediately due alert creation
6. ✅ **Get pending alerts (finds overdue)** — Retrieves due alerts
7. ✅ **Mark as delivered** — Status transitions to DELIVERED
8. ✅ **Idempotent delivery** — Second delivery is safe (no error)
9. ✅ **Get by ID** — Fetch specific alert
10. ✅ **User alert filtering** — Retrieve all user alerts with options
11. ✅ **Cancel pending alert** — Status transitions to CANCELLED
12. ✅ **Cannot cancel delivered** — Protects immutable delivered alerts
13. ✅ **Worker processes alerts** — Simulated delivery and marking
14. ✅ **Independent from incidents** — Alerts and incidents are separate
15. ✅ **Category-agnostic** — Works with custom category strings

**Test Results:**
```
Passed: 15
Failed: 0
Total:  15
🎉 ALL TESTS PASSED
```

### Running Tests

```bash
cd incident-engine
node test-step2-alerts.js
```

Tests are fully isolated:
- Create temporary test user
- Create test events (optional)
- Run all assertions
- Clean up all test data
- Close database connection

---

## Implementation Details

### Decoupling from Incidents

**AlertService has ZERO knowledge of:**
- Incident creation or state
- Escalation scheduling
- Escalation levels
- Rule evaluation
- Calendar APIs
- User availability

**Design Pattern:**
```javascript
// ✅ CORRECT: AlertService only manages alerts
const alert = await alertService.scheduleAlert({
  userId, category, alertType, scheduledAt
});

// ❌ WRONG: Would break decoupling
// (This code DOES NOT exist in AlertService)
// const incident = await incidentService.evaluateAlert(alert);
```

### Category-Agnosticity

**All categories work the same:**
```javascript
// BUILT-IN categories
scheduleAlert({ category: 'MEETING', ... })
scheduleAlert({ category: 'FINANCE', ... })
scheduleAlert({ category: 'HEALTH', ... })

// CUSTOM categories (also work)
scheduleAlert({ category: 'CUSTOM_DOMAIN_1', ... })
scheduleAlert({ category: 'HR_POLICY', ... })
scheduleAlert({ category: 'WARRANTY_EXPIRY', ... })
```

No hardcoded category-specific logic. Categories are just strings.

### Immutability

**Once delivered, alerts cannot be modified:**

```javascript
// ✅ Can cancel PENDING alert
const alert = await alertService.scheduleAlert({ ... });
await alertService.cancelAlert(alert.id);

// ✅ Can mark PENDING alert as delivered
await alertService.markAlertDelivered(alert.id);

// ❌ Cannot cancel DELIVERED alert (throws error)
await alertService.cancelAlert(deliveredAlert.id);
// Error: Cannot cancel alert in DELIVERED status

// ❌ Cannot modify DELIVERED alert
await pool.query('UPDATE alerts SET ... WHERE id = delivered.id');
// Bad practice - breaks immutability guarantee
```

### Idempotency

**Safe to call delivery multiple times:**

```javascript
const alertId = '...';

// First delivery
await alertService.markAlertDelivered(alertId);
// → status: DELIVERED, delivered_at: 2025-12-20T05:27:30Z

// Second delivery (safe, no error)
await alertService.markAlertDelivered(alertId);
// → status: DELIVERED, delivered_at: 2025-12-20T05:27:30Z (unchanged)

// Third delivery (also safe)
await alertService.markAlertDelivered(alertId);
// → status: DELIVERED, delivered_at: 2025-12-20T05:27:30Z (still unchanged)
```

Critical for fault-tolerant delivery systems.

---

## Safety Guarantees

### ✅ Alerts Never Affect Incidents

```javascript
// Creating an alert...
const alert = await alertService.scheduleAlert({
  userId,
  category: 'MEETING',
  alertType: 'MEETING_APPROACHING',
  scheduledAt: new Date(Date.now() + 1800000) // 30 min from now
});

// ...has ZERO effect on incidents
const incidents = await incidentService.getIncidents(userId);
// incidents list unchanged
```

**Proof:**
- AlertService has no imports from incidentService or escalationService
- AlertService only reads/writes alerts table
- No shared state or callbacks to incident system

### ✅ Alerts Never Create Incidents

```javascript
// Even if alert is delivered...
await alertService.markAlertDelivered(alert.id);

// ...no incident is created
const incidents = await incidentService.getIncidents(userId);
// incidents unchanged
```

### ✅ Alerts Never Escalate

```javascript
// AlertService never calls...
// escalationService (no import)
// escalationScheduler (no import)
// incidentService.transitionIncidentState() (not accessible)

// No escalation logic exists anywhere in alerts codebase
```

### ✅ Delivery is Immutable & Auditable

```
alert.id: 550e8400-e29b-41d4-a716-446655440000
alert.status: DELIVERED
alert.delivered_at: 2025-12-20T05:27:30Z
alert.created_at: 2025-12-20T05:27:15Z

→ Permanent audit record
→ Cannot be deleted
→ Cannot be modified after delivery
```

---

## Validation & Error Handling

### Input Validation

All AlertService methods validate inputs:

```javascript
// ❌ Missing userId
await alertService.scheduleAlert({
  category: 'MEETING',
  alertType: 'UPCOMING',
  scheduledAt: new Date()
});
// Error: userId is required

// ❌ Invalid scheduledAt
await alertService.scheduleAlert({
  userId,
  category: 'MEETING',
  alertType: 'UPCOMING',
  scheduledAt: 'tomorrow' // Not a Date object
});
// Error: scheduledAt must be a valid Date

// ❌ Empty category
await alertService.scheduleAlert({
  userId,
  category: '', // Empty string
  alertType: 'UPCOMING',
  scheduledAt: new Date()
});
// Error: category is required and must be a non-empty string
```

### Error Recovery

AlertService methods include try-catch with logging:

```javascript
try {
  const alert = await alertService.scheduleAlert({ ... });
} catch (err) {
  console.error('[ALERT] Schedule failed:', err.message);
  // Caller receives error, can retry if appropriate
}
```

Delivery worker continues on errors:

```javascript
for (const alert of pendingAlerts) {
  try {
    deliverAlert(alert);
    await alertService.markAlertDelivered(alert.id);
    successful++;
  } catch (err) {
    console.error(`[ALERT_WORKER] Failed to deliver ${alert.id}:`, err.message);
    failed++; // Continue to next alert
  }
}
```

---

## Generalization & Extensibility

### Works for Any Category

```javascript
// System-defined categories
await alertService.scheduleAlert({
  userId,
  category: 'MEETING',    // ✅
  alertType: 'APPROACHING',
  scheduledAt: new Date()
});

await alertService.scheduleAlert({
  userId,
  category: 'FINANCE',    // ✅
  alertType: 'PAYMENT_DUE',
  scheduledAt: new Date()
});

await alertService.scheduleAlert({
  userId,
  category: 'HEALTH',     // ✅
  alertType: 'MEDICATION_TIME',
  scheduledAt: new Date()
});

// Custom categories (also work)
await alertService.scheduleAlert({
  userId,
  category: 'WARRANTY',   // ✅
  alertType: 'EXPIRING_SOON',
  scheduledAt: new Date()
});

await alertService.scheduleAlert({
  userId,
  category: 'SUBSCRIPTION', // ✅
  alertType: 'RENEWAL_REMINDER',
  scheduledAt: new Date()
});
```

No hardcoding. No category enum in service code. Just strings.

---

## What STEP 2 Does NOT Include

❌ No rule engine
❌ No incident creation
❌ No incident state changes
❌ No escalation scheduling
❌ No calendar API integration
❌ No external delivery services (email, SMS, push)
❌ No user availability checking
❌ No meeting-specific logic

All of these are reserved for **STEP 3+**.

---

## Files Created

1. **migrations/004_create_alerts_table.sql**
   - Creates alerts table with proper schema and indexes
   - Status: Applied ✅

2. **services/alertService.js**
   - 6 exported functions (3 core + 3 supporting)
   - ~296 lines of production code
   - Comprehensive JSDoc comments
   - Status: Complete ✅

3. **workers/alertDeliveryWorker.js**
   - Simulated alert delivery
   - Long-running worker with polling
   - ~148 lines of production code
   - Status: Complete ✅

4. **test-step2-alerts.js**
   - 15 comprehensive tests
   - ~356 lines
   - All tests passing ✅

---

## Migration Summary

```
✓ 001_create_incidents_table.sql (already applied)
✓ 002_create_escalations_table.sql (already applied)
✓ 003_create_events_table.sql (already applied)
✓ 004_create_alerts_table.sql (applied in STEP 2)

✓ All migrations completed successfully
```

---

## Next Steps

STEP 2 is **complete and production-ready**.

The alerts system is:
- ✅ Fully functional
- ✅ Thoroughly tested (15/15 tests passing)
- ✅ Category-agnostic
- ✅ Decoupled from incidents
- ✅ Safe to use in production

**Ready for STEP 3:** Rule Engine (when user is ready to begin)

---

## Quick Reference

### Schedule an Alert
```javascript
const alertService = require('./services/alertService');

const alert = await alertService.scheduleAlert({
  userId: 'user-uuid',
  eventId: 'event-uuid', // optional
  category: 'MEETING',
  alertType: 'UPCOMING',
  scheduledAt: new Date(Date.now() + 1800000) // 30 min from now
});
```

### Get Pending Alerts (for delivery worker)
```javascript
const pending = await alertService.getPendingAlerts();
for (const alert of pending) {
  // Simulate delivery...
  await alertService.markAlertDelivered(alert.id);
}
```

### Run Delivery Worker
```javascript
const alertDeliveryWorker = require('./workers/alertDeliveryWorker');

// Start polling
const cleanup = alertDeliveryWorker.startWorker({ pollIntervalMs: 10000 });

// Later: stop polling
cleanup();
```

### View User's Alerts (dashboard)
```javascript
const alerts = await alertService.getUserAlerts(userId, {
  limit: 50,
  offset: 0
});

// Filter by status
const pending = await alertService.getUserAlerts(userId, {
  status: 'PENDING'
});

// Filter by category
const meetings = await alertService.getUserAlerts(userId, {
  category: 'MEETING'
});
```

---

## Verification Commands

```bash
# Apply migration
cd incident-engine
node migrate.js

# Run full test suite
node test-step2-alerts.js

# Expected output: 15/15 tests passing ✅
```

---

**STEP 2 Status: COMPLETE ✅**
