import { VoiceStatus } from '@/components/ui/VoiceStatusIcon';

export interface PartyMember {
  id: string;
  name: string;
  avatar_url?: string;
  avatar?: string; // For backward compatibility
  game?: string;
  muted?: boolean;
  agora_uid?: string;
  is_active?: boolean;
  voiceStatus: VoiceStatus;
  deafenedUsers?: string[]; // Array of user IDs that this member has deafened
  created_at?: string;
  last_seen?: string;
}

export interface Party {
  id: string;
  name: string;
  host_id: string;
  members: PartyMember[];
  created_at: string;
  updated_at: string;
  channel_name: string; // Agora channel name
}

export interface PartyPresence {
  online_at: string;
  voiceStatus: VoiceStatus;
  deafenedUsers: string[];
}

export interface PresenceMemberState {
  id: string;
  name: string;
  avatar: string;
  game: string;
  muted: boolean;
  agoraUid: string;
  online_at: string;
  voiceStatus: VoiceStatus;
  deafenedUsers?: string[];
}
