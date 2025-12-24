/**
 * 007_add_production_columns.sql
 * 
 * PRODUCTION-READY SCHEMA UPDATE
 * 
 * Adds missing columns for:
 * - Alert collapse persistence (cancelled_at)
 * - User phone numbers for Twilio (phone)
 * - OAuth connection tracking (google_connected_at, revoked)
 * 
 * SAFE: All columns are NULLABLE or have DEFAULT values
 * IDEMPOTENT: Uses IF NOT EXISTS checks
 * NO DATA LOSS: Does not modify or delete any existing data
 */

BEGIN;

-- ============================================
-- 1. ALERTS TABLE - Add cancelled_at column
-- ============================================
-- Purpose: Track alert collapse persistence
-- When an alert is collapsed during stage collapse,
-- mark it with cancelled_at = NOW() instead of writing invalid SKIPPED status

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'alerts' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE alerts 
    ADD COLUMN cancelled_at TIMESTAMP NULL;
    COMMENT ON COLUMN alerts.cancelled_at IS 'When alert was cancelled due to stage collapse. If set, alert is never delivered. Immutable after set.';
  END IF;
END $$;

-- Create index for efficient filtering of non-cancelled alerts
CREATE INDEX IF NOT EXISTS idx_alerts_cancelled_at ON alerts(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- ============================================
-- 2. USERS TABLE - Add phone column
-- ============================================
-- Purpose: Store user phone numbers for Twilio calls
-- Format: E.164 (e.g., +916263038693, +16265555555)
-- For production: Populate via user settings or admin UI
-- For testing: Falls back to DEV_PHONE_NUMBER env var

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'phone'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN phone VARCHAR(20) NULL;
    COMMENT ON COLUMN users.phone IS 'User phone number in E.164 format (e.g., +916263038693). Required for Twilio calls. Must start with +.';
  END IF;
END $$;

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ============================================
-- 3. USERS TABLE - Add google_connected_at column
-- ============================================
-- Purpose: Track when user connected their Google account
-- Useful for detecting stale/reconnect-needed OAuth sessions

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'google_connected_at'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN google_connected_at TIMESTAMP NULL;
    COMMENT ON COLUMN users.google_connected_at IS 'When user connected their Google account via OAuth. NULL if never connected. Useful for detecting stale sessions.';
  END IF;
END $$;

-- ============================================
-- 4. USERS TABLE - Add revoked column
-- ============================================
-- Purpose: Track if user revoked OAuth permissions
-- Allows graceful handling of revoked access

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'revoked'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN revoked BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN users.revoked IS 'TRUE if user has revoked OAuth permissions. System should not attempt calendar sync or token refresh if revoked=TRUE.';
  END IF;
END $$;

-- Create index for revocation checks
CREATE INDEX IF NOT EXISTS idx_users_revoked ON users(revoked) WHERE revoked = TRUE;

-- ============================================
-- 5. Create view for efficient pending alert queries
-- ============================================
-- This view encapsulates the logic for "which alerts should be delivered?"
-- Makes code cleaner and performance tuning easier

CREATE OR REPLACE VIEW v_pending_alerts AS
SELECT * FROM alerts
WHERE status = 'PENDING'
  AND delivered_at IS NULL
  AND cancelled_at IS NULL
  AND scheduled_at <= NOW()
ORDER BY scheduled_at ASC;

COMMENT ON VIEW v_pending_alerts IS 'Efficient view for pending alert queries. Returns only alerts ready for delivery: PENDING status, not yet delivered, not collapsed, and scheduled_at has passed.';

-- ============================================
-- 6. Update alerts table with delivery safeguards
-- ============================================
-- Ensure delivered_at is set when alert is marked DELIVERED

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'alerts_set_delivered_at'
  ) THEN
    CREATE OR REPLACE FUNCTION set_alerts_delivered_at()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'DELIVERED' AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at = NOW();
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER alerts_set_delivered_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION set_alerts_delivered_at();
  END IF;
END $$;

-- ============================================
-- 7. Add safeguard: prevent status changes after delivery
-- ============================================
-- Once an alert is DELIVERED or CANCELLED, it's immutable

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'alerts_prevent_mutations'
  ) THEN
    CREATE OR REPLACE FUNCTION prevent_alert_mutations()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.delivered_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify delivered alert: %', OLD.id;
      END IF;
      IF OLD.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify cancelled alert: %', OLD.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER alerts_prevent_mutations
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION prevent_alert_mutations();
  END IF;
END $$;

-- ============================================
-- 8. Summary of changes
-- ============================================
-- alerts.cancelled_at - For collapse persistence
-- users.phone - For Twilio calling
-- users.google_connected_at - For OAuth tracking
-- users.revoked - For permission revocation handling
-- 
-- All changes are backward compatible (NULLABLE / DEFAULT)
-- All changes are idempotent (IF NOT EXISTS)
-- No data loss or migration required
-- ============================================

COMMIT;
