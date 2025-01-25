import type { PartyMember } from './member';
import type {
  FormState,
  PartyState,
  PresenceState,
  VoiceConnectionStatus,
  VoiceState,
} from './state';

// Store interface
export interface Store {
  form: FormState;
  party: PartyState;
  // State
  presence: PresenceState;
  voice: VoiceState;
  cleanupPresence: () => Promise<void>;
  // Presence actions
  initializePresence: (member: PartyMember) => Promise<void>;
  joinParty: (member: PartyMember) => Promise<void>;
  leaveParty: () => Promise<void>;
  resetForm: () => void;
  // Form actions
  setFormData: (data: Partial<FormState>) => void;
  setFormError: (field: string, error: string) => void;
  setMuted: (isMuted: boolean) => void;
  setPartyError: (error: Error | null) => void;
  // Party actions
  setPartyStatus: (status: PartyState['status']) => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  setVoiceError: (error: Error | null) => void;
  // Voice actions
  setVoiceStatus: (status: VoiceConnectionStatus) => void;
  setVolume: (volume: number) => void;
  subscribeAsVisitor: () => Promise<void>;
  updatePresence: (updates: Partial<PartyMember>) => Promise<void>;
  updateRemoteUsers: (users: Set<string>) => void;
}
