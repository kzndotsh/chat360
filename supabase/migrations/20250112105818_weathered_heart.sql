/*
  # Fix Agora UID Constraint Issues

  1. Changes
    - Drop existing unique constraint on agora_uid
    - Add new composite unique constraint on (agora_uid, is_active)
    - Add cleanup function for inactive members
    - Add index for active members lookup

  2. Purpose
    - Allow reuse of agora_uid when member becomes inactive
    - Prevent duplicate active agora_uid entries
    - Improve query performance for active members
*/

-- Drop existing unique constraint and indexes
DROP INDEX IF EXISTS idx_party_members_agora_uid;
DROP INDEX IF EXISTS idx_party_members_agora_uid_lookup;

-- Create new composite unique index that only enforces uniqueness for active members
CREATE UNIQUE INDEX idx_party_members_active_agora_uid 
ON party_members(agora_uid, is_active) 
WHERE agora_uid IS NOT NULL AND is_active = true;

-- Create function to cleanup old inactive members
CREATE OR REPLACE FUNCTION cleanup_inactive_members()
RETURNS TRIGGER AS $$
BEGIN
  -- Set agora_uid to NULL when member becomes inactive
  IF NEW.is_active = false THEN
    NEW.agora_uid = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for cleanup
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_cleanup_inactive_members'
  ) THEN
    CREATE TRIGGER trigger_cleanup_inactive_members
      BEFORE UPDATE OF is_active ON party_members
      FOR EACH ROW
      EXECUTE FUNCTION cleanup_inactive_members();
  END IF;
END $$;

-- Add index for active members lookup
CREATE INDEX IF NOT EXISTS idx_party_members_active 
ON party_members(is_active) 
WHERE is_active = true;