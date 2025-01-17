-- Add voice_status column to party_members table with default value 'silent'
ALTER TABLE party_members
ADD COLUMN voice_status text NOT NULL DEFAULT 'silent';

-- Add check constraint to ensure valid voice status values
ALTER TABLE party_members
ADD CONSTRAINT check_voice_status CHECK (voice_status IN ('silent', 'muted', 'speaking'));

-- Add index for performance
CREATE INDEX idx_party_members_voice_status
ON party_members(voice_status);

-- Update type definition
COMMENT ON COLUMN party_members.voice_status IS 'Current voice status of the member: silent, muted, or speaking'; 