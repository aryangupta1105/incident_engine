-- ============================================
-- INCIDENT MANAGEMENT SCHEMA MIGRATION
-- ============================================
-- Adds new columns to incidents table for state machine
-- ============================================

-- 1. Create ENUM type for incident states (if not exists)
DO $$ BEGIN
  CREATE TYPE incident_state AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'ESCALATING',
    'RESOLVED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Add state column (if not exists)
DO $$ BEGIN
  ALTER TABLE incidents ADD COLUMN state incident_state NOT NULL DEFAULT 'OPEN';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 3. Add resolved_at column (if not exists)
DO $$ BEGIN
  ALTER TABLE incidents ADD COLUMN resolved_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 4. Add resolution_note column (if not exists)
DO $$ BEGIN
  ALTER TABLE incidents ADD COLUMN resolution_note TEXT;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 5. Add escalation_count column (if not exists)
DO $$ BEGIN
  ALTER TABLE incidents ADD COLUMN escalation_count INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 6. Create indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_incidents_state ON incidents(state);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
