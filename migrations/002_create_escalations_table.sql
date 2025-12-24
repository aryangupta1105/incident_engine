-- ============================================
-- ESCALATION MANAGEMENT SCHEMA
-- ============================================
-- Creates escalations table for tracking escalation history
-- and managing escalation state across restarts
-- ============================================

-- 1. Create escalation_status ENUM
DO $$ BEGIN
  CREATE TYPE escalation_status AS ENUM (
    'PENDING',
    'EXECUTED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Create escalations table
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  escalation_level INT NOT NULL CHECK (escalation_level > 0),
  status escalation_status NOT NULL DEFAULT 'PENDING',
  scheduled_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_escalations_incident_id ON escalations(incident_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_escalations_scheduled_at ON escalations(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_escalations_incident_status ON escalations(incident_id, status);

-- 4. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_escalations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS escalations_update_timestamp ON escalations;
CREATE TRIGGER escalations_update_timestamp
BEFORE UPDATE ON escalations
FOR EACH ROW
EXECUTE FUNCTION update_escalations_timestamp();

-- 5. Add comment for clarity
COMMENT ON TABLE escalations IS 'Audit trail for escalation events. Never delete records - always mark as CANCELLED.';
COMMENT ON COLUMN escalations.status IS 'PENDING: waiting to execute, EXECUTED: completed, CANCELLED: will not execute';
