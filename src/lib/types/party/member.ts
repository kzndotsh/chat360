// Voice status types
export type VoiceStatus =
  | 'disconnected'
  | 'error'
  | 'muted'
  | 'reconnecting'
  | 'silent'
  | 'speaking';

// Member status types
export type MemberStatus = 'active' | 'idle' | 'left';

// Base member data
export interface PartyMember {
  avatar: string;
  created_at: string;
  game: string;
  id: string;
  is_active: boolean;
  last_seen: string;
  name: string;
  status: MemberStatus;
  agora_uid?: string;
  partyId?: string;  // Optional party ID for dynamic channel assignment
}

// Voice-specific member state
export interface VoiceMemberState {
  id: string;
  is_deafened: boolean;
  level: number;
  muted: boolean;
  voice_status: VoiceStatus;
  agora_uid?: string;
  last_transition?: number; // For debouncing state changes
  prev_level?: number;      // For tracking level changes
  smoothed_level?: number;  // For smoothing volume transitions
  timestamp?: number;
}

// Combined presence member state
export interface PresenceMemberState extends PartyMember {
  is_deafened: boolean;
  level: number;
  muted: boolean;
  voice_status: VoiceStatus;
  prev_state?: VoiceMemberState; // Previous state for hysteresis
  timestamp?: number; // Optional timestamp for tracking update order
}

export function createPartyMember(data: Partial<PartyMember>): PartyMember {
  return {
    id: data.id || '',
    name: data.name || 'Unknown',
    avatar: data.avatar || '',
    game: data.game || 'Unknown',
    created_at: data.created_at || new Date().toISOString(),
    last_seen: data.last_seen || new Date().toISOString(),
    is_active: data.is_active ?? true,
    status: data.status || 'active',
    agora_uid: data.agora_uid,
    partyId: data.partyId,
  };
}
