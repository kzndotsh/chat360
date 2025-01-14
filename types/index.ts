export interface PartyMember {
  id: string;
  name: string;
  game: string;
  muted: boolean;
  avatar: string;
  isActive: boolean;
  agora_uid?: string | null;
}
