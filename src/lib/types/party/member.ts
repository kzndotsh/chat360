// Voice status types
export type VoiceStatus =
  | 'disconnected'
  | 'error'
  | 'muted'
  | 'reconnecting'
  | 'silent'
  | 'speaking';

// Member status types
export type MemberStatus = 'active' | 'left';

// Core member type with essential properties
export interface PartyMember {
  avatar: string;
  created_at: string;
  game: string;
  // Core identity (required)
  id: string;
  is_active: boolean;
  is_deafened: boolean; // Default: false
  last_seen: string;
  muted: boolean; // Default: false
  name: string;
  // Voice state (required with defaults)
  voice_status: VoiceStatus; // Default: 'silent'
  volumeLevel: number; // Default: 0
  _lastUpdate?: number; // Internal state tracking
  _lastVoiceUpdate?: number; // Internal voice state tracking
  // Optional system properties
  agora_uid?: number; // Voice connection ID
  presence_ref?: string; // Supabase presence tracking
  status?: MemberStatus; // Member presence status
}

// Helper to create a new party member with defaults
export const createPartyMember = (init: {
  id: string;
  name: string;
  avatar: string;
  game: string;
}): PartyMember => ({
  ...init,
  created_at: new Date().toISOString(),
  last_seen: new Date().toISOString(),
  is_active: true,
  voice_status: 'silent',
  muted: false,
  volumeLevel: 0,
  is_deafened: false,
  status: 'active',
});
