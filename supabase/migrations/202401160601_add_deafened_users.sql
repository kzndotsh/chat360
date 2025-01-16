-- Add deafenedUsers column to party_members table
ALTER TABLE party_members
ADD COLUMN deafened_users text[] DEFAULT '{}';

-- Add index for performance
CREATE INDEX idx_party_members_deafened_users
ON party_members USING gin(deafened_users);

-- Update type definition
COMMENT ON COLUMN party_members.deafened_users IS 'Array of user IDs that this member has deafened'; 