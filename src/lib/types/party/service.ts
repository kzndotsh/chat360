import type { PartyMember, VoiceStatus } from './member';
import type { PresenceStatus } from './state';

// Service state interfaces
export interface PresenceServiceState {
  status: PresenceStatus;
  error?: Error;
}

export interface VoiceServiceState {
  isConnecting: boolean;
  lastVolumeUpdate: number;
  reconnectAttempts: number;
  volumeLevel: number;
}

// Voice service state
export interface VoiceServiceInternalState {
  isConnecting: boolean;
  lastVolumeUpdate: number;
  reconnectAttempts: number;
  volumeLevel: number;
}

// Presence service types
export interface PresenceMemberState {
  id: string;
  agora_uid?: number;
  avatar?: string;
  created_at?: string;
  game?: string;
  is_deafened?: boolean;
  last_seen?: string;
  muted?: boolean;
  name?: string;
  status?: string;
  voice_status?: VoiceStatus;
  volumeLevel?: number;
}

export interface PresenceListener {
  (members: PartyMember[]): void;
}

export interface TrackResult {
  trackResult: 'error' | 'ok';
  error?: Error;
  memberCount?: number;
  trackedMemberId?: string;
}

export interface StateUpdate {
  type: 'cleanup' | 'join' | 'leave' | 'sync' | 'track';
  payload?: unknown;
}

export interface QueuedStateUpdate extends StateUpdate {
  reject: (error: Error) => void;
  resolve: (value: void) => void;
}
