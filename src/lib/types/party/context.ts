import type { PartyMember, VoiceMemberState } from './member';
import type { PartyState } from './state';

export interface PartyContextType {
  currentMember: PartyMember | null;
  error: Error | null;
  isLeaving: boolean;
  isMuted: boolean;
  members: PartyMember[];
  micPermissionDenied: boolean;
  partyState: PartyState;
  volumeLevels: Record<string, VoiceMemberState>;
  join: (member: PartyMember) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  updateProfile: (profile: Partial<PartyMember>) => Promise<void>;
}
