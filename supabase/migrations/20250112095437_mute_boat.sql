/*
  # Add Agora UID Column

  1. Changes
    - Add `agora_uid` column to `party_members` table to store Agora voice chat user IDs
    - Add index on `agora_uid` for faster lookups
    - Add constraint to ensure `agora_uid` is unique when not null

  2. Security
    - No changes to RLS policies needed as the column inherits existing table policies
*/

-- Add agora_uid column
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'party_members' AND column_name = 'agora_uid'
  ) THEN
    ALTER TABLE party_members 
    ADD COLUMN agora_uid bigint NULL;

    -- Add unique constraint that allows multiple nulls
    CREATE UNIQUE INDEX idx_party_members_agora_uid 
    ON party_members(agora_uid) 
    WHERE agora_uid IS NOT NULL;

    -- Add index for performance
    CREATE INDEX idx_party_members_agora_uid_lookup
    ON party_members(agora_uid)
    WHERE agora_uid IS NOT NULL;
  END IF;
END $$;