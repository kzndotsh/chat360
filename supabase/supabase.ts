export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
};

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes']
    ? PublicSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

// Schema: public
// Tables
export type PartyMembers = Database['public']['Tables']['party_members']['Row'];
export type InsertPartyMembers = Database['public']['Tables']['party_members']['Insert'];
export type UpdatePartyMembers = Database['public']['Tables']['party_members']['Update'];

// Functions
export type ArgsGetActiveMembers = Database['public']['Functions']['get_active_members']['Args'];
export type ReturnTypeGetActiveMembers =
  Database['public']['Functions']['get_active_members']['Returns'];
