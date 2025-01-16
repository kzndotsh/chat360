export type PartyMember = {
  id: string;
  name: string;
  avatar: string;
  game: string;
  is_active: boolean;
  muted: boolean;
  created_at: string;
  last_seen: string;
  agora_uid?: number | null;
};

export type PresenceMemberState = {
  id: string;
  name: string;
  avatar: string;
  game: string;
  online_at: string;
  muted: boolean;
  agoraUid?: number | null;
};

export type PartyState = {
  currentUser: PartyMember | null;
  members: PartyMember[];
  isInitializing: boolean;
  isLeavingParty: boolean;
  modalLocked: boolean;
};

export type PartyActions = {
  joinParty: (name: string, avatar: string, game: string) => Promise<void>;
  leaveParty: () => Promise<void>;
};
