-- Add party_id column to party_members table with a constant value
ALTER TABLE party_members ADD COLUMN party_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111'::uuid;

-- Add index for active members in the party
CREATE INDEX idx_party_members_active_party
ON party_members(party_id, is_active)
WHERE is_active = true;

-- Update get_active_members function to include party_id
CREATE OR REPLACE FUNCTION get_active_members()
RETURNS TABLE (
  id text,
  name text,
  avatar text,
  game text,
  is_active boolean,
  muted boolean,
  voice_status text,
  deafened_users text[],
  agora_uid bigint,
  party_id uuid,
  last_seen timestamptz,
  created_at timestamptz
) AS $$
BEGIN
  -- Clean up stale members first
  UPDATE party_members
  SET is_active = false
  WHERE is_active = true
  AND last_seen < NOW() - INTERVAL '5 minutes';

  -- Return active members (always from the single party)
  RETURN QUERY
  SELECT
    pm.id,
    pm.name,
    pm.avatar,
    pm.game,
    pm.is_active,
    pm.muted,
    pm.voice_status,
    pm.deafened_users,
    pm.agora_uid,
    pm.party_id,
    pm.last_seen,
    pm.created_at
  FROM party_members pm
  WHERE pm.is_active = true
  AND pm.party_id = '11111111-1111-1111-1111-111111111111'::uuid
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql;
