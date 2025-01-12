/*
  # Party Members Schema Setup

  1. New Tables
    - `party_members`
      - `id` (uuid, primary key) - Unique identifier for each member
      - `name` (text) - Member's display name
      - `avatar` (text) - URL to member's avatar image
      - `game` (text) - Current game/status
      - `muted` (boolean) - Voice chat mute status
      - `is_active` (boolean) - Whether member is currently in the party
      - `last_seen` (timestamptz) - Last activity timestamp
      - `created_at` (timestamptz) - Account creation timestamp

  2. Security
    - Enable RLS on `party_members` table
    - Create public access policies for all operations
    - Auto-update last_seen timestamp on record updates

  3. Changes
    - Initial schema creation
    - Setup automatic timestamp management
    - Configure public access policies
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
  created_at timestamptz DEFAULT now()
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

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_party_members_is_active 
  ON party_members(is_active);

-- Create index for last_seen queries
CREATE INDEX IF NOT EXISTS idx_party_members_last_seen 
  ON party_members(last_seen DESC);