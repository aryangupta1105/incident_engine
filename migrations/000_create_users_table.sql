/**
 * 000_create_users_table.sql
 * 
 * Core user profile table.
 * 
 * Purpose:
 * - Store user contact information
 * - Enable email delivery to known users
 * - Support OAuth user mapping
 * 
 * Design:
 * - UUID primary key (matches OAuth user IDs)
 * - Email unique constraint (one email per user)
 * - No authentication fields (OAuth handles auth)
 * - No roles/permissions (add later if needed)
 * 
 * Usage:
 * - Alert worker queries: SELECT email FROM users WHERE id = $1
 * - OAuth stores email: INSERT INTO users (id, email, name) VALUES (...)
 * - Calendar sync references: SELECT * FROM users WHERE id = $1
 */

-- Table already exists from previous version
-- This migration just ensures the structure is correct
-- Add name column if it doesn't exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE users ADD COLUMN name TEXT;
  END IF;
END $$;

-- Add updated_at column if it doesn't exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Create indexes if they don't exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
