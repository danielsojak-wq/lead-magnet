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
      account_manager_clients: {
        Row: {
          account_manager_id: string
          client_slug: string
          created_at: string | null
          id: string
          section: string
        }
        Insert: {
          account_manager_id: string
          client_slug: string
          created_at?: string | null
          id?: string
          section?: string
        }
        Update: {
          account_manager_id?: string
          client_slug?: string
          created_at?: string | null
          id?: string
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_manager_clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "account_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_manager_clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "account_managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      account_managers: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          password_hash?: string
          username?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          username?: string
        }
        Relationships: []
      }
      cached_ad_costs: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number
          client_slug: string
          conversions: number
          conversions_value: number
          cost: number
          date: string
          id: string
          impressions: number
          medium: string
          source: string
          synced_at: string
          web: string
        }
        Insert: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          client_slug: string
          conversions?: number
          conversions_value?: number
          cost?: number
          date: string
          id?: string
          impressions?: number
          medium?: string
          source?: string
          synced_at?: string
          web?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          client_slug?: string
          conversions?: number
          conversions_value?: number
          cost?: number
          date?: string
          id?: string
          impressions?: number
          medium?: string
          source?: string
          synced_at?: string
          web?: string
        }
        Relationships: []
      }
      cached_eshop_costs: {
        Row: {
          campaign_name: string
          channel: string
          client_slug: string
          cost: number
          date: string
          id: string
          synced_at: string
          web: string
        }
        Insert: {
          campaign_name?: string
          channel?: string
          client_slug: string
          cost?: number
          date: string
          id?: string
          synced_at?: string
          web?: string
        }
        Update: {
          campaign_name?: string
          channel?: string
          client_slug?: string
          cost?: number
          date?: string
          id?: string
          synced_at?: string
          web?: string
        }
        Relationships: []
      }
      cached_marketing_costs: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number
          client_slug: string
          conversions: number
          conversions_value: number
          cost: number
          date: string
          id: string
          impressions: number
          medium: string
          source: string
          synced_at: string
          web: string
        }
        Insert: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          client_slug: string
          conversions?: number
          conversions_value?: number
          cost?: number
          date: string
          id?: string
          impressions?: number
          medium?: string
          source?: string
          synced_at?: string
          web?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          client_slug?: string
          conversions?: number
          conversions_value?: number
          cost?: number
          date?: string
          id?: string
          impressions?: number
          medium?: string
          source?: string
          synced_at?: string
          web?: string
        }
        Relationships: []
      }
      client_activity_log: {
        Row: {
          actor: string
          client_slug: string
          created_at: string
          description: string | null
          event_type: string
          id: string
        }
        Insert: {
          actor?: string
          client_slug: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
        }
        Update: {
          actor?: string
          client_slug?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
        }
        Relationships: []
      }
      client_data_sources: {
        Row: {
          client_id: string
          config: Json | null
          created_at: string
          id: string
          source_type: string
          source_urls: string[]
        }
        Insert: {
          client_id: string
          config?: Json | null
          created_at?: string
          id?: string
          source_type: string
          source_urls?: string[]
        }
        Update: {
          client_id?: string
          config?: Json | null
          created_at?: string
          id?: string
          source_type?: string
          source_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "client_data_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_data_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_public"
            referencedColumns: ["id"]
          },
        ]
      }
      client_lead_campaigns: {
        Row: {
          campaign_name: string
          client_slug: string
          created_at: string
          id: string
        }
        Insert: {
          campaign_name: string
          client_slug: string
          created_at?: string
          id?: string
        }
        Update: {
          campaign_name?: string
          client_slug?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          name: string
          password_hash: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          name: string
          password_hash: string
          slug: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          name?: string
          password_hash?: string
          slug?: string
        }
        Relationships: []
      }
      competitor_ads: {
        Row: {
          ad_archive_id: string | null
          ad_end_date: string | null
          ad_start_date: string | null
          ad_type: string | null
          client_slug: string
          competitor_id: string | null
          created_at: string
          cta_text: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_inspiration: boolean
          link_url: string | null
          page_name: string | null
          primary_text: string | null
          raw: Json | null
          scrape_run_id: string | null
          video_url: string | null
        }
        Insert: {
          ad_archive_id?: string | null
          ad_end_date?: string | null
          ad_start_date?: string | null
          ad_type?: string | null
          client_slug: string
          competitor_id?: string | null
          created_at?: string
          cta_text?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_inspiration?: boolean
          link_url?: string | null
          page_name?: string | null
          primary_text?: string | null
          raw?: Json | null
          scrape_run_id?: string | null
          video_url?: string | null
        }
        Update: {
          ad_archive_id?: string | null
          ad_end_date?: string | null
          ad_start_date?: string | null
          ad_type?: string | null
          client_slug?: string
          competitor_id?: string | null
          created_at?: string
          cta_text?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_inspiration?: boolean
          link_url?: string | null
          page_name?: string | null
          primary_text?: string | null
          raw?: Json | null
          scrape_run_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_ads_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_insights: {
        Row: {
          ad_ids: string[]
          ads_count: number
          client_slug: string
          competitor_id: string | null
          created_at: string
          error_message: string | null
          generated_at: string | null
          id: string
          images_count: number
          insight_type: string
          status: string
          summary: string | null
          updated_at: string
          videos_count: number
          website_context: string | null
        }
        Insert: {
          ad_ids?: string[]
          ads_count?: number
          client_slug: string
          competitor_id?: string | null
          created_at?: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          images_count?: number
          insight_type: string
          status?: string
          summary?: string | null
          updated_at?: string
          videos_count?: number
          website_context?: string | null
        }
        Update: {
          ad_ids?: string[]
          ads_count?: number
          client_slug?: string
          competitor_id?: string | null
          created_at?: string
          error_message?: string | null
          generated_at?: string | null
          id?: string
          images_count?: number
          insight_type?: string
          status?: string
          summary?: string | null
          updated_at?: string
          videos_count?: number
          website_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_insights_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_scrape_runs: {
        Row: {
          ads_count: number
          apify_run_id: string | null
          client_slug: string
          competitor_id: string | null
          created_by_email: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          library_url: string
          started_at: string
          status: string
        }
        Insert: {
          ads_count?: number
          apify_run_id?: string | null
          client_slug: string
          competitor_id?: string | null
          created_by_email?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          library_url: string
          started_at?: string
          status?: string
        }
        Update: {
          ads_count?: number
          apify_run_id?: string | null
          client_slug?: string
          competitor_id?: string | null
          created_by_email?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          library_url?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_scrape_runs_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_website_cache: {
        Row: {
          client_slug: string
          competitor_id: string
          id: string
          markdown: string | null
          scraped_at: string
          summary: string | null
          url: string
        }
        Insert: {
          client_slug: string
          competitor_id: string
          id?: string
          markdown?: string | null
          scraped_at?: string
          summary?: string | null
          url: string
        }
        Update: {
          client_slug?: string
          competitor_id?: string
          id?: string
          markdown?: string | null
          scraped_at?: string
          summary?: string | null
          url?: string
        }
        Relationships: []
      }
      competitors: {
        Row: {
          client_slug: string
          created_at: string
          id: string
          meta_library_url: string | null
          name: string
          slot: number
          updated_at: string
          website_url: string | null
        }
        Insert: {
          client_slug: string
          created_at?: string
          id?: string
          meta_library_url?: string | null
          name: string
          slot: number
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          client_slug?: string
          created_at?: string
          id?: string
          meta_library_url?: string | null
          name?: string
          slot?: number
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      creative_assets: {
        Row: {
          composed_image_path: string | null
          copy_body: string | null
          copy_cta: string | null
          copy_headline: string | null
          created_at: string
          feedback: string | null
          id: string
          raw_image_path: string | null
          status: string
          variant_id: string
        }
        Insert: {
          composed_image_path?: string | null
          copy_body?: string | null
          copy_cta?: string | null
          copy_headline?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          raw_image_path?: string | null
          status?: string
          variant_id: string
        }
        Update: {
          composed_image_path?: string | null
          copy_body?: string | null
          copy_cta?: string | null
          copy_headline?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          raw_image_path?: string | null
          status?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "creative_brief_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_brand_profiles: {
        Row: {
          accent_color: string | null
          client_brief: string | null
          client_brief_char_count: number | null
          client_brief_file_name: string | null
          client_brief_updated_at: string | null
          client_slug: string
          created_at: string
          font_family: string | null
          id: string
          primary_color: string | null
          scraped_data: Json | null
          secondary_color: string | null
          tone_of_voice: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          client_brief?: string | null
          client_brief_char_count?: number | null
          client_brief_file_name?: string | null
          client_brief_updated_at?: string | null
          client_slug: string
          created_at?: string
          font_family?: string | null
          id?: string
          primary_color?: string | null
          scraped_data?: Json | null
          secondary_color?: string | null
          tone_of_voice?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          client_brief?: string | null
          client_brief_char_count?: number | null
          client_brief_file_name?: string | null
          client_brief_updated_at?: string | null
          client_slug?: string
          created_at?: string
          font_family?: string | null
          id?: string
          primary_color?: string | null
          scraped_data?: Json | null
          secondary_color?: string | null
          tone_of_voice?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creative_brief_inspirations: {
        Row: {
          brief_id: string
          competitor_ad_id: string
          created_at: string
        }
        Insert: {
          brief_id: string
          competitor_ad_id: string
          created_at?: string
        }
        Update: {
          brief_id?: string
          competitor_ad_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_brief_inspirations_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_brief_inspirations_competitor_ad_id_fkey"
            columns: ["competitor_ad_id"]
            isOneToOne: false
            referencedRelation: "competitor_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_brief_variants: {
        Row: {
          angle: string | null
          brief_id: string
          copy_count: number
          created_at: string
          format: string
          id: string
          image_count: number
          name: string
          note: string | null
          position: number
          section: string | null
          template_id: string | null
        }
        Insert: {
          angle?: string | null
          brief_id: string
          copy_count?: number
          created_at?: string
          format: string
          id?: string
          image_count?: number
          name: string
          note?: string | null
          position?: number
          section?: string | null
          template_id?: string | null
        }
        Update: {
          angle?: string | null
          brief_id?: string
          copy_count?: number
          created_at?: string
          format?: string
          id?: string
          image_count?: number
          name?: string
          note?: string | null
          position?: number
          section?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_brief_variants_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_briefs: {
        Row: {
          audience: string | null
          claim: string | null
          client_slug: string
          created_at: string
          created_by_email: string | null
          goal: string | null
          id: string
          landing_url: string | null
          name: string
          product_context: string | null
          scraped_context: Json | null
          updated_at: string
          usp: string | null
          website_url: string | null
        }
        Insert: {
          audience?: string | null
          claim?: string | null
          client_slug: string
          created_at?: string
          created_by_email?: string | null
          goal?: string | null
          id?: string
          landing_url?: string | null
          name: string
          product_context?: string | null
          scraped_context?: Json | null
          updated_at?: string
          usp?: string | null
          website_url?: string | null
        }
        Update: {
          audience?: string | null
          claim?: string | null
          client_slug?: string
          created_at?: string
          created_by_email?: string | null
          goal?: string | null
          id?: string
          landing_url?: string | null
          name?: string
          product_context?: string | null
          scraped_context?: Json | null
          updated_at?: string
          usp?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      creative_templates: {
        Row: {
          created_at: string
          format: string
          height: number
          id: string
          is_active: boolean
          layout_json: Json
          name: string
          width: number
        }
        Insert: {
          created_at?: string
          format: string
          height: number
          id?: string
          is_active?: boolean
          layout_json?: Json
          name: string
          width: number
        }
        Update: {
          created_at?: string
          format?: string
          height?: number
          id?: string
          is_active?: boolean
          layout_json?: Json
          name?: string
          width?: number
        }
        Relationships: []
      }
      data_sync_log: {
        Row: {
          client_slug: string
          error_message: string | null
          finished_at: string | null
          id: string
          rows_count: number
          source_type: string
          started_at: string
          status: string
        }
        Insert: {
          client_slug: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_count?: number
          source_type: string
          started_at?: string
          status?: string
        }
        Update: {
          client_slug?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_count?: number
          source_type?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      ecommerce_digest_schedules: {
        Row: {
          am_id: string
          created_at: string
          delivery_channel: string | null
          delivery_slack_email: string | null
          delivery_type: string
          enabled: boolean
          id: string
          last_sent_at: string | null
          schedule_days: number[]
          schedule_time: string
          schedule_type: string
        }
        Insert: {
          am_id: string
          created_at?: string
          delivery_channel?: string | null
          delivery_slack_email?: string | null
          delivery_type?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          schedule_days?: number[]
          schedule_time?: string
          schedule_type?: string
        }
        Update: {
          am_id?: string
          created_at?: string
          delivery_channel?: string | null
          delivery_slack_email?: string | null
          delivery_type?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          schedule_days?: number[]
          schedule_time?: string
          schedule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecommerce_digest_schedules_am_id_fkey"
            columns: ["am_id"]
            isOneToOne: true
            referencedRelation: "account_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecommerce_digest_schedules_am_id_fkey"
            columns: ["am_id"]
            isOneToOne: true
            referencedRelation: "account_managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      eshop_budget_targets: {
        Row: {
          channel: string
          client_slug: string
          created_at: string
          id: string
          month: number
          target_amount: number
          year: number
        }
        Insert: {
          channel?: string
          client_slug: string
          created_at?: string
          id?: string
          month: number
          target_amount?: number
          year: number
        }
        Update: {
          channel?: string
          client_slug?: string
          created_at?: string
          id?: string
          month?: number
          target_amount?: number
          year?: number
        }
        Relationships: []
      }
      lead_reviews: {
        Row: {
          client_slug: string
          id: string
          reviewed_at: string
          status: string
          submission_id: string
        }
        Insert: {
          client_slug: string
          id?: string
          reviewed_at?: string
          status: string
          submission_id: string
        }
        Update: {
          client_slug?: string
          id?: string
          reviewed_at?: string
          status?: string
          submission_id?: string
        }
        Relationships: []
      }
      lead_timeline: {
        Row: {
          actor: string
          client_slug: string
          content: string | null
          created_at: string
          event_type: string
          id: string
          status: string | null
          submission_id: string
        }
        Insert: {
          actor?: string
          client_slug: string
          content?: string | null
          created_at?: string
          event_type: string
          id?: string
          status?: string | null
          submission_id: string
        }
        Update: {
          actor?: string
          client_slug?: string
          content?: string | null
          created_at?: string
          event_type?: string
          id?: string
          status?: string | null
          submission_id?: string
        }
        Relationships: []
      }
      lm_session_ads: {
        Row: {
          ad_archive_id: string | null
          ad_source: string
          ad_start_date: string | null
          ad_type: string | null
          competitor_id: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          primary_text: string | null
          session_id: string
          video_url: string | null
        }
        Insert: {
          ad_archive_id?: string | null
          ad_source?: string
          ad_start_date?: string | null
          ad_type?: string | null
          competitor_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          primary_text?: string | null
          session_id: string
          video_url?: string | null
        }
        Update: {
          ad_archive_id?: string | null
          ad_source?: string
          ad_start_date?: string | null
          ad_type?: string | null
          competitor_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          primary_text?: string | null
          session_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lm_session_ads_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "lm_session_competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lm_session_ads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lm_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lm_session_competitors: {
        Row: {
          ad_mix: Json
          ads_count: number
          ai_analysis: Json | null
          created_at: string
          google_library_url: string | null
          id: string
          meta_library_url: string | null
          name: string | null
          position: number
          session_id: string
          status: string
          summary: string | null
          url: string
        }
        Insert: {
          ad_mix?: Json
          ads_count?: number
          ai_analysis?: Json | null
          created_at?: string
          google_library_url?: string | null
          id?: string
          meta_library_url?: string | null
          name?: string | null
          position: number
          session_id: string
          status?: string
          summary?: string | null
          url: string
        }
        Update: {
          ad_mix?: Json
          ads_count?: number
          ai_analysis?: Json | null
          created_at?: string
          google_library_url?: string | null
          id?: string
          meta_library_url?: string | null
          name?: string | null
          position?: number
          session_id?: string
          status?: string
          summary?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lm_session_competitors_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lm_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lm_sessions: {
        Row: {
          ai_cross_analysis: Json | null
          completed_at: string | null
          created_at: string
          cross_summary: string | null
          email: string
          email_verified_at: string | null
          error_message: string | null
          eshop_ad_mix: Json
          eshop_google_library_url: string | null
          eshop_meta_library_url: string | null
          eshop_name: string | null
          eshop_summary: string | null
          eshop_url: string | null
          id: string
          status: string
          token_expires_at: string
          verification_token: string | null
        }
        Insert: {
          ai_cross_analysis?: Json | null
          completed_at?: string | null
          created_at?: string
          cross_summary?: string | null
          email: string
          email_verified_at?: string | null
          error_message?: string | null
          eshop_ad_mix?: Json
          eshop_google_library_url?: string | null
          eshop_meta_library_url?: string | null
          eshop_name?: string | null
          eshop_summary?: string | null
          eshop_url?: string | null
          id?: string
          status?: string
          token_expires_at?: string
          verification_token?: string | null
        }
        Update: {
          ai_cross_analysis?: Json | null
          completed_at?: string | null
          created_at?: string
          cross_summary?: string | null
          email?: string
          email_verified_at?: string | null
          error_message?: string | null
          eshop_ad_mix?: Json
          eshop_google_library_url?: string | null
          eshop_meta_library_url?: string | null
          eshop_name?: string | null
          eshop_summary?: string | null
          eshop_url?: string | null
          id?: string
          status?: string
          token_expires_at?: string
          verification_token?: string | null
        }
        Relationships: []
      }
      marketing_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          password_hash?: string
          username?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          client_slug: string
          created_at: string
          delivery: Json
          enabled: boolean
          frequency: string
          id: string
          last_notified_at: string | null
          params: Json
          rule_type: string
          user_display_name: string | null
          user_id: string
          user_type: string
        }
        Insert: {
          client_slug: string
          created_at?: string
          delivery?: Json
          enabled?: boolean
          frequency?: string
          id?: string
          last_notified_at?: string | null
          params?: Json
          rule_type: string
          user_display_name?: string | null
          user_id: string
          user_type: string
        }
        Update: {
          client_slug?: string
          created_at?: string
          delivery?: Json
          enabled?: boolean
          frequency?: string
          id?: string
          last_notified_at?: string | null
          params?: Json
          rule_type?: string
          user_display_name?: string | null
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      source_campaign_mappings: {
        Row: {
          campaign_name: string
          client_slug: string
          created_at: string
          id: string
          match_type: string
          source_name: string
        }
        Insert: {
          campaign_name: string
          client_slug: string
          created_at?: string
          id?: string
          match_type?: string
          source_name: string
        }
        Update: {
          campaign_name?: string
          client_slug?: string
          created_at?: string
          id?: string
          match_type?: string
          source_name?: string
        }
        Relationships: []
      }
      team_users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          linked_am_id: string | null
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          linked_am_id?: string | null
          role: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          linked_am_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_users_linked_am_id_fkey"
            columns: ["linked_am_id"]
            isOneToOne: false
            referencedRelation: "account_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_users_linked_am_id_fkey"
            columns: ["linked_am_id"]
            isOneToOne: false
            referencedRelation: "account_managers_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_managers_public: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      clients_public: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string | null
          name: string | null
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_distinct_eshop_channels: {
        Args: { slug: string }
        Returns: {
          channel: string
        }[]
      }
      set_client_password: {
        Args: { _client_id: string; _password: string }
        Returns: undefined
      }
      verify_admin_password: {
        Args: { _password: string; _username: string }
        Returns: boolean
      }
      verify_am_password: {
        Args: { _password: string; _username: string }
        Returns: boolean
      }
      verify_client_password: {
        Args: { _client_name: string; _password: string }
        Returns: boolean
      }
      verify_marketing_password: {
        Args: { _password: string; _username: string }
        Returns: boolean
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
