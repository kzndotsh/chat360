export interface PartyMember {
  id: string;
  name: string;
  avatar: string;
  game: string;
  is_active: boolean;
  muted: boolean;
  agora_uid?: number | null;
  created_at?: string;
  last_seen?: string;
}
