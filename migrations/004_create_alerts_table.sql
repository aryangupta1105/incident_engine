-- ============================================
-- ALERTS TABLE (AWARENESS LAYER ONLY)
-- ============================================
-- Alerts are informational signals, never escalate.
-- Fully decoupled from incidents.
-- Immutable after delivery.
-- ============================================

BEGIN;

-- 1. Create alert status ENUM
DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM (
    'PENDING',
    'DELIVERED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  category VARCHAR(100) NOT NULL,
  alert_type VARCHAR(100) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  delivered_at TIMESTAMP,
  status alert_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_scheduled_at ON alerts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_alerts_event_id ON alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status_time ON alerts(user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_alerts_pending_due ON alerts(scheduled_at) WHERE status = 'PENDING';

-- 4. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_alerts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alerts_update_timestamp ON alerts;
CREATE TRIGGER alerts_update_timestamp
BEFORE UPDATE ON alerts
FOR EACH ROW
EXECUTE FUNCTION update_alerts_timestamp();

-- 5. Add comments for clarity
COMMENT ON TABLE alerts IS 'Awareness-only alerts. Never escalate, never create incidents. Fully decoupled from incident logic. Immutable after delivery.';
COMMENT ON COLUMN alerts.event_id IS 'Optional reference to source event. Can be NULL.';
COMMENT ON COLUMN alerts.category IS 'Alert category (MEETING, FINANCE, HEALTH, etc). Just a string for flexibility.';
COMMENT ON COLUMN alerts.alert_type IS 'Alert type identifier (e.g., MEETING_UPCOMING, PAYMENT_REMINDER). Just a string.';
COMMENT ON COLUMN alerts.scheduled_at IS 'When alert should be delivered';
COMMENT ON COLUMN alerts.delivered_at IS 'When alert was actually delivered. Immutable after set.';
COMMENT ON COLUMN alerts.status IS 'PENDING: waiting, DELIVERED: sent, CANCELLED: will not send';

COMMIT;
