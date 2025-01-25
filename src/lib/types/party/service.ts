import type { PartyMember, VoiceMemberState, MemberStatus } from './member';

// Service state interfaces
export interface PresenceServiceState {
  status: 'connected' | 'connecting' | 'error' | 'idle';
  error?: Error;
}

// Presence member state for tracking
export interface PresenceMemberState extends PartyMember {
  status: MemberStatus;
  is_deafened?: boolean;
  level?: number;
  // Voice-related properties
  muted?: boolean;
  voice_status?: VoiceMemberState['voice_status'];
}

// Presence service types
export interface PresenceListener {
  (members: PartyMember[]): void;
}

export interface StateUpdate {
  type: 'cleanup' | 'join' | 'leave' | 'sync' | 'track';
  payload?: unknown;
}

export interface QueuedStateUpdate extends StateUpdate {
  reject: (error: Error) => void;
  resolve: (value: void) => void;
}

export interface TrackResult {
  trackResult: 'error' | 'ok';
  error?: Error;
  memberCount?: number;
  trackedMemberId?: string;
}
