-- ============================================
-- MEETING ENFORCEMENT PIPELINE TABLES
-- ============================================
-- Supports: meeting checkins, escalation tracking
-- ============================================

BEGIN;

-- 1. Create meeting_checkins table
CREATE TABLE IF NOT EXISTS meeting_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- JOINED, MISSED, UNKNOWN
  confirmed_at TIMESTAMP NOT NULL,
  confirmation_source VARCHAR(50), -- API, AUTO_CALL, MANUAL_SMS, etc.
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meeting_checkins_user_id ON meeting_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_checkins_event_id ON meeting_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_meeting_checkins_user_event ON meeting_checkins(user_id, event_id);

-- 2. Create escalation_steps table (tracks enforcement ladder progression)
CREATE TABLE IF NOT EXISTS escalation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_number INT NOT NULL, -- 1 (Email), 2 (SMS), 3 (Call), 4 (Repeat Call)
  step_type VARCHAR(50) NOT NULL, -- EMAIL, SMS, CALL, NOTIFICATION
  scheduled_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, EXECUTED, FAILED, SKIPPED
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_escalation_steps_incident_id ON escalation_steps(incident_id);
CREATE INDEX IF NOT EXISTS idx_escalation_steps_user_id ON escalation_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_steps_status ON escalation_steps(status);
CREATE INDEX IF NOT EXISTS idx_escalation_steps_scheduled_at ON escalation_steps(scheduled_at);

-- 3. Create timestamp triggers
CREATE OR REPLACE FUNCTION update_meeting_checkins_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meeting_checkins_update_timestamp
BEFORE UPDATE ON meeting_checkins
FOR EACH ROW
EXECUTE FUNCTION update_meeting_checkins_timestamp();

CREATE OR REPLACE FUNCTION update_escalation_steps_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER escalation_steps_update_timestamp
BEFORE UPDATE ON escalation_steps
FOR EACH ROW
EXECUTE FUNCTION update_escalation_steps_timestamp();

COMMIT;
