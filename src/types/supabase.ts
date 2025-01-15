export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      party_members: {
        Row: {
          id: string;
          name: string;
          avatar: string;
          game: string;
          muted: boolean;
          is_active: boolean;
          last_seen: string;
          created_at: string;
          agora_uid: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          avatar: string;
          game: string;
          muted?: boolean;
          is_active?: boolean;
          last_seen?: string;
          created_at?: string;
          agora_uid?: number | null;
        };
        Update: {
          id?: string;
          name?: string;
          avatar?: string;
          game?: string;
          muted?: boolean;
          is_active?: boolean;
          last_seen?: string;
          created_at?: string;
          agora_uid?: number | null;
        };
      };
    };
  };
}
