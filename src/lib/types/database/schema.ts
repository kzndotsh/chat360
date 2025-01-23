export type Json = boolean | number | string | Json[] | { [key: string]: Json | undefined } | null;

export interface Database {
  public: {
    Tables: {
      party_members: {
        Row: {
          agora_uid: number | null;
          avatar: string;
          created_at: string | null;
          deafened_users: string[] | null;
          game: string;
          id: string;
          is_active: boolean | null;
          last_seen: string | null;
          muted: boolean | null;
          name: string;
          voice_status: string;
        };
        Insert: {
          agora_uid?: number | null;
          avatar: string;
          created_at?: string | null;
          deafened_users?: string[] | null;
          game: string;
          id?: string;
          is_active?: boolean | null;
          last_seen?: string | null;
          muted?: boolean | null;
          name: string;
          voice_status?: string;
        };
        Update: {
          agora_uid?: number | null;
          avatar?: string;
          created_at?: string | null;
          deafened_users?: string[] | null;
          game?: string;
          id?: string;
          is_active?: boolean | null;
          last_seen?: string | null;
          muted?: boolean | null;
          name?: string;
          voice_status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_active_members:
        | {
            Args: Record<PropertyKey, never>;
            Returns: {
              id: string;
              name: string;
              avatar: string;
              game: string;
              is_active: boolean;
              muted: boolean;
              voice_status: string;
              deafened_users: string[];
              agora_uid: number;
              last_seen: string;
              created_at: string;
            }[];
          }
        | {
            Args: {
              stale_threshold: string;
            };
            Returns: {
              id: string;
              name: string;
              avatar: string;
              game: string;
              is_active: boolean;
              muted: boolean;
              voice_status: string;
              deafened_users: string[];
              agora_uid: number;
              last_seen: string;
              created_at: string;
            }[];
          };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
