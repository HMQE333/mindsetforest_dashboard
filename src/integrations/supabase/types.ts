export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      archive_blocks: {
        Row: {
          content: string
          created_at: string
          directions: string[]
          embedding: string | null
          id: string
          is_pinned: boolean
          pillars: string[]
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          directions?: string[]
          embedding?: string | null
          id?: string
          is_pinned?: boolean
          pillars?: string[]
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          directions?: string[]
          embedding?: string | null
          id?: string
          is_pinned?: boolean
          pillars?: string[]
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      block_reviews: {
        Row: {
          block_id: string
          id: string
          rating: number
          reviewed_at: string
          user_id: string
        }
        Insert: {
          block_id: string
          id?: string
          rating?: number
          reviewed_at?: string
          user_id: string
        }
        Update: {
          block_id?: string
          id?: string
          rating?: number
          reviewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_reviews_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "archive_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_completions: {
        Row: {
          categories_engaged: string[]
          completed_mission_titles: string[]
          created_at: string
          date: string
          id: string
          missions_completed: number
          user_id: string
          xp_earned: number
        }
        Insert: {
          categories_engaged?: string[]
          completed_mission_titles?: string[]
          created_at?: string
          date: string
          id?: string
          missions_completed?: number
          user_id: string
          xp_earned?: number
        }
        Update: {
          categories_engaged?: string[]
          completed_mission_titles?: string[]
          created_at?: string
          date?: string
          id?: string
          missions_completed?: number
          user_id?: string
          xp_earned?: number
        }
        Relationships: []
      }
      dashboard_state: {
        Row: {
          categories_engaged: string[]
          completed_missions: string[]
          created_at: string
          current_level: number
          current_xp: number
          custom_missions: Json
          day_key: string | null
          id: string
          last_completion_date: string | null
          missions_completed: number
          streak_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          categories_engaged?: string[]
          completed_missions?: string[]
          created_at?: string
          current_level?: number
          current_xp?: number
          custom_missions?: Json
          day_key?: string | null
          id?: string
          last_completion_date?: string | null
          missions_completed?: number
          streak_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          categories_engaged?: string[]
          completed_missions?: string[]
          created_at?: string
          current_level?: number
          current_xp?: number
          custom_missions?: Json
          day_key?: string | null
          id?: string
          last_completion_date?: string | null
          missions_completed?: number
          streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_loops: {
        Row: {
          category_id: string
          created_at: string
          current_loop: number
          id: string
          loops: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string
          created_at?: string
          current_loop?: number
          id?: string
          loops?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          current_loop?: number
          id?: string
          loops?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ladder_state: {
        Row: {
          active_category: string | null
          created_at: string
          id: string
          ladders: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          active_category?: string | null
          created_at?: string
          id?: string
          ladders?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          active_category?: string | null
          created_at?: string
          id?: string
          ladders?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oracle_state: {
        Row: {
          created_at: string
          custom_rewards: Json
          id: string
          oracle_xp: number
          rewards_purchased: Json
          total_xp_sacrificed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_rewards?: Json
          id?: string
          oracle_xp?: number
          rewards_purchased?: Json
          total_xp_sacrificed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_rewards?: Json
          id?: string
          oracle_xp?: number
          rewards_purchased?: Json
          total_xp_sacrificed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tracker_entries: {
        Row: {
          created_at: string
          date: string
          id: string
          metric_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metric_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metric_id?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      user_metrics: {
        Row: {
          category_id: string
          color_var: string
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
          unit: string
          user_id: string
        }
        Insert: {
          category_id?: string
          color_var?: string
          created_at?: string
          icon?: string
          id?: string
          label: string
          sort_order?: number
          unit?: string
          user_id: string
        }
        Update: {
          category_id?: string
          color_var?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          unit?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed: boolean
          created_at: string
          custom_categories: Json
          id: string
          preferences: Json
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          custom_categories?: Json
          id?: string
          preferences?: Json
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          custom_categories?: Json
          id?: string
          preferences?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_projects: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          parent_category: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          parent_category?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          parent_category?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_archive_blocks: {
        Args: {
          match_count?: number
          match_threshold?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          directions: string[]
          id: string
          is_pinned: boolean
          pillars: string[]
          similarity: number
          source_url: string
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
