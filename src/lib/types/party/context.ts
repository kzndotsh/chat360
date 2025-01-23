import type { PartyMember } from './member';
import type { PartyState } from './state';
import type { VolumeData } from './voice';

export interface PartyContextType {
  currentMember: PartyMember | null;
  error: Error | null;
  isLeaving: boolean;
  isMuted: boolean;
  members: PartyMember[];
  micPermissionDenied: boolean;
  partyState: PartyState;
  volumeLevels: Record<string, VolumeData>;
  join: (member: PartyMember) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<boolean>;
  updateProfile: (profile: Partial<PartyMember>) => Promise<void>;
}
