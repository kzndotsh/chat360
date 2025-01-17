-- Drop existing function
DROP FUNCTION IF EXISTS get_active_members(timestamptz);

-- Recreate function with updated return type
CREATE FUNCTION get_active_members(stale_threshold timestamptz)
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
    pm.voice_status,
    pm.deafened_users,
    pm.agora_uid,
    pm.last_seen,
    pm.created_at
  FROM party_members pm
  WHERE pm.is_active = true
  ORDER BY pm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 