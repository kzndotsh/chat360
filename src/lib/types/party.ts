export interface PartyMember {
  id: string;
  name: string;
  avatar: string;
  game: string;
  is_active: boolean;
  created_at: string;
  last_seen: string;
  voice_status?: 'silent' | 'muted' | 'speaking';
  muted?: boolean;
  agora_uid?: number;
  deafened_users?: string[];
}

export interface PresenceMemberState {
  id: string;
  name: string;
  avatar: string;
  game: string;
  online_at: string;
  voice_status?: 'silent' | 'muted' | 'speaking';
  muted?: boolean;
  agora_uid?: number;
  deafened_users?: string[];
}
