-- ============================================
-- CALENDAR CREDENTIALS TABLE MIGRATION
-- ============================================
-- Stores Google Calendar OAuth credentials per user
-- 
-- Note: calendar_credentials uses arbitrary user_id (string)
-- since incidents table doesn't have a user_id column.
-- This allows multiple OAuth users independent of incident records.
-- ============================================

BEGIN;

-- 1. Create calendar_credentials table
--    Stores Google OAuth tokens with NO foreign key constraint
--    (user_id is arbitrary application-level identifier)
CREATE TABLE IF NOT EXISTS calendar_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- 2. Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_credentials_user_id 
  ON calendar_credentials(user_id);

-- 3. Create index on token_expiry for finding expired tokens
CREATE INDEX IF NOT EXISTS idx_calendar_credentials_token_expiry 
  ON calendar_credentials(token_expiry);

-- 4. Create table for tracking synced calendar events (idempotency)
--    Links Google Calendar events to system events
CREATE TABLE IF NOT EXISTS calendar_event_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT DEFAULT 'google',
  calendar_event_id VARCHAR(500) NOT NULL,
  event_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE(provider, calendar_event_id)
);

-- 5. Create index on user_id for lookups
CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_user_id 
  ON calendar_event_mappings(user_id);

-- 6. Create index on provider + calendar_event_id for idempotency checks
CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_provider_event 
  ON calendar_event_mappings(provider, calendar_event_id);

COMMIT;
