-- ============================================
-- GENERALIZED EVENTS TABLE MIGRATION
-- ============================================
-- Updates events table to support multiple sources and categories
-- Events are FACTS only - no incident logic here
-- ============================================

BEGIN;

-- 1. Create event source ENUM (if not exists)
DO $$ BEGIN
  CREATE TYPE event_source AS ENUM (
    'CALENDAR',
    'EMAIL',
    'API',
    'MANUAL',
    'WEBHOOK'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Add source column (if not exists)
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN source event_source NOT NULL DEFAULT 'API';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 3. Add category column (if not exists)
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'OTHER';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 4. Add occurred_at column (if not exists)
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN occurred_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 5. Add updated_at column (if not exists)
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 6. Update payload column to be named payload if not exists
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN payload JSONB NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN null;
END $$;

-- 7. Create/update indexes
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_category_time ON events(user_id, category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_occurred ON events(user_id, occurred_at DESC);

-- 8. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_update_timestamp ON events;
CREATE TRIGGER events_update_timestamp
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION update_events_timestamp();

-- 9. Add comments for clarity
COMMENT ON TABLE events IS 'Generalized events table. Supports multiple sources and categories. Events are immutable facts.';
COMMENT ON COLUMN events.user_id IS 'User associated with this event';
COMMENT ON COLUMN events.source IS 'Source of the event: CALENDAR, EMAIL, API, MANUAL, WEBHOOK';
COMMENT ON COLUMN events.category IS 'Category: MEETING, FINANCE, HEALTH, DELIVERY, SECURITY, OTHER';
COMMENT ON COLUMN events.type IS 'Event type (e.g., MEETING_SCHEDULED, PAYMENT_FAILED, etc)';
COMMENT ON COLUMN events.payload IS 'JSON payload containing event-specific data';
COMMENT ON COLUMN events.occurred_at IS 'When the event occurred (not when it was recorded)';

COMMIT;



