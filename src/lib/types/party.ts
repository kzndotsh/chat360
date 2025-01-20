export type VoiceStatus = 'silent' | 'muted' | 'speaking' | 'deafened';

export interface PartyMember {
  id: string;
  name: string;
  avatar: string;
  game: string;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  voice_status?: VoiceStatus;
  muted?: boolean;
  agora_uid?: number;
  deafened_users?: string[];
  presence_ref?: string;
  _lastUpdate?: number;
  _lastVoiceUpdate?: number;
}

export interface PresenceMemberState {
  id: string;
  name: string;
  avatar: string;
  game: string;
  muted?: boolean;
  online_at?: string;
  voice_status?: VoiceStatus;
  deafened_users?: string[];
  agora_uid?: string;
  _lastUpdate?: number;
}
