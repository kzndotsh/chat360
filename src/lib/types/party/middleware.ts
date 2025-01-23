import type { PartyMember } from './member';
import type { Store } from './store';

// Modal types
export type ModalType = 'join' | 'profile';

export interface ModalData {
  avatar: string;
  game: string;
  name: string;
}

export interface ModalStore {
  data: ModalData | null;
  isOpen: boolean;
  type: ModalType | null;
  hideModal: () => void;
  showModal: (type: ModalType, data: ModalData) => void;
}

// Form store types
export interface FormData {
  avatar: string;
  game: string;
  name: string;
}

export interface FormStore {
  errors: Record<keyof FormData, string | undefined>;
  formData: FormData;
  isSubmitting: boolean;
  lastUsedData: FormData | null;
  initializeFromMember: (member: PartyMember) => void;
  initializeWithLastUsed: () => void;
  resetForm: () => void;
  saveLastUsedData: (data: FormData) => void;
  setError: (field: keyof FormData, error: string | undefined) => void;
  setFormData: (data: Partial<FormData>) => void;
  setSubmitting: (isSubmitting: boolean) => void;
}

// Form middleware types
export type FormSlice = Pick<
  Store,
  'form' | 'resetForm' | 'setFormData' | 'setFormError' | 'setSubmitting'
>;

// Voice middleware types
export type VoiceSlice = Pick<
  Store,
  | 'setMuted'
  | 'setSpeaking'
  | 'setVoiceError'
  | 'setVoiceStatus'
  | 'setVolume'
  | 'updateRemoteUsers'
  | 'voice'
>;

// Party middleware types
export type PartySlice = Pick<
  Store,
  'joinParty' | 'leaveParty' | 'party' | 'setPartyError' | 'setPartyStatus'
>;

// Presence middleware types
export type PresenceSlice = Pick<
  Store,
  'cleanupPresence' | 'initializePresence' | 'presence' | 'updatePresence'
>;
