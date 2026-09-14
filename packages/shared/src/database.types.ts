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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aging_curve_baselines: {
        Row: {
          aging_curve_family: string | null
          confidence: number | null
          country: string | null
          decl_delta_acidity: number | null
          decl_delta_aromatic_intensity: number | null
          decl_delta_complexity: number | null
          decl_delta_concentration: number | null
          decl_delta_earthy: number | null
          decl_delta_finish_length: number | null
          decl_delta_freshness: number | null
          decl_delta_fruit_ripeness: number | null
          decl_delta_mineral: number | null
          decl_delta_oak_presence: number | null
          decl_delta_savory: number | null
          decl_delta_tannin: number | null
          decline_aroma_additions: string | null
          decline_end: number | null
          dev_delta_acidity: number | null
          dev_delta_aromatic_intensity: number | null
          dev_delta_complexity: number | null
          dev_delta_concentration: number | null
          dev_delta_earthy: number | null
          dev_delta_finish_length: number | null
          dev_delta_freshness: number | null
          dev_delta_fruit_ripeness: number | null
          dev_delta_mineral: number | null
          dev_delta_oak_presence: number | null
          dev_delta_savory: number | null
          dev_delta_tannin: number | null
          development_end: number | null
          has_muted_phase: boolean | null
          id: number
          muted_end_year: number | null
          muted_start_year: number | null
          notes: string | null
          past_delta_acidity: number | null
          past_delta_aromatic_intensity: number | null
          past_delta_complexity: number | null
          past_delta_concentration: number | null
          past_delta_earthy: number | null
          past_delta_finish_length: number | null
          past_delta_freshness: number | null
          past_delta_fruit_ripeness: number | null
          past_delta_mineral: number | null
          past_delta_oak_presence: number | null
          past_delta_savory: number | null
          past_delta_tannin: number | null
          peak_aroma_additions: string | null
          peak_aroma_removals: string | null
          peak_delta_acidity: number | null
          peak_delta_aromatic_intensity: number | null
          peak_delta_complexity: number | null
          peak_delta_concentration: number | null
          peak_delta_earthy: number | null
          peak_delta_finish_length: number | null
          peak_delta_freshness: number | null
          peak_delta_fruit_ripeness: number | null
          peak_delta_mineral: number | null
          peak_delta_oak_presence: number | null
          peak_delta_savory: number | null
          peak_delta_tannin: number | null
          peak_end: number | null
          peak_texture: string | null
          primary_grapes: string | null
          region: string | null
          source_urls: string | null
          sub_region: string | null
          wine_type: string | null
          youth_end: number | null
          youth_texture: string | null
        }
        Insert: {
          aging_curve_family?: string | null
          confidence?: number | null
          country?: string | null
          decl_delta_acidity?: number | null
          decl_delta_aromatic_intensity?: number | null
          decl_delta_complexity?: number | null
          decl_delta_concentration?: number | null
          decl_delta_earthy?: number | null
          decl_delta_finish_length?: number | null
          decl_delta_freshness?: number | null
          decl_delta_fruit_ripeness?: number | null
          decl_delta_mineral?: number | null
          decl_delta_oak_presence?: number | null
          decl_delta_savory?: number | null
          decl_delta_tannin?: number | null
          decline_aroma_additions?: string | null
          decline_end?: number | null
          dev_delta_acidity?: number | null
          dev_delta_aromatic_intensity?: number | null
          dev_delta_complexity?: number | null
          dev_delta_concentration?: number | null
          dev_delta_earthy?: number | null
          dev_delta_finish_length?: number | null
          dev_delta_freshness?: number | null
          dev_delta_fruit_ripeness?: number | null
          dev_delta_mineral?: number | null
          dev_delta_oak_presence?: number | null
          dev_delta_savory?: number | null
          dev_delta_tannin?: number | null
          development_end?: number | null
          has_muted_phase?: boolean | null
          id?: never
          muted_end_year?: number | null
          muted_start_year?: number | null
          notes?: string | null
          past_delta_acidity?: number | null
          past_delta_aromatic_intensity?: number | null
          past_delta_complexity?: number | null
          past_delta_concentration?: number | null
          past_delta_earthy?: number | null
          past_delta_finish_length?: number | null
          past_delta_freshness?: number | null
          past_delta_fruit_ripeness?: number | null
          past_delta_mineral?: number | null
          past_delta_oak_presence?: number | null
          past_delta_savory?: number | null
          past_delta_tannin?: number | null
          peak_aroma_additions?: string | null
          peak_aroma_removals?: string | null
          peak_delta_acidity?: number | null
          peak_delta_aromatic_intensity?: number | null
          peak_delta_complexity?: number | null
          peak_delta_concentration?: number | null
          peak_delta_earthy?: number | null
          peak_delta_finish_length?: number | null
          peak_delta_freshness?: number | null
          peak_delta_fruit_ripeness?: number | null
          peak_delta_mineral?: number | null
          peak_delta_oak_presence?: number | null
          peak_delta_savory?: number | null
          peak_delta_tannin?: number | null
          peak_end?: number | null
          peak_texture?: string | null
          primary_grapes?: string | null
          region?: string | null
          source_urls?: string | null
          sub_region?: string | null
          wine_type?: string | null
          youth_end?: number | null
          youth_texture?: string | null
        }
        Update: {
          aging_curve_family?: string | null
          confidence?: number | null
          country?: string | null
          decl_delta_acidity?: number | null
          decl_delta_aromatic_intensity?: number | null
          decl_delta_complexity?: number | null
          decl_delta_concentration?: number | null
          decl_delta_earthy?: number | null
          decl_delta_finish_length?: number | null
          decl_delta_freshness?: number | null
          decl_delta_fruit_ripeness?: number | null
          decl_delta_mineral?: number | null
          decl_delta_oak_presence?: number | null
          decl_delta_savory?: number | null
          decl_delta_tannin?: number | null
          decline_aroma_additions?: string | null
          decline_end?: number | null
          dev_delta_acidity?: number | null
          dev_delta_aromatic_intensity?: number | null
          dev_delta_complexity?: number | null
          dev_delta_concentration?: number | null
          dev_delta_earthy?: number | null
          dev_delta_finish_length?: number | null
          dev_delta_freshness?: number | null
          dev_delta_fruit_ripeness?: number | null
          dev_delta_mineral?: number | null
          dev_delta_oak_presence?: number | null
          dev_delta_savory?: number | null
          dev_delta_tannin?: number | null
          development_end?: number | null
          has_muted_phase?: boolean | null
          id?: never
          muted_end_year?: number | null
          muted_start_year?: number | null
          notes?: string | null
          past_delta_acidity?: number | null
          past_delta_aromatic_intensity?: number | null
          past_delta_complexity?: number | null
          past_delta_concentration?: number | null
          past_delta_earthy?: number | null
          past_delta_finish_length?: number | null
          past_delta_freshness?: number | null
          past_delta_fruit_ripeness?: number | null
          past_delta_mineral?: number | null
          past_delta_oak_presence?: number | null
          past_delta_savory?: number | null
          past_delta_tannin?: number | null
          peak_aroma_additions?: string | null
          peak_aroma_removals?: string | null
          peak_delta_acidity?: number | null
          peak_delta_aromatic_intensity?: number | null
          peak_delta_complexity?: number | null
          peak_delta_concentration?: number | null
          peak_delta_earthy?: number | null
          peak_delta_finish_length?: number | null
          peak_delta_freshness?: number | null
          peak_delta_fruit_ripeness?: number | null
          peak_delta_mineral?: number | null
          peak_delta_oak_presence?: number | null
          peak_delta_savory?: number | null
          peak_delta_tannin?: number | null
          peak_end?: number | null
          peak_texture?: string | null
          primary_grapes?: string | null
          region?: string | null
          source_urls?: string | null
          sub_region?: string | null
          wine_type?: string | null
          youth_end?: number | null
          youth_texture?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          request_count: number
          route_key: string
          subject: string
          updated_at: string
          window_start_at: string
        }
        Insert: {
          request_count?: number
          route_key: string
          subject: string
          updated_at?: string
          window_start_at?: string
        }
        Update: {
          request_count?: number
          route_key?: string
          subject?: string
          updated_at?: string
          window_start_at?: string
        }
        Relationships: []
      }
      appellation_grape_map: {
        Row: {
          appellation: string
          blend_style: string | null
          classification: string | null
          country: string
          created_at: string | null
          id: number
          notes: string | null
          primary_grapes: string
          region: string
          secondary_grapes: string | null
          sub_region: string | null
          wine_type: string
        }
        Insert: {
          appellation: string
          blend_style?: string | null
          classification?: string | null
          country: string
          created_at?: string | null
          id?: number
          notes?: string | null
          primary_grapes: string
          region: string
          secondary_grapes?: string | null
          sub_region?: string | null
          wine_type: string
        }
        Update: {
          appellation?: string
          blend_style?: string | null
          classification?: string | null
          country?: string
          created_at?: string | null
          id?: number
          notes?: string | null
          primary_grapes?: string
          region?: string
          secondary_grapes?: string | null
          sub_region?: string | null
          wine_type?: string
        }
        Relationships: []
      }
      base_profiles: {
        Row: {
          acidity: number | null
          alcohol_perception: number | null
          alcohol_range: string | null
          aromatic_intensity: number | null
          balance_alcohol_body: number | null
          balance_body_acid: number | null
          balance_oak_fruit: number | null
          balance_sweet_acid: number | null
          balance_tannin_fruit: number | null
          bitterness_phenolic_grip: number | null
          blend_style: string | null
          body: number | null
          color: string | null
          concentration: number | null
          confidence_notes: string | null
          country: string
          drinking_window: string | null
          earthy: number | null
          finish_length: number | null
          freshness: number | null
          fruit_ripeness: number | null
          id: number
          mineral: number | null
          oak_character: string | null
          oak_presence: number | null
          overall_balance: number | null
          price_range: string | null
          primary_aroma_clusters: string | null
          primary_grapes: string | null
          quality_tier: string | null
          region: string
          regulatory_classification: string | null
          savory: number | null
          secondary_aroma_clusters: string | null
          style_families: string | null
          sub_region: string | null
          sweetness_level: string | null
          sweetness_perception: number | null
          tannin: number | null
          tertiary_aroma_clusters: string | null
          texture: string | null
          wine_type: string
        }
        Insert: {
          acidity?: number | null
          alcohol_perception?: number | null
          alcohol_range?: string | null
          aromatic_intensity?: number | null
          balance_alcohol_body?: number | null
          balance_body_acid?: number | null
          balance_oak_fruit?: number | null
          balance_sweet_acid?: number | null
          balance_tannin_fruit?: number | null
          bitterness_phenolic_grip?: number | null
          blend_style?: string | null
          body?: number | null
          color?: string | null
          concentration?: number | null
          confidence_notes?: string | null
          country: string
          drinking_window?: string | null
          earthy?: number | null
          finish_length?: number | null
          freshness?: number | null
          fruit_ripeness?: number | null
          id?: never
          mineral?: number | null
          oak_character?: string | null
          oak_presence?: number | null
          overall_balance?: number | null
          price_range?: string | null
          primary_aroma_clusters?: string | null
          primary_grapes?: string | null
          quality_tier?: string | null
          region: string
          regulatory_classification?: string | null
          savory?: number | null
          secondary_aroma_clusters?: string | null
          style_families?: string | null
          sub_region?: string | null
          sweetness_level?: string | null
          sweetness_perception?: number | null
          tannin?: number | null
          tertiary_aroma_clusters?: string | null
          texture?: string | null
          wine_type: string
        }
        Update: {
          acidity?: number | null
          alcohol_perception?: number | null
          alcohol_range?: string | null
          aromatic_intensity?: number | null
          balance_alcohol_body?: number | null
          balance_body_acid?: number | null
          balance_oak_fruit?: number | null
          balance_sweet_acid?: number | null
          balance_tannin_fruit?: number | null
          bitterness_phenolic_grip?: number | null
          blend_style?: string | null
          body?: number | null
          color?: string | null
          concentration?: number | null
          confidence_notes?: string | null
          country?: string
          drinking_window?: string | null
          earthy?: number | null
          finish_length?: number | null
          freshness?: number | null
          fruit_ripeness?: number | null
          id?: never
          mineral?: number | null
          oak_character?: string | null
          oak_presence?: number | null
          overall_balance?: number | null
          price_range?: string | null
          primary_aroma_clusters?: string | null
          primary_grapes?: string | null
          quality_tier?: string | null
          region?: string
          regulatory_classification?: string | null
          savory?: number | null
          secondary_aroma_clusters?: string | null
          style_families?: string | null
          sub_region?: string | null
          sweetness_level?: string | null
          sweetness_perception?: number | null
          tannin?: number | null
          tertiary_aroma_clusters?: string | null
          texture?: string | null
          wine_type?: string
        }
        Relationships: []
      }
      cellar_custom_field_defs: {
        Row: {
          created_at: string
          field_name: string
          field_type: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          field_name: string
          field_type?: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          field_name?: string
          field_type?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      cellar_custom_field_values: {
        Row: {
          created_at: string
          entry_id: string
          field_def_id: string
          id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          field_def_id: string
          id?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          field_def_id?: string
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cellar_custom_field_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_custom_field_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_custom_field_values_field_def_id_fkey"
            columns: ["field_def_id"]
            isOneToOne: false
            referencedRelation: "cellar_custom_field_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_tier_aging_modifiers: {
        Row: {
          classification_system: string | null
          confidence: number | null
          decline_end_shift: number | null
          development_end_shift: number | null
          id: number
          notes: string | null
          peak_end_shift: number | null
          quality_rank: number | null
          source_urls: string | null
          tier_name: string | null
          youth_end_shift: number | null
        }
        Insert: {
          classification_system?: string | null
          confidence?: number | null
          decline_end_shift?: number | null
          development_end_shift?: number | null
          id?: never
          notes?: string | null
          peak_end_shift?: number | null
          quality_rank?: number | null
          source_urls?: string | null
          tier_name?: string | null
          youth_end_shift?: number | null
        }
        Update: {
          classification_system?: string | null
          confidence?: number | null
          decline_end_shift?: number | null
          development_end_shift?: number | null
          id?: never
          notes?: string | null
          peak_end_shift?: number | null
          quality_rank?: number | null
          source_urls?: string | null
          tier_name?: string | null
          youth_end_shift?: number | null
        }
        Relationships: []
      }
      classification_tier_modifiers: {
        Row: {
          alcohol_range_override: string | null
          classification_system: string | null
          confidence: number | null
          delta_acidity: number | null
          delta_alcohol_perception: number | null
          delta_aromatic_intensity: number | null
          delta_body: number | null
          delta_complexity: number | null
          delta_concentration: number | null
          delta_earthy: number | null
          delta_finish_length: number | null
          delta_freshness: number | null
          delta_fruit_ripeness: number | null
          delta_mineral: number | null
          delta_oak_presence: number | null
          delta_savory: number | null
          delta_sweetness_perception: number | null
          delta_tannin: number | null
          drinking_window_override: string | null
          id: number
          price_range_override: string | null
          quality_rank: number | null
          regulatory_basis: string | null
          source_urls: string | null
          style_family_additions: string | null
          tertiary_aroma_additions: string | null
          tier_name: string | null
        }
        Insert: {
          alcohol_range_override?: string | null
          classification_system?: string | null
          confidence?: number | null
          delta_acidity?: number | null
          delta_alcohol_perception?: number | null
          delta_aromatic_intensity?: number | null
          delta_body?: number | null
          delta_complexity?: number | null
          delta_concentration?: number | null
          delta_earthy?: number | null
          delta_finish_length?: number | null
          delta_freshness?: number | null
          delta_fruit_ripeness?: number | null
          delta_mineral?: number | null
          delta_oak_presence?: number | null
          delta_savory?: number | null
          delta_sweetness_perception?: number | null
          delta_tannin?: number | null
          drinking_window_override?: string | null
          id?: never
          price_range_override?: string | null
          quality_rank?: number | null
          regulatory_basis?: string | null
          source_urls?: string | null
          style_family_additions?: string | null
          tertiary_aroma_additions?: string | null
          tier_name?: string | null
        }
        Update: {
          alcohol_range_override?: string | null
          classification_system?: string | null
          confidence?: number | null
          delta_acidity?: number | null
          delta_alcohol_perception?: number | null
          delta_aromatic_intensity?: number | null
          delta_body?: number | null
          delta_complexity?: number | null
          delta_concentration?: number | null
          delta_earthy?: number | null
          delta_finish_length?: number | null
          delta_freshness?: number | null
          delta_fruit_ripeness?: number | null
          delta_mineral?: number | null
          delta_oak_presence?: number | null
          delta_savory?: number | null
          delta_sweetness_perception?: number | null
          delta_tannin?: number | null
          drinking_window_override?: string | null
          id?: never
          price_range_override?: string | null
          quality_rank?: number | null
          regulatory_basis?: string | null
          source_urls?: string | null
          style_family_additions?: string | null
          tertiary_aroma_additions?: string | null
          tier_name?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          comment_id: string | null
          created_at: string
          details: string | null
          entry_id: string | null
          id: string
          reason: string | null
          reporter_id: string
          status: string
          target_type: string
          target_user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          entry_id?: string | null
          id?: string
          reason?: string | null
          reporter_id: string
          status?: string
          target_type: string
          target_user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          entry_id?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string
          status?: string
          target_type?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "entry_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          entry_id: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          entry_id: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          entry_id?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "entry_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_comparison_feedback: {
        Row: {
          comparison_entry_id: string
          created_at: string
          id: string
          new_entry_id: string
          response: Database["public"]["Enums"]["entry_comparison_response"]
          user_id: string
        }
        Insert: {
          comparison_entry_id: string
          created_at?: string
          id?: string
          new_entry_id: string
          response: Database["public"]["Enums"]["entry_comparison_response"]
          user_id: string
        }
        Update: {
          comparison_entry_id?: string
          created_at?: string
          id?: string
          new_entry_id?: string
          response?: Database["public"]["Enums"]["entry_comparison_response"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_comparison_feedback_comparison_entry_id_fkey"
            columns: ["comparison_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comparison_feedback_comparison_entry_id_fkey"
            columns: ["comparison_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comparison_feedback_new_entry_id_fkey"
            columns: ["new_entry_id"]
            isOneToOne: true
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comparison_feedback_new_entry_id_fkey"
            columns: ["new_entry_id"]
            isOneToOne: true
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_group_slides: {
        Row: {
          created_at: string
          entry_id: string | null
          group_id: string
          id: string
          path: string
          photo_type: string
          position: number
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          group_id: string
          id?: string
          path: string
          photo_type: string
          position?: number
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          group_id?: string
          id?: string
          path?: string
          photo_type?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "entry_group_slides_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_group_slides_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_group_slides_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "entry_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_groups: {
        Row: {
          anchor_entry_id: string | null
          created_at: string
          event_type: string | null
          id: string
          mode: Database["public"]["Enums"]["entry_group_mode"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_entry_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["entry_group_mode"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_entry_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["entry_group_mode"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_groups_anchor_entry_id_fkey"
            columns: ["anchor_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_groups_anchor_entry_id_fkey"
            columns: ["anchor_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_photos: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          path: string
          position: number
          type: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          path: string
          position?: number
          type: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          path?: string
          position?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_primary_grapes: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          position: number
          variety_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          position: number
          variety_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          position?: number
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_primary_grapes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_primary_grapes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_primary_grapes_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "grape_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_reactions: {
        Row: {
          created_at: string
          emoji: string
          entry_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          entry_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          entry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_reactions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_reactions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_notifications: {
        Row: {
          actor_id: string
          created_at: string
          friend_request_id: string
          id: string
          seen_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          friend_request_id: string
          id?: string
          seen_at?: string | null
          type?: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          friend_request_id?: string
          id?: string
          seen_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_notifications_friend_request_id_fkey"
            columns: ["friend_request_id"]
            isOneToOne: false
            referencedRelation: "friend_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          responded_at: string | null
          seen_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          seen_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          seen_at?: string | null
          status?: string
        }
        Relationships: []
      }
      general_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: number
          metadata: Json
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: number
          metadata?: Json
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: number
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "general_knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      grape_aliases: {
        Row: {
          alias: string
          alias_normalized: string
          created_at: string
          id: string
          variety_id: string
        }
        Insert: {
          alias: string
          alias_normalized: string
          created_at?: string
          id?: string
          variety_id: string
        }
        Update: {
          alias?: string
          alias_normalized?: string
          created_at?: string
          id?: string
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grape_aliases_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "grape_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      grape_sensitivity_coefficients: {
        Row: {
          aging_potential_multiplier: string | null
          cold_sensitivity: string | null
          color: string | null
          drought_sensitivity: string | null
          grape: string | null
          heat_sensitivity: string | null
          id: number
          notes: string | null
          oxidation_resistance: string | null
          rain_sensitivity: string | null
          skin_thickness: string | null
          source_notes: string | null
          typical_tannin: string | null
        }
        Insert: {
          aging_potential_multiplier?: string | null
          cold_sensitivity?: string | null
          color?: string | null
          drought_sensitivity?: string | null
          grape?: string | null
          heat_sensitivity?: string | null
          id?: never
          notes?: string | null
          oxidation_resistance?: string | null
          rain_sensitivity?: string | null
          skin_thickness?: string | null
          source_notes?: string | null
          typical_tannin?: string | null
        }
        Update: {
          aging_potential_multiplier?: string | null
          cold_sensitivity?: string | null
          color?: string | null
          drought_sensitivity?: string | null
          grape?: string | null
          heat_sensitivity?: string | null
          id?: never
          notes?: string | null
          oxidation_resistance?: string | null
          rain_sensitivity?: string | null
          skin_thickness?: string | null
          source_notes?: string | null
          typical_tannin?: string | null
        }
        Relationships: []
      }
      grape_varieties: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          content: string
          content_type: string
          created_at: string
          id: string
          ingest_status: string
          last_ingested_at: string | null
          metadata: Json
          source_filename: string | null
          source_url: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          chunk_count?: number
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          ingest_status?: string
          last_ingested_at?: string | null
          metadata?: Json
          source_filename?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          chunk_count?: number
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          ingest_status?: string
          last_ingested_at?: string | null
          metadata?: Json
          source_filename?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      launch_feedback: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          message: string
          page_path: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          page_path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          page_path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      list_scan_results: {
        Row: {
          list_title: string | null
          overall_confidence: number | null
          raw_result: Json
          scan_id: string
          scanned_at: string
          source_label: string | null
          source_type: string
          user_id: string
          venue_name: string | null
        }
        Insert: {
          list_title?: string | null
          overall_confidence?: number | null
          raw_result: Json
          scan_id: string
          scanned_at?: string
          source_label?: string | null
          source_type: string
          user_id: string
          venue_name?: string | null
        }
        Update: {
          list_title?: string | null
          overall_confidence?: number | null
          raw_result?: Json
          scan_id?: string
          scanned_at?: string
          source_label?: string | null
          source_type?: string
          user_id?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      list_scan_wines: {
        Row: {
          created_at: string
          id: string
          match_percent: number
          menu_label: string
          parse_confidence: number
          price_display: string | null
          price_value: number | null
          producer: string | null
          rationale: string
          regions: string[]
          scan_id: string
          source_order: number
          user_id: string
          varietals: string[]
          vintage: string | null
          wine_name: string | null
          wine_type: string
        }
        Insert: {
          created_at?: string
          id: string
          match_percent: number
          menu_label: string
          parse_confidence: number
          price_display?: string | null
          price_value?: number | null
          producer?: string | null
          rationale: string
          regions?: string[]
          scan_id: string
          source_order: number
          user_id: string
          varietals?: string[]
          vintage?: string | null
          wine_name?: string | null
          wine_type: string
        }
        Update: {
          created_at?: string
          id?: string
          match_percent?: number
          menu_label?: string
          parse_confidence?: number
          price_display?: string | null
          price_value?: number | null
          producer?: string | null
          rationale?: string
          regions?: string[]
          scan_id?: string
          source_order?: number
          user_id?: string
          varietals?: string[]
          vintage?: string | null
          wine_name?: string | null
          wine_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_scan_wines_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "list_scan_results"
            referencedColumns: ["scan_id"]
          },
        ]
      }
      palate_profiles: {
        Row: {
          created_at: string
          model: string
          profile: Json
          signal_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          model: string
          profile: Json
          signal_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          model?: string
          profile?: Json
          signal_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          mode: string
          post_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          mode?: string
          post_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          mode?: string
          post_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_aliases: {
        Row: {
          alias: string
          alias_type: string
          canonical_producer_name: string
          id: number
        }
        Insert: {
          alias: string
          alias_type: string
          canonical_producer_name: string
          id?: never
        }
        Update: {
          alias?: string
          alias_type?: string
          canonical_producer_name?: string
          id?: never
        }
        Relationships: []
      }
      producer_modifiers: {
        Row: {
          appellation: string | null
          confidence: number | null
          delta_acidity: number | null
          delta_aromatic_intensity: number | null
          delta_body: number | null
          delta_concentration: number | null
          delta_earthy: number | null
          delta_fruit_ripeness: number | null
          delta_oak_presence: number | null
          delta_tannin: number | null
          grapes: string | null
          house_style_descriptors: string | null
          id: number
          price_tier_label: string | null
          price_tier_numeric: number | null
          producer_name: string | null
          region: string | null
          sensory_signatures: string | null
          sources: string | null
          style_keywords: string | null
          vs_regional_average: string | null
          wine_type: string | null
          winemaking_approach: string | null
          winemaking_style_detail: string | null
        }
        Insert: {
          appellation?: string | null
          confidence?: number | null
          delta_acidity?: number | null
          delta_aromatic_intensity?: number | null
          delta_body?: number | null
          delta_concentration?: number | null
          delta_earthy?: number | null
          delta_fruit_ripeness?: number | null
          delta_oak_presence?: number | null
          delta_tannin?: number | null
          grapes?: string | null
          house_style_descriptors?: string | null
          id?: never
          price_tier_label?: string | null
          price_tier_numeric?: number | null
          producer_name?: string | null
          region?: string | null
          sensory_signatures?: string | null
          sources?: string | null
          style_keywords?: string | null
          vs_regional_average?: string | null
          wine_type?: string | null
          winemaking_approach?: string | null
          winemaking_style_detail?: string | null
        }
        Update: {
          appellation?: string | null
          confidence?: number | null
          delta_acidity?: number | null
          delta_aromatic_intensity?: number | null
          delta_body?: number | null
          delta_concentration?: number | null
          delta_earthy?: number | null
          delta_fruit_ripeness?: number | null
          delta_oak_presence?: number | null
          delta_tannin?: number | null
          grapes?: string | null
          house_style_descriptors?: string | null
          id?: never
          price_tier_label?: string | null
          price_tier_numeric?: number | null
          producer_name?: string | null
          region?: string | null
          sensory_signatures?: string | null
          sources?: string | null
          style_keywords?: string | null
          vs_regional_average?: string | null
          wine_type?: string | null
          winemaking_approach?: string | null
          winemaking_style_detail?: string | null
        }
        Relationships: []
      }
      producer_region_crosswalk: {
        Row: {
          id: number
          match_quality: string | null
          producer_modifier_region: string | null
          profile_country: string | null
          profile_region: string | null
          profile_sub_region: string | null
        }
        Insert: {
          id?: never
          match_quality?: string | null
          producer_modifier_region?: string | null
          profile_country?: string | null
          profile_region?: string | null
          profile_sub_region?: string | null
        }
        Update: {
          id?: never
          match_quality?: string | null
          producer_modifier_region?: string | null
          profile_country?: string | null
          profile_region?: string | null
          profile_sub_region?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audience_mode: string
          avatar_path: string | null
          bio: string | null
          created_at: string
          default_comments_privacy: Database["public"]["Enums"]["privacy_level"]
          default_entry_privacy: Database["public"]["Enums"]["privacy_level"]
          default_reaction_privacy: Database["public"]["Enums"]["privacy_level"]
          display_name: string | null
          email: string | null
          featured_badge_id: string | null
          featured_badge_ids: string[]
          first_name: string | null
          id: string
          is_test_account: boolean
          last_name: string | null
          name_display_preference: string
          phone: string | null
          privacy_confirmed_at: string | null
        }
        Insert: {
          audience_mode?: string
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          default_comments_privacy?: Database["public"]["Enums"]["privacy_level"]
          default_entry_privacy?: Database["public"]["Enums"]["privacy_level"]
          default_reaction_privacy?: Database["public"]["Enums"]["privacy_level"]
          display_name?: string | null
          email?: string | null
          featured_badge_id?: string | null
          featured_badge_ids?: string[]
          first_name?: string | null
          id: string
          is_test_account?: boolean
          last_name?: string | null
          name_display_preference?: string
          phone?: string | null
          privacy_confirmed_at?: string | null
        }
        Update: {
          audience_mode?: string
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          default_comments_privacy?: Database["public"]["Enums"]["privacy_level"]
          default_entry_privacy?: Database["public"]["Enums"]["privacy_level"]
          default_reaction_privacy?: Database["public"]["Enums"]["privacy_level"]
          display_name?: string | null
          email?: string | null
          featured_badge_id?: string | null
          featured_badge_ids?: string[]
          first_name?: string | null
          id?: string
          is_test_account?: boolean
          last_name?: string | null
          name_display_preference?: string
          phone?: string | null
          privacy_confirmed_at?: string | null
        }
        Relationships: []
      }
      region_aliases: {
        Row: {
          alias: string
          alias_type: string
          canonical_country: string
          canonical_region: string
          canonical_sub_region: string | null
          id: number
        }
        Insert: {
          alias: string
          alias_type: string
          canonical_country: string
          canonical_region: string
          canonical_sub_region?: string | null
          id?: never
        }
        Update: {
          alias?: string
          alias_type?: string
          canonical_country?: string
          canonical_region?: string
          canonical_sub_region?: string | null
          id?: never
        }
        Relationships: []
      }
      scan_resolution_log: {
        Row: {
          canonical_classification: string | null
          canonical_country: string | null
          canonical_producer: string | null
          canonical_region: string | null
          canonical_sub_region: string | null
          created_at: string
          entry_id: string | null
          fallback_level: number | null
          id: string
          producer_alias_matched: boolean
          raw_classification: string | null
          raw_producer: string | null
          raw_region: string | null
          raw_wine_type: string | null
          region_alias_matched: boolean
          resolution_confidence: number | null
          resolution_source: string
          user_id: string
        }
        Insert: {
          canonical_classification?: string | null
          canonical_country?: string | null
          canonical_producer?: string | null
          canonical_region?: string | null
          canonical_sub_region?: string | null
          created_at?: string
          entry_id?: string | null
          fallback_level?: number | null
          id?: string
          producer_alias_matched?: boolean
          raw_classification?: string | null
          raw_producer?: string | null
          raw_region?: string | null
          raw_wine_type?: string | null
          region_alias_matched?: boolean
          resolution_confidence?: number | null
          resolution_source?: string
          user_id: string
        }
        Update: {
          canonical_classification?: string | null
          canonical_country?: string | null
          canonical_producer?: string | null
          canonical_region?: string | null
          canonical_sub_region?: string | null
          created_at?: string
          entry_id?: string | null
          fallback_level?: number | null
          id?: string
          producer_alias_matched?: boolean
          raw_classification?: string | null
          raw_producer?: string | null
          raw_region?: string | null
          raw_wine_type?: string | null
          region_alias_matched?: boolean
          resolution_confidence?: number | null
          resolution_source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_resolution_log_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_resolution_log_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      sommelier_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sommelier_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: number
          metadata: Json
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: number
          metadata?: Json
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: number
          metadata?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "sommelier_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sommelier_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      taste_survey_responses: {
        Row: {
          adventurousness: number
          budget_restaurant: string | null
          budget_retail: string | null
          completed_at: string | null
          countries: string[]
          created_at: string
          free_text: string | null
          id: string
          regions: string[]
          sensory_avoids: string[]
          sensory_loves: string[]
          updated_at: string
          user_id: string
          varietals: string[]
          wine_types: string[]
        }
        Insert: {
          adventurousness?: number
          budget_restaurant?: string | null
          budget_retail?: string | null
          completed_at?: string | null
          countries?: string[]
          created_at?: string
          free_text?: string | null
          id?: string
          regions?: string[]
          sensory_avoids?: string[]
          sensory_loves?: string[]
          updated_at?: string
          user_id: string
          varietals?: string[]
          wine_types?: string[]
        }
        Update: {
          adventurousness?: number
          budget_restaurant?: string | null
          budget_retail?: string | null
          completed_at?: string | null
          countries?: string[]
          created_at?: string
          free_text?: string | null
          id?: string
          regions?: string[]
          sensory_avoids?: string[]
          sensory_loves?: string[]
          updated_at?: string
          user_id?: string
          varietals?: string[]
          wine_types?: string[]
        }
        Relationships: []
      }
      taxonomy_classification_tiers: {
        Row: {
          classification_system: string | null
          country: string | null
          description: string | null
          id: number
          quality_rank: number | null
          region: string | null
          sub_region: string | null
          tier_label: string | null
          tier_name: string | null
        }
        Insert: {
          classification_system?: string | null
          country?: string | null
          description?: string | null
          id?: never
          quality_rank?: number | null
          region?: string | null
          sub_region?: string | null
          tier_label?: string | null
          tier_name?: string | null
        }
        Update: {
          classification_system?: string | null
          country?: string | null
          description?: string | null
          id?: never
          quality_rank?: number | null
          region?: string | null
          sub_region?: string | null
          tier_label?: string | null
          tier_name?: string | null
        }
        Relationships: []
      }
      taxonomy_master_v2: {
        Row: {
          category: string | null
          description: string | null
          edge_cases: string | null
          examples: string | null
          id: number
          parent_category: string | null
          scale_1_5_labels: string | null
          status: string | null
          term: string | null
          version: string | null
          wset_alignment: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          edge_cases?: string | null
          examples?: string | null
          id?: never
          parent_category?: string | null
          scale_1_5_labels?: string | null
          status?: string | null
          term?: string | null
          version?: string | null
          wset_alignment?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          edge_cases?: string | null
          examples?: string | null
          id?: never
          parent_category?: string | null
          scale_1_5_labels?: string | null
          status?: string | null
          term?: string | null
          version?: string | null
          wset_alignment?: string | null
        }
        Relationships: []
      }
      taxonomy_price_ranges: {
        Row: {
          description: string | null
          id: number
          price_range: string | null
          range_order: number | null
        }
        Insert: {
          description?: string | null
          id?: never
          price_range?: string | null
          range_order?: number | null
        }
        Update: {
          description?: string | null
          id?: never
          price_range?: string | null
          range_order?: number | null
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
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
      user_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          entry_id: string
          id: string
          snapshot_consumed_at: string | null
          snapshot_entry_group_id: string | null
          snapshot_label_image_path: string | null
          snapshot_preview_image_path: string | null
          snapshot_producer: string | null
          snapshot_vintage: string | null
          snapshot_wine_name: string | null
          user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          entry_id: string
          id?: string
          snapshot_consumed_at?: string | null
          snapshot_entry_group_id?: string | null
          snapshot_label_image_path?: string | null
          snapshot_preview_image_path?: string | null
          snapshot_producer?: string | null
          snapshot_vintage?: string | null
          snapshot_wine_name?: string | null
          user_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          entry_id?: string
          id?: string
          snapshot_consumed_at?: string | null
          snapshot_entry_group_id?: string | null
          snapshot_label_image_path?: string | null
          snapshot_preview_image_path?: string | null
          snapshot_producer?: string | null
          snapshot_vintage?: string | null
          snapshot_wine_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "user_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collection_items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collection_items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collection_items_snapshot_entry_group_id_fkey"
            columns: ["snapshot_entry_group_id"]
            isOneToOne: false
            referencedRelation: "entry_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_collections: {
        Row: {
          cover_image_path: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entry_knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string
          entry_id: string
          id: number
          metadata: Json
          source_hash: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding: string
          entry_id: string
          id?: number
          metadata?: Json
          source_hash: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string
          entry_id?: string
          id?: number
          metadata?: Json
          source_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entry_knowledge_chunks_entry_id_user_id_fkey"
            columns: ["entry_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "user_entry_knowledge_chunks_entry_id_user_id_fkey"
            columns: ["entry_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      vintage_weather_modifiers: {
        Row: {
          confidence: number | null
          country: string
          decline_end_shift: number | null
          development_end_shift: number | null
          id: number
          is_compound_rain: boolean
          notes: string | null
          peak_end_shift: number | null
          quality_indicator: number | null
          rain_label: string | null
          rain_parse_note: string | null
          rain_score: number | null
          red_delta_acidity: number | null
          red_delta_alcohol_perception: number | null
          red_delta_aromatic_intensity: number | null
          red_delta_bitterness_phenolic: number | null
          red_delta_body: number | null
          red_delta_concentration: number | null
          red_delta_earthy: number | null
          red_delta_finish_length: number | null
          red_delta_freshness: number | null
          red_delta_fruit_ripeness: number | null
          red_delta_mineral: number | null
          red_delta_oak_presence: number | null
          red_delta_savory: number | null
          red_delta_sweetness_perception: number | null
          red_delta_tannin: number | null
          region: string
          sub_region: string | null
          temp_label: string | null
          temp_score: number | null
          vintage: number
          white_delta_acidity: number | null
          white_delta_alcohol_perception: number | null
          white_delta_aromatic_intensity: number | null
          white_delta_bitterness_phenolic: number | null
          white_delta_body: number | null
          white_delta_concentration: number | null
          white_delta_earthy: number | null
          white_delta_finish_length: number | null
          white_delta_freshness: number | null
          white_delta_fruit_ripeness: number | null
          white_delta_mineral: number | null
          white_delta_oak_presence: number | null
          white_delta_savory: number | null
          white_delta_sweetness_perception: number | null
          white_delta_tannin: number | null
          youth_end_shift: number | null
        }
        Insert: {
          confidence?: number | null
          country: string
          decline_end_shift?: number | null
          development_end_shift?: number | null
          id?: never
          is_compound_rain?: boolean
          notes?: string | null
          peak_end_shift?: number | null
          quality_indicator?: number | null
          rain_label?: string | null
          rain_parse_note?: string | null
          rain_score?: number | null
          red_delta_acidity?: number | null
          red_delta_alcohol_perception?: number | null
          red_delta_aromatic_intensity?: number | null
          red_delta_bitterness_phenolic?: number | null
          red_delta_body?: number | null
          red_delta_concentration?: number | null
          red_delta_earthy?: number | null
          red_delta_finish_length?: number | null
          red_delta_freshness?: number | null
          red_delta_fruit_ripeness?: number | null
          red_delta_mineral?: number | null
          red_delta_oak_presence?: number | null
          red_delta_savory?: number | null
          red_delta_sweetness_perception?: number | null
          red_delta_tannin?: number | null
          region: string
          sub_region?: string | null
          temp_label?: string | null
          temp_score?: number | null
          vintage: number
          white_delta_acidity?: number | null
          white_delta_alcohol_perception?: number | null
          white_delta_aromatic_intensity?: number | null
          white_delta_bitterness_phenolic?: number | null
          white_delta_body?: number | null
          white_delta_concentration?: number | null
          white_delta_earthy?: number | null
          white_delta_finish_length?: number | null
          white_delta_freshness?: number | null
          white_delta_fruit_ripeness?: number | null
          white_delta_mineral?: number | null
          white_delta_oak_presence?: number | null
          white_delta_savory?: number | null
          white_delta_sweetness_perception?: number | null
          white_delta_tannin?: number | null
          youth_end_shift?: number | null
        }
        Update: {
          confidence?: number | null
          country?: string
          decline_end_shift?: number | null
          development_end_shift?: number | null
          id?: never
          is_compound_rain?: boolean
          notes?: string | null
          peak_end_shift?: number | null
          quality_indicator?: number | null
          rain_label?: string | null
          rain_parse_note?: string | null
          rain_score?: number | null
          red_delta_acidity?: number | null
          red_delta_alcohol_perception?: number | null
          red_delta_aromatic_intensity?: number | null
          red_delta_bitterness_phenolic?: number | null
          red_delta_body?: number | null
          red_delta_concentration?: number | null
          red_delta_earthy?: number | null
          red_delta_finish_length?: number | null
          red_delta_freshness?: number | null
          red_delta_fruit_ripeness?: number | null
          red_delta_mineral?: number | null
          red_delta_oak_presence?: number | null
          red_delta_savory?: number | null
          red_delta_sweetness_perception?: number | null
          red_delta_tannin?: number | null
          region?: string
          sub_region?: string | null
          temp_label?: string | null
          temp_score?: number | null
          vintage?: number
          white_delta_acidity?: number | null
          white_delta_alcohol_perception?: number | null
          white_delta_aromatic_intensity?: number | null
          white_delta_bitterness_phenolic?: number | null
          white_delta_body?: number | null
          white_delta_concentration?: number | null
          white_delta_earthy?: number | null
          white_delta_finish_length?: number | null
          white_delta_freshness?: number | null
          white_delta_fruit_ripeness?: number | null
          white_delta_mineral?: number | null
          white_delta_oak_presence?: number | null
          white_delta_savory?: number | null
          white_delta_sweetness_perception?: number | null
          white_delta_tannin?: number | null
          youth_end_shift?: number | null
        }
        Relationships: []
      }
      wine_entries: {
        Row: {
          advanced_notes: Json | null
          appellation: string | null
          assembled_sensory: Json | null
          bottle_format: string | null
          canonical_classification: string | null
          canonical_country: string | null
          canonical_producer: string | null
          canonical_region: string | null
          canonical_sub_region: string | null
          cellar_quantity: number | null
          cellared_from_id: string | null
          classification: string | null
          comments_privacy: Database["public"]["Enums"]["privacy_level"]
          comments_scope: string
          consumed_at: string
          country: string | null
          created_at: string
          drinking_now: boolean
          entry_group_id: string | null
          entry_privacy: string | null
          entry_status: string
          fallback_level: number | null
          id: string
          is_feed_visible: boolean
          label_image_path: string | null
          label_photo_privacy: string | null
          location_place_id: string | null
          location_text: string | null
          notes: string | null
          pairing_image_path: string | null
          place_image_path: string | null
          place_photo_privacy: string | null
          price_paid: number | null
          price_paid_currency:
            | Database["public"]["Enums"]["price_paid_currency"]
            | null
          price_paid_source:
            | Database["public"]["Enums"]["price_paid_source"]
            | null
          producer: string | null
          public_rating_label: string | null
          qpr_level: Database["public"]["Enums"]["qpr_level"] | null
          rating: number | null
          raw_classification: string | null
          raw_producer: string | null
          raw_region: string | null
          raw_wine_type: string | null
          reaction_privacy: Database["public"]["Enums"]["privacy_level"]
          region: string | null
          resolution_confidence: number | null
          root_entry_id: string | null
          sensory_resolved_at: string | null
          survey_drink_again:
            | Database["public"]["Enums"]["entry_survey_drink_again"]
            | null
          survey_enjoyment_intent:
            | Database["public"]["Enums"]["entry_survey_enjoyment_intent"]
            | null
          survey_expectation_match:
            | Database["public"]["Enums"]["entry_survey_expectation_match"]
            | null
          survey_how_was_it:
            | Database["public"]["Enums"]["entry_survey_how_was_it"]
            | null
          tasted_with_user_ids: string[]
          user_id: string
          vintage: string | null
          wine_name: string | null
          wine_type: Database["public"]["Enums"]["wine_type"] | null
        }
        Insert: {
          advanced_notes?: Json | null
          appellation?: string | null
          assembled_sensory?: Json | null
          bottle_format?: string | null
          canonical_classification?: string | null
          canonical_country?: string | null
          canonical_producer?: string | null
          canonical_region?: string | null
          canonical_sub_region?: string | null
          cellar_quantity?: number | null
          cellared_from_id?: string | null
          classification?: string | null
          comments_privacy?: Database["public"]["Enums"]["privacy_level"]
          comments_scope?: string
          consumed_at?: string
          country?: string | null
          created_at?: string
          drinking_now?: boolean
          entry_group_id?: string | null
          entry_privacy?: string | null
          entry_status?: string
          fallback_level?: number | null
          id?: string
          is_feed_visible?: boolean
          label_image_path?: string | null
          label_photo_privacy?: string | null
          location_place_id?: string | null
          location_text?: string | null
          notes?: string | null
          pairing_image_path?: string | null
          place_image_path?: string | null
          place_photo_privacy?: string | null
          price_paid?: number | null
          price_paid_currency?:
            | Database["public"]["Enums"]["price_paid_currency"]
            | null
          price_paid_source?:
            | Database["public"]["Enums"]["price_paid_source"]
            | null
          producer?: string | null
          public_rating_label?: string | null
          qpr_level?: Database["public"]["Enums"]["qpr_level"] | null
          rating?: number | null
          raw_classification?: string | null
          raw_producer?: string | null
          raw_region?: string | null
          raw_wine_type?: string | null
          reaction_privacy?: Database["public"]["Enums"]["privacy_level"]
          region?: string | null
          resolution_confidence?: number | null
          root_entry_id?: string | null
          sensory_resolved_at?: string | null
          survey_drink_again?:
            | Database["public"]["Enums"]["entry_survey_drink_again"]
            | null
          survey_enjoyment_intent?:
            | Database["public"]["Enums"]["entry_survey_enjoyment_intent"]
            | null
          survey_expectation_match?:
            | Database["public"]["Enums"]["entry_survey_expectation_match"]
            | null
          survey_how_was_it?:
            | Database["public"]["Enums"]["entry_survey_how_was_it"]
            | null
          tasted_with_user_ids?: string[]
          user_id: string
          vintage?: string | null
          wine_name?: string | null
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Update: {
          advanced_notes?: Json | null
          appellation?: string | null
          assembled_sensory?: Json | null
          bottle_format?: string | null
          canonical_classification?: string | null
          canonical_country?: string | null
          canonical_producer?: string | null
          canonical_region?: string | null
          canonical_sub_region?: string | null
          cellar_quantity?: number | null
          cellared_from_id?: string | null
          classification?: string | null
          comments_privacy?: Database["public"]["Enums"]["privacy_level"]
          comments_scope?: string
          consumed_at?: string
          country?: string | null
          created_at?: string
          drinking_now?: boolean
          entry_group_id?: string | null
          entry_privacy?: string | null
          entry_status?: string
          fallback_level?: number | null
          id?: string
          is_feed_visible?: boolean
          label_image_path?: string | null
          label_photo_privacy?: string | null
          location_place_id?: string | null
          location_text?: string | null
          notes?: string | null
          pairing_image_path?: string | null
          place_image_path?: string | null
          place_photo_privacy?: string | null
          price_paid?: number | null
          price_paid_currency?:
            | Database["public"]["Enums"]["price_paid_currency"]
            | null
          price_paid_source?:
            | Database["public"]["Enums"]["price_paid_source"]
            | null
          producer?: string | null
          public_rating_label?: string | null
          qpr_level?: Database["public"]["Enums"]["qpr_level"] | null
          rating?: number | null
          raw_classification?: string | null
          raw_producer?: string | null
          raw_region?: string | null
          raw_wine_type?: string | null
          reaction_privacy?: Database["public"]["Enums"]["privacy_level"]
          region?: string | null
          resolution_confidence?: number | null
          root_entry_id?: string | null
          sensory_resolved_at?: string | null
          survey_drink_again?:
            | Database["public"]["Enums"]["entry_survey_drink_again"]
            | null
          survey_enjoyment_intent?:
            | Database["public"]["Enums"]["entry_survey_enjoyment_intent"]
            | null
          survey_expectation_match?:
            | Database["public"]["Enums"]["entry_survey_expectation_match"]
            | null
          survey_how_was_it?:
            | Database["public"]["Enums"]["entry_survey_how_was_it"]
            | null
          tasted_with_user_ids?: string[]
          user_id?: string
          vintage?: string | null
          wine_name?: string | null
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_entries_cellared_from_id_fkey"
            columns: ["cellared_from_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_cellared_from_id_fkey"
            columns: ["cellared_from_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_entry_group_id_fkey"
            columns: ["entry_group_id"]
            isOneToOne: false
            referencedRelation: "entry_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_root_entry_id_fkey"
            columns: ["root_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_root_entry_id_fkey"
            columns: ["root_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_entry_ratings: {
        Row: {
          entry_id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          entry_id: string
          rating?: number | null
          user_id: string
        }
        Update: {
          entry_id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wine_entry_ratings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entry_ratings_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_entry_scores: {
        Row: {
          axis_breakdown: Json
          computed_at: string
          confidence: number | null
          created_at: string
          display_score: boolean
          effective_profile: Json
          id: string
          match_band: string
          match_score: number
          modifiers_applied: Json
          preference_event_count: number
          updated_at: string
          user_id: string
          wine_entry_id: string
        }
        Insert: {
          axis_breakdown?: Json
          computed_at?: string
          confidence?: number | null
          created_at?: string
          display_score?: boolean
          effective_profile?: Json
          id?: string
          match_band: string
          match_score: number
          modifiers_applied?: Json
          preference_event_count?: number
          updated_at?: string
          user_id: string
          wine_entry_id: string
        }
        Update: {
          axis_breakdown?: Json
          computed_at?: string
          confidence?: number | null
          created_at?: string
          display_score?: boolean
          effective_profile?: Json
          id?: string
          match_band?: string
          match_score?: number
          modifiers_applied?: Json
          preference_event_count?: number
          updated_at?: string
          user_id?: string
          wine_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wine_entry_scores_wine_entry_id_fkey"
            columns: ["wine_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entry_scores_wine_entry_id_fkey"
            columns: ["wine_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: number
          metadata: Json
          source_row_id: string
          source_table: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: number
          metadata?: Json
          source_row_id: string
          source_table: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: number
          metadata?: Json
          source_row_id?: string
          source_table?: string
        }
        Relationships: []
      }
      wine_notifications: {
        Row: {
          actor_id: string
          created_at: string
          entry_id: string
          id: string
          seen_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          entry_id: string
          id?: string
          seen_at?: string | null
          type?: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          entry_id?: string
          id?: string
          seen_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wine_notifications_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_notifications_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      wine_profiles: {
        Row: {
          audience_mode: string
          content: Json | null
          created_at: string
          display_name: string
          hero_image_attribution: string | null
          hero_image_url: string | null
          id: string
          last_refreshed: string | null
          profile_type: string
          related_slugs: Json | null
          sensory_data: Json | null
          slug: string
        }
        Insert: {
          audience_mode?: string
          content?: Json | null
          created_at?: string
          display_name: string
          hero_image_attribution?: string | null
          hero_image_url?: string | null
          id?: string
          last_refreshed?: string | null
          profile_type: string
          related_slugs?: Json | null
          sensory_data?: Json | null
          slug: string
        }
        Update: {
          audience_mode?: string
          content?: Json | null
          created_at?: string
          display_name?: string
          hero_image_attribution?: string | null
          hero_image_url?: string | null
          id?: string
          last_refreshed?: string | null
          profile_type?: string
          related_slugs?: Json | null
          sensory_data?: Json | null
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_path: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string | null
          is_test_account: boolean | null
          last_name: string | null
          name_display_preference: string | null
          username: string | null
        }
        Relationships: []
      }
      wine_entries_with_ratings: {
        Row: {
          advanced_notes: Json | null
          appellation: string | null
          assembled_sensory: Json | null
          bottle_format: string | null
          canonical_classification: string | null
          canonical_country: string | null
          canonical_producer: string | null
          canonical_region: string | null
          canonical_sub_region: string | null
          cellar_quantity: number | null
          cellared_from_id: string | null
          classification: string | null
          comments_privacy: Database["public"]["Enums"]["privacy_level"] | null
          comments_scope: string | null
          consumed_at: string | null
          country: string | null
          created_at: string | null
          drinking_now: boolean | null
          entry_group_id: string | null
          entry_privacy: string | null
          entry_status: string | null
          fallback_level: number | null
          id: string | null
          is_feed_visible: boolean | null
          label_image_path: string | null
          label_photo_privacy: string | null
          location_place_id: string | null
          location_text: string | null
          notes: string | null
          pairing_image_path: string | null
          place_image_path: string | null
          place_photo_privacy: string | null
          price_paid: number | null
          price_paid_currency:
            | Database["public"]["Enums"]["price_paid_currency"]
            | null
          price_paid_source:
            | Database["public"]["Enums"]["price_paid_source"]
            | null
          producer: string | null
          public_rating_label: string | null
          qpr_level: Database["public"]["Enums"]["qpr_level"] | null
          rating: number | null
          raw_classification: string | null
          raw_producer: string | null
          raw_region: string | null
          raw_wine_type: string | null
          reaction_privacy: Database["public"]["Enums"]["privacy_level"] | null
          region: string | null
          resolution_confidence: number | null
          root_entry_id: string | null
          sensory_resolved_at: string | null
          survey_drink_again:
            | Database["public"]["Enums"]["entry_survey_drink_again"]
            | null
          survey_enjoyment_intent:
            | Database["public"]["Enums"]["entry_survey_enjoyment_intent"]
            | null
          survey_expectation_match:
            | Database["public"]["Enums"]["entry_survey_expectation_match"]
            | null
          survey_how_was_it:
            | Database["public"]["Enums"]["entry_survey_how_was_it"]
            | null
          tasted_with_user_ids: string[] | null
          user_id: string | null
          vintage: string | null
          wine_name: string | null
          wine_type: Database["public"]["Enums"]["wine_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "wine_entries_cellared_from_id_fkey"
            columns: ["cellared_from_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_cellared_from_id_fkey"
            columns: ["cellared_from_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_entry_group_id_fkey"
            columns: ["entry_group_id"]
            isOneToOne: false
            referencedRelation: "entry_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_root_entry_id_fkey"
            columns: ["root_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wine_entries_root_entry_id_fkey"
            columns: ["root_entry_id"]
            isOneToOne: false
            referencedRelation: "wine_entries_with_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_friend_transition: {
        Args: { action: string; target_user_id: string }
        Returns: {
          changed: boolean
          request_id: string
          status: string
        }[]
      }
      are_friends: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      can_access_wine_photo: { Args: { object_name: string }; Returns: boolean }
      can_view_entry: {
        Args: { owner_id: string; privacy: string; viewer_id: string }
        Returns: boolean
      }
      can_view_entry_standard: {
        Args: { owner_id: string; privacy: string; viewer_id: string }
        Returns: boolean
      }
      can_view_test_authored_content: {
        Args: { owner_id: string; viewer_id: string }
        Returns: boolean
      }
      consume_api_rate_limit: {
        Args: {
          p_max_requests: number
          p_route_key: string
          p_subject: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          limit_count: number
          remaining_count: number
          reset_at: string
          retry_after_seconds: number
        }[]
      }
      create_test_account: {
        Args: { email?: string; password: string; username: string }
        Returns: {
          login_email: string
          login_username: string
          user_id: string
        }[]
      }
      entry_knowledge_snapshot: {
        Args: { target_entry_id: string }
        Returns: Json
      }
      get_email_for_phone: { Args: { phone: string }; Returns: string }
      get_email_for_username: { Args: { username: string }; Returns: string }
      get_entry_knowledge_sources: {
        Args: { after_entry_id?: string; batch_size?: number }
        Returns: {
          entry_id: string
          source_snapshot: Json
        }[]
      }
      get_phone_for_email: { Args: { email: string }; Returns: string }
      get_phone_for_username: { Args: { username: string }; Returns: string }
      is_phone_available: { Args: { phone: string }; Returns: boolean }
      is_test_account: { Args: { user_id: string }; Returns: boolean }
      is_user_blocked: {
        Args: { target_id: string; viewer_id: string }
        Returns: boolean
      }
      is_username_available: { Args: { username: string }; Returns: boolean }
      match_general_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_user_entries: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_user_id: string
        }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_wine_knowledge: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      publish_entry_knowledge: {
        Args: {
          chunk_content: string
          chunk_embedding: string
          expected_snapshot: Json
          target_entry_id: string
        }
        Returns: boolean
      }
      publish_entry_knowledge_batch: {
        Args: { chunks: Json }
        Returns: {
          entry_id: string
          published: boolean
        }[]
      }
      readable_wine_photo_paths: {
        Args: { object_names: string[] }
        Returns: string[]
      }
      save_entry_details: {
        Args: {
          p_entry_id: string
          p_expected: Json
          p_expected_grape_ids?: string[]
          p_grape_ids?: string[]
          p_updates: Json
        }
        Returns: Json
      }
    }
    Enums: {
      entry_comparison_response: "more" | "less" | "same_or_not_sure"
      entry_group_mode: "event" | "catch_up"
      entry_survey_drink_again: "yes" | "no"
      entry_survey_enjoyment_intent:
        | "seek_more"
        | "happily_again"
        | "if_poured"
        | "pass"
      entry_survey_expectation_match:
        | "below_expectations"
        | "met_expectations"
        | "above_expectations"
      entry_survey_how_was_it: "awful" | "bad" | "okay" | "good" | "exceptional"
      price_paid_currency: "usd" | "eur" | "gbp" | "chf" | "aud" | "mxn"
      price_paid_source: "retail" | "restaurant"
      privacy_level: "public" | "friends" | "private" | "friends_of_friends"
      qpr_level:
        | "extortion"
        | "pricey"
        | "mid"
        | "good_value"
        | "absolute_steal"
      wine_type: "red" | "white" | "rose" | "sparkling" | "sweet" | "orange"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      entry_comparison_response: ["more", "less", "same_or_not_sure"],
      entry_group_mode: ["event", "catch_up"],
      entry_survey_drink_again: ["yes", "no"],
      entry_survey_enjoyment_intent: [
        "seek_more",
        "happily_again",
        "if_poured",
        "pass",
      ],
      entry_survey_expectation_match: [
        "below_expectations",
        "met_expectations",
        "above_expectations",
      ],
      entry_survey_how_was_it: ["awful", "bad", "okay", "good", "exceptional"],
      price_paid_currency: ["usd", "eur", "gbp", "chf", "aud", "mxn"],
      price_paid_source: ["retail", "restaurant"],
      privacy_level: ["public", "friends", "private", "friends_of_friends"],
      qpr_level: ["extortion", "pricey", "mid", "good_value", "absolute_steal"],
      wine_type: ["red", "white", "rose", "sparkling", "sweet", "orange"],
    },
  },
} as const

