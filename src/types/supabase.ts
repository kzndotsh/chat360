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
          deafened_users: string[];
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
          deafened_users?: string[];
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
          deafened_users?: string[];
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_active_members: {
        Args: { stale_threshold: string };
        Returns: {
          id: string;
          name: string;
          avatar: string;
          game: string;
          is_active: boolean;
          muted: boolean;
          agora_uid: number | null;
          last_seen: string;
          created_at: string;
          deafened_users: string[];
        }[];
      };
      update_last_seen: {
        Args: Record<string, never>;
        Returns: void;
      };
      cleanup_inactive_members: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
  };
}
