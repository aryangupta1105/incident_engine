-- ============================================
-- TASK 4: ADD UNIQUE CONSTRAINT FOR ALERTS
-- ============================================
-- Prevents duplicate alert scheduling
-- Ensures exactly ONE call per meeting
-- Guarantees idempotent alert creation
-- ============================================

BEGIN;

-- Add UNIQUE constraint to prevent same alert type for same event
-- This ensures that:
-- 1. Only ONE MEETING_CRITICAL_CALL per event can exist
-- 2. Only ONE MEETING_UPCOMING_EMAIL per event can exist
-- 3. Only ONE MEETING_URGENT_MESSAGE per event can exist
-- 
-- If scheduler runs multiple times or is restarted:
-- - Second attempt to INSERT same alert type for same event is REJECTED
-- - Database returns UNIQUE constraint violation (safe to catch and ignore)
-- - Exactly-once delivery guaranteed at creation time
--
-- This is the final safeguard against duplicate calls in production

ALTER TABLE alerts
ADD CONSTRAINT unique_event_alert_type 
UNIQUE (event_id, alert_type);

-- Index already exists for event_id, but let's verify
-- the constraint is properly enforced
CREATE INDEX IF NOT EXISTS idx_alerts_event_type 
ON alerts(event_id, alert_type);

COMMIT;

-- ============================================
-- MIGRATION VERIFICATION
-- ============================================
-- To verify this migration is applied:
--
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'alerts' 
-- AND constraint_name LIKE '%unique%';
--
-- Expected output:
-- unique_event_alert_type | UNIQUE
-- ============================================
