import type { PartyMember } from './member';

// Status types
export type PresenceStatus = 'connected' | 'connecting' | 'error' | 'idle';
export type VoiceConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'idle'
  | 'permission_denied'
  | 'requesting_permissions';
export type PartyStatus = 'idle' | 'joined' | 'joining' | 'leaving';

// Store state interfaces
export interface PresenceState {
  currentMember: PartyMember | null;
  error: Error | null;
  members: Map<string, PartyMember>;
  status: PresenceStatus;
}

export interface VoiceState {
  error: Error | null;
  isMuted: boolean;
  isSpeaking: boolean;
  remoteUsers: Set<string>;
  status: VoiceConnectionStatus;
  volume: number;
}

export interface PartyState {
  error: Error | null;
  status: PartyStatus;
}

export interface FormState {
  avatar: string;
  errors: Record<string, string>;
  game: string;
  isSubmitting: boolean;
  name: string;
}
