/*
  # Party Members Schema

  1. Tables
    - party_members
      - Core fields for member data (id, name, avatar, game)
      - Voice chat integration via agora_uid
      - Activity tracking with is_active and last_seen
      - Automatic timestamp management

  2. Functions & Triggers
    - update_last_seen() - Updates last_seen timestamp on member updates
    - cleanup_inactive_members() - Cleans up agora_uid when member becomes inactive
    - get_active_members() - Atomic cleanup and fetch of active members

  3. Indexes & Constraints
    - Primary key on id
    - Composite unique index on (agora_uid, is_active) for active members
    - Performance indexes for common queries
*/

-- First clean up any existing objects
DO $$ 
BEGIN
  -- Drop triggers if table exists
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'party_members') THEN
    DROP TRIGGER IF EXISTS trigger_cleanup_inactive_members ON party_members;
    DROP TRIGGER IF EXISTS update_member_last_seen ON party_members;
  END IF;

  -- Drop functions
  DROP FUNCTION IF EXISTS get_active_members(timestamptz);
  DROP FUNCTION IF EXISTS cleanup_inactive_members();
  DROP FUNCTION IF EXISTS update_last_seen();

  -- Drop indexes if table exists
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'party_members') THEN
    DROP INDEX IF EXISTS idx_party_members_active_seen;
    DROP INDEX IF EXISTS idx_party_members_active;
    DROP INDEX IF EXISTS idx_party_members_active_agora_uid;
    DROP INDEX IF EXISTS idx_party_members_agora_uid;
    DROP INDEX IF EXISTS idx_party_members_agora_uid_lookup;
    DROP INDEX IF EXISTS idx_party_members_is_active;
    DROP INDEX IF EXISTS idx_party_members_last_seen;
  END IF;

  -- Drop table
  DROP TABLE IF EXISTS party_members;
END $$;

-- Create party_members table
CREATE TABLE party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  avatar text NOT NULL,
  game text NOT NULL,
  muted boolean DEFAULT false,
  is_active boolean DEFAULT true,
  agora_uid bigint NULL,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE party_members ENABLE ROW LEVEL SECURITY;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE party_members;

-- Create function to update last_seen
CREATE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last_seen updates
CREATE TRIGGER update_member_last_seen
  BEFORE UPDATE ON party_members
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen();

-- Create function to cleanup inactive members
CREATE FUNCTION cleanup_inactive_members()
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
CREATE TRIGGER trigger_cleanup_inactive_members
  BEFORE UPDATE OF is_active ON party_members
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_inactive_members();

-- Create public access policies
CREATE POLICY "Allow public read"
  ON party_members FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON party_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update"
  ON party_members FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete"
  ON party_members FOR DELETE
  USING (true);

-- Create indexes for performance
CREATE INDEX idx_party_members_active 
ON party_members(is_active) 
WHERE is_active = true;

CREATE INDEX idx_party_members_last_seen 
ON party_members(last_seen DESC);

-- Create composite unique index for active agora users
CREATE UNIQUE INDEX idx_party_members_active_agora_uid 
ON party_members(agora_uid, is_active) 
WHERE agora_uid IS NOT NULL AND is_active = true;

-- Create function to get active members with atomic cleanup
CREATE FUNCTION get_active_members(stale_threshold timestamptz)
RETURNS TABLE (
  id text,
  name text,
  avatar text,
  game text,
  is_active boolean,
  muted boolean,
  agora_uid bigint,
  last_seen timestamptz,
  created_at timestamptz
) AS $$
DECLARE
  cleanup_count integer;
BEGIN
  -- First cleanup stale members
  WITH cleanup AS (
    UPDATE party_members
    SET is_active = false,
        agora_uid = null,
        last_seen = now()
    WHERE party_members.is_active = true
    AND party_members.last_seen < stale_threshold
    RETURNING 1
  )
  SELECT count(*) INTO cleanup_count FROM cleanup;

  -- Then return active members
  RETURN QUERY
  SELECT
    pm.id::text,
    pm.name,
    pm.avatar,
    pm.game,
    pm.is_active,
    pm.muted,
    pm.agora_uid,
    pm.last_seen,
    pm.created_at
  FROM party_members pm
  WHERE pm.is_active = true
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 