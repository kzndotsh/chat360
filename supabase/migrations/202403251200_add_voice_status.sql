ALTER TABLE party_members ADD COLUMN IF NOT EXISTS "voice_status" text DEFAULT 'silent' NOT NULL;

-- Update the get_active_members function to include the new column
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
  last_seen timestamptz,
  created_at timestamptz
) AS $$
BEGIN
  -- Clean up stale members first
  UPDATE party_members
  SET is_active = false
  WHERE is_active = true
  AND last_seen < NOW() - INTERVAL '5 minutes';

  -- Return active members
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
    pm.last_seen,
    pm.created_at
  FROM party_members pm
  WHERE pm.is_active = true
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql;
