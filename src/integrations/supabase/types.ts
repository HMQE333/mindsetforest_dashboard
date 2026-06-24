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
          from_seed_id: string | null
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
          from_seed_id?: string | null
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
          from_seed_id?: string | null
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
      breathing_sessions: {
        Row: {
          completed_at: string
          duration_seconds: number
          id: string
          pattern: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          duration_seconds?: number
          id?: string
          pattern?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          duration_seconds?: number
          id?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          color: string
          created_at: string
          date: string
          id: string
          notes: string
          tag: string
          title: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          date: string
          id?: string
          notes?: string
          tag?: string
          title: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string
          tag?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      cooking_ingredient_costs: {
        Row: {
          cost_per_unit: number
          created_at: string
          id: string
          ingredient_name: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string
          id?: string
          ingredient_name: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          id?: string
          ingredient_name?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cooking_plan_entries: {
        Row: {
          created_at: string
          custom_label: string
          id: string
          meal_type: string
          notes: string
          plan_date: string
          recipe_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_label?: string
          id?: string
          meal_type?: string
          notes?: string
          plan_date: string
          recipe_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          custom_label?: string
          id?: string
          meal_type?: string
          notes?: string
          plan_date?: string
          recipe_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cooking_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "cooking_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      cooking_recipes: {
        Row: {
          ai_processed_content: string | null
          cook_time: string
          cost_per_serving: number | null
          created_at: string
          description: string
          difficulty: string
          id: string
          ingredients: string
          instructions: string
          notes: string
          photo_url: string | null
          rating: number | null
          servings: number
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_processed_content?: string | null
          cook_time?: string
          cost_per_serving?: number | null
          created_at?: string
          description?: string
          difficulty?: string
          id?: string
          ingredients?: string
          instructions?: string
          notes?: string
          photo_url?: string | null
          rating?: number | null
          servings?: number
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_processed_content?: string | null
          cook_time?: string
          cost_per_serving?: number | null
          created_at?: string
          description?: string
          difficulty?: string
          id?: string
          ingredients?: string
          instructions?: string
          notes?: string
          photo_url?: string | null
          rating?: number | null
          servings?: number
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          rolled_variants: Json
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
          rolled_variants?: Json
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
          rolled_variants?: Json
          streak_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          kind: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      finance_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          id: string
          is_recurring: boolean
          is_settled: boolean
          notes: string
          person_name: string
          recurring_day: number | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          is_settled?: boolean
          notes?: string
          person_name?: string
          recurring_day?: number | null
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          is_settled?: boolean
          notes?: string
          person_name?: string
          recurring_day?: number | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      forest_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      forest_collection_seeds: {
        Row: {
          added_at: string
          collection_id: string
          seed_id: string
          sort_order: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          seed_id: string
          sort_order?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          seed_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "forest_collection_seeds_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "forest_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forest_collection_seeds_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      forest_collections: {
        Row: {
          created_at: string
          description: string
          emoji: string
          id: string
          is_public: boolean
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          is_public?: boolean
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          is_public?: boolean
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      forest_inbox_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          recipient_id: string
          seed_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          recipient_id: string
          seed_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id?: string
          seed_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forest_inbox_events_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      forest_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          seed_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id: string
          seed_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forest_reports_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      forest_saves: {
        Row: {
          created_at: string
          id: string
          saved_block_id: string | null
          seed_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          saved_block_id?: string | null
          seed_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          saved_block_id?: string | null
          seed_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forest_saves_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      forest_seed_audience: {
        Row: {
          seed_id: string
          user_id: string
        }
        Insert: {
          seed_id: string
          user_id: string
        }
        Update: {
          seed_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forest_seed_audience_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      forest_seeds: {
        Row: {
          author_id: string
          content: string
          directions: string[]
          embedding: string | null
          id: string
          is_active: boolean
          language: string
          pillars: string[]
          published_at: string
          save_count: number
          source_block_id: string | null
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
          view_count: number
          visibility: string
          water_count: number
        }
        Insert: {
          author_id: string
          content?: string
          directions?: string[]
          embedding?: string | null
          id?: string
          is_active?: boolean
          language?: string
          pillars?: string[]
          published_at?: string
          save_count?: number
          source_block_id?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
          water_count?: number
        }
        Update: {
          author_id?: string
          content?: string
          directions?: string[]
          embedding?: string | null
          id?: string
          is_active?: boolean
          language?: string
          pillars?: string[]
          published_at?: string
          save_count?: number
          source_block_id?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
          water_count?: number
        }
        Relationships: []
      }
      forest_waters: {
        Row: {
          created_at: string
          id: string
          seed_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          seed_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          seed_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forest_waters_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "forest_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_suggestions: {
        Row: {
          created_at: string
          id: string
          note: string
          recipient_id: string
          responded_at: string | null
          resulting_task_id: string | null
          sender_id: string
          source: string
          status: Database["public"]["Enums"]["suggestion_status"]
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          recipient_id: string
          responded_at?: string | null
          resulting_task_id?: string | null
          sender_id: string
          source?: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          recipient_id?: string
          responded_at?: string | null
          resulting_task_id?: string | null
          sender_id?: string
          source?: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          title?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          promises: Json
          recipient_id: string
          requester_id: string
          share_from_recipient: boolean
          share_from_requester: boolean
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          promises?: Json
          recipient_id: string
          requester_id: string
          share_from_recipient?: boolean
          share_from_requester?: boolean
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          promises?: Json
          recipient_id?: string
          requester_id?: string
          share_from_recipient?: boolean
          share_from_requester?: boolean
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
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
      health_entries: {
        Row: {
          bp_diastolic: number | null
          bp_systolic: number | null
          created_at: string
          creatinine_mgdl: number | null
          egfr: number | null
          entry_date: string
          fasting_glucose_mgdl: number | null
          hba1c_pct: number | null
          hdl_mgdl: number | null
          height_cm: number | null
          hemoglobin_gdl: number | null
          id: string
          lab_report_url: string | null
          ldl_mgdl: number | null
          notes: string
          resting_hr: number | null
          self_rating: number
          total_chol_mgdl: number | null
          triglycerides_mgdl: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          creatinine_mgdl?: number | null
          egfr?: number | null
          entry_date?: string
          fasting_glucose_mgdl?: number | null
          hba1c_pct?: number | null
          hdl_mgdl?: number | null
          height_cm?: number | null
          hemoglobin_gdl?: number | null
          id?: string
          lab_report_url?: string | null
          ldl_mgdl?: number | null
          notes?: string
          resting_hr?: number | null
          self_rating?: number
          total_chol_mgdl?: number | null
          triglycerides_mgdl?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          creatinine_mgdl?: number | null
          egfr?: number | null
          entry_date?: string
          fasting_glucose_mgdl?: number | null
          hba1c_pct?: number | null
          hdl_mgdl?: number | null
          height_cm?: number | null
          hemoglobin_gdl?: number | null
          id?: string
          lab_report_url?: string | null
          ldl_mgdl?: number | null
          notes?: string
          resting_hr?: number | null
          self_rating?: number
          total_chol_mgdl?: number | null
          triglycerides_mgdl?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
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
      library_shares: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_public: boolean
          name: string
          tab: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_public?: boolean
          name?: string
          tab?: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_public?: boolean
          name?: string
          tab?: string
          updated_at?: string
          user_id?: string
          view_count?: number
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
      planning_tasks: {
        Row: {
          created_at: string
          deadline: string | null
          done: boolean
          energy: string | null
          icon: string | null
          id: string
          level: string
          leverage: string | null
          mentions: Json
          notes: string
          parent_id: string | null
          position_x: number | null
          position_y: number | null
          project_id: string
          sort_order: number
          standalone: boolean
          time_minutes: number | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          done?: boolean
          energy?: string | null
          icon?: string | null
          id?: string
          level?: string
          leverage?: string | null
          mentions?: Json
          notes?: string
          parent_id?: string | null
          position_x?: number | null
          position_y?: number | null
          project_id: string
          sort_order?: number
          standalone?: boolean
          time_minutes?: number | null
          title?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          done?: boolean
          energy?: string | null
          icon?: string | null
          id?: string
          level?: string
          leverage?: string | null
          mentions?: Json
          notes?: string
          parent_id?: string | null
          position_x?: number | null
          position_y?: number | null
          project_id?: string
          sort_order?: number
          standalone?: boolean
          time_minutes?: number | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "planning_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "user_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_shares: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          sections: Json
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          sections?: Json
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          sections?: Json
          updated_at?: string
          user_id?: string
          view_count?: number
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
      tracker_xp_grants: {
        Row: {
          date: string
          granted_at: string
          id: string
          ref_id: string
          source: string
          user_id: string
          xp: number
        }
        Insert: {
          date?: string
          granted_at?: string
          id?: string
          ref_id: string
          source: string
          user_id: string
          xp: number
        }
        Update: {
          date?: string
          granted_at?: string
          id?: string
          ref_id?: string
          source?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      user_books: {
        Row: {
          author: string
          cover_color: string
          created_at: string
          directions: string[]
          format: string
          id: string
          notes: string
          pages_read: number
          pillars: string[]
          rating: number | null
          status: string
          tags: string[]
          title: string
          total_pages: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          author?: string
          cover_color?: string
          created_at?: string
          directions?: string[]
          format?: string
          id?: string
          notes?: string
          pages_read?: number
          pillars?: string[]
          rating?: number | null
          status?: string
          tags?: string[]
          title: string
          total_pages?: number
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          author?: string
          cover_color?: string
          created_at?: string
          directions?: string[]
          format?: string
          id?: string
          notes?: string
          pages_read?: number
          pillars?: string[]
          rating?: number | null
          status?: string
          tags?: string[]
          title?: string
          total_pages?: number
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      user_courses: {
        Row: {
          cover_color: string
          created_at: string
          directions: string[]
          id: string
          instructor: string
          notes: string
          pillars: string[]
          platform: string
          progress_pct: number
          rating: number | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          cover_color?: string
          created_at?: string
          directions?: string[]
          id?: string
          instructor?: string
          notes?: string
          pillars?: string[]
          platform?: string
          progress_pct?: number
          rating?: number | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          cover_color?: string
          created_at?: string
          directions?: string[]
          id?: string
          instructor?: string
          notes?: string
          pillars?: string[]
          platform?: string
          progress_pct?: number
          rating?: number | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
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
      user_notifications: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          month: string
          title: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          month?: string
          title?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          month?: string
          title?: string
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
      user_profiles: {
        Row: {
          avatar_emoji: string
          created_at: string
          display_name: string
          friend_code: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_emoji?: string
          created_at?: string
          display_name?: string
          friend_code: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_emoji?: string
          created_at?: string
          display_name?: string
          friend_code?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_projects: {
        Row: {
          color_var: string
          created_at: string
          emoji: string
          icon: string
          id: string
          layout_x: number | null
          layout_y: number | null
          name: string
          parent_category: string | null
          user_id: string
        }
        Insert: {
          color_var?: string
          created_at?: string
          emoji?: string
          icon?: string
          id?: string
          layout_x?: number | null
          layout_y?: number | null
          name: string
          parent_category?: string | null
          user_id: string
        }
        Update: {
          color_var?: string
          created_at?: string
          emoji?: string
          icon?: string
          id?: string
          layout_x?: number | null
          layout_y?: number | null
          name?: string
          parent_category?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_saved_tags: {
        Row: {
          created_at: string
          id: string
          module: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module?: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: { Args: { request_id: string }; Returns: Json }
      add_friend_by_handle: { Args: { handle: string }; Returns: Json }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      can_view_seed: { Args: { _seed_id: string }; Returns: boolean }
      decline_friend_request: { Args: { request_id: string }; Returns: Json }
      ensure_user_profile: {
        Args: never
        Returns: {
          avatar_emoji: string
          created_at: string
          display_name: string
          friend_code: string
          updated_at: string
          user_id: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      forest_view_seed: { Args: { _seed_id: string }; Returns: undefined }
      generate_friend_code: { Args: never; Returns: string }
      get_friend_dashboard: { Args: { friend_id: string }; Returns: Json }
      get_shared_library: { Args: { share_id: string }; Returns: Json }
      get_shared_profile: { Args: { share_id: string }; Returns: Json }
      is_forest_seed_author: {
        Args: { _seed_id: string; _user_id: string }
        Returns: boolean
      }
      regenerate_friend_code: { Args: never; Returns: string }
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
      friendship_status: "pending" | "accepted" | "blocked"
      suggestion_status: "pending" | "accepted" | "declined"
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
    Enums: {
      friendship_status: ["pending", "accepted", "blocked"],
      suggestion_status: ["pending", "accepted", "declined"],
    },
  },
} as const
