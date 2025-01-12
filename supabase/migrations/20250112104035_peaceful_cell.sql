/*
  # Party Members Schema

  1. New Tables
    - `party_members`
      - `id` (uuid, primary key)
      - `name` (text)
      - `avatar` (text)
      - `game` (text)
      - `muted` (boolean)
      - `is_active` (boolean)
      - `last_seen` (timestamp)
      - `created_at` (timestamp)
      - `agora_uid` (bigint, nullable)

  2. Security
    - Enable RLS on `party_members` table
    - Add policies for public read/write access
    - Add unique constraint on agora_uid

  3. Performance
    - Add indexes for is_active and last_seen
    - Add index for agora_uid lookups
*/

-- Create party_members table
CREATE TABLE IF NOT EXISTS party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar text NOT NULL,
  game text NOT NULL,
  muted boolean DEFAULT false,
  is_active boolean DEFAULT true,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  agora_uid bigint NULL
);

-- Enable RLS
ALTER TABLE party_members ENABLE ROW LEVEL SECURITY;

-- Create function to update last_seen
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last_seen updates
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_member_last_seen'
  ) THEN
    CREATE TRIGGER update_member_last_seen
      BEFORE UPDATE ON party_members
      FOR EACH ROW
      EXECUTE FUNCTION update_last_seen();
  END IF;
END $$;

-- Create public access policies
CREATE POLICY "Allow public read"
  ON party_members
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON party_members
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update"
  ON party_members
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete"
  ON party_members
  FOR DELETE
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_party_members_is_active 
  ON party_members(is_active);

CREATE INDEX IF NOT EXISTS idx_party_members_last_seen 
  ON party_members(last_seen DESC);

-- Add unique constraint for agora_uid that allows nulls
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_members_agora_uid 
  ON party_members(agora_uid) 
  WHERE agora_uid IS NOT NULL;

-- Add index for agora_uid lookups
CREATE INDEX IF NOT EXISTS idx_party_members_agora_uid_lookup
  ON party_members(agora_uid)
  WHERE agora_uid IS NOT NULL;