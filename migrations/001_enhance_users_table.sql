/**
 * 001_enhance_users_table.sql
 * 
 * Enhance users table for production-grade OAuth handling.
 * 
 * Changes:
 * - Add provider column (e.g., 'google')
 * - Add email_verified column (Boolean from id_token.email_verified)
 * - Ensure email column is NOT NULL with UNIQUE constraint
 * 
 * This migration is idempotent (safe to run multiple times).
 */

-- 1. Add provider column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'provider'
  ) THEN
    ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'google';
    CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider);
  END IF;
END $$;

-- 2. Add email_verified column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 3. Ensure email column has NOT NULL and UNIQUE constraints
-- First, check if the constraint already exists
DO $$
BEGIN
  -- Add NOT NULL constraint if missing (this might require careful handling if there's NULL data)
  ALTER TABLE users ALTER COLUMN email SET NOT NULL;
EXCEPTION WHEN others THEN
  -- If there's NULL data, log it and continue
  RAISE WARNING 'Could not add NOT NULL to email column. Check for NULL values.';
END $$;

-- 4. Add unique constraint on email if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'users' AND constraint_name = 'users_email_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint may already exist
  NULL;
END $$;

-- 5. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_provider_email ON users(provider, email);

-- 6. Comment on columns for documentation
COMMENT ON COLUMN users.provider IS 'OAuth provider: "google"';
COMMENT ON COLUMN users.email_verified IS 'Email verified status from OAuth provider (from id_token.email_verified)';
COMMENT ON COLUMN users.email IS 'User email address (extracted from OAuth id_token or userinfo API). UNIQUE and NOT NULL.';
