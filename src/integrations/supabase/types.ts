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
      agent_integrations: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          created_by: string
          credentials: Json
          id: string
          label: string | null
          last_error: string | null
          last_tested_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          created_by: string
          credentials?: Json
          id?: string
          label?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          created_by?: string
          credentials?: Json
          id?: string
          label?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_agents: {
        Row: {
          avatar_url: string | null
          channels: string[]
          config: Json
          created_at: string
          created_by: string
          description: string | null
          fallback_message: string | null
          id: string
          is_active: boolean
          knowledge_base: string | null
          max_tokens: number
          model: string
          name: string
          provider: string
          role: string | null
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          channels?: string[]
          config?: Json
          created_at?: string
          created_by: string
          description?: string | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          knowledge_base?: string | null
          max_tokens?: number
          model?: string
          name: string
          provider?: string
          role?: string | null
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          channels?: string[]
          config?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          knowledge_base?: string | null
          max_tokens?: number
          model?: string
          name?: string
          provider?: string
          role?: string | null
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          created_at: string
          created_by: string
          default_max_tokens: number
          default_model: string
          default_temperature: number
          id: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_max_tokens?: number
          default_model?: string
          default_temperature?: number
          id?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_max_tokens?: number
          default_model?: string
          default_temperature?: number
          id?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          key: string
          last_used_at: string | null
          name: string
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          key: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          key?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          changed_by: string
          changes: Json | null
          created_at: string
          id: string
          record_id: string | null
          record_label: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_by: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          record_label?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string
          changes?: Json | null
          created_at?: string
          id?: string
          record_id?: string | null
          record_label?: string | null
          table_name?: string
        }
        Relationships: []
      }
      auth_audit_logs: {
        Row: {
          created_at: string
          email: string | null
          error_message: string | null
          event: string
          id: string
          ip_address: string | null
          metadata: Json
          sub_company_id: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          error_message?: string | null
          event: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          sub_company_id?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          error_message?: string | null
          event?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          sub_company_id?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          timezone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          timezone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          created_at: string
          created_by: string
          entity: string
          field_key: string
          id: string
          is_active: boolean
          label: string
          position: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity?: string
          field_key: string
          id?: string
          is_active?: boolean
          label: string
          position?: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity?: string
          field_key?: string
          id?: string
          is_active?: boolean
          label?: string
          position?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          created_by: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          email: string | null
          estimated_value: number | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          estimated_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_server_logs: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          mcp_server_id: string | null
          message: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          mcp_server_id?: string | null
          message?: string | null
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          mcp_server_id?: string | null
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_server_logs_mcp_server_id_fkey"
            columns: ["mcp_server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          api_key: string | null
          created_at: string
          description: string | null
          host: string
          id: string
          name: string
          port: number
          status: string
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          description?: string | null
          host: string
          id?: string
          name: string
          port: number
          status?: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          description?: string | null
          host?: string
          id?: string
          name?: string
          port?: number
          status?: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_packages: {
        Row: {
          active: boolean
          created_at: string
          credits_included: number
          features: Json
          id: string
          is_custom: boolean
          is_most_chosen: boolean
          max_users: number | null
          monthly_price: number
          name: string
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits_included?: number
          features?: Json
          id?: string
          is_custom?: boolean
          is_most_chosen?: boolean
          max_users?: number | null
          monthly_price?: number
          name: string
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credits_included?: number
          features?: Json
          id?: string
          is_custom?: boolean
          is_most_chosen?: boolean
          max_users?: number | null
          monthly_price?: number
          name?: string
          slug?: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role_label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role_label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role_label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provision_locks: {
        Row: {
          email: string
          locked_at: string
        }
        Insert: {
          email: string
          locked_at?: string
        }
        Update: {
          email?: string
          locked_at?: string
        }
        Relationships: []
      }
      smtp_settings: {
        Row: {
          created_at: string
          created_by: string
          from_email: string
          from_name: string | null
          host: string
          id: string
          is_active: boolean
          password: string | null
          port: number
          updated_at: string
          use_tls: boolean
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          from_email: string
          from_name?: string | null
          host: string
          id?: string
          is_active?: boolean
          password?: string | null
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          from_email?: string
          from_name?: string | null
          host?: string
          id?: string
          is_active?: boolean
          password?: string | null
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string | null
        }
        Relationships: []
      }
      sub_companies: {
        Row: {
          admin_email: string
          admin_name: string
          allow_custom_logic: boolean
          auto_action: string
          blocked_pages: string[]
          byok_api_key: string | null
          byok_inherit: boolean
          created_at: string
          credit_alert_threshold: number
          credit_balance: number
          credit_limit: number
          credits_used_30d: number
          credits_used_today: number
          id: string
          inherit_branding: boolean
          last_alert_at: string | null
          last_alert_pct: number | null
          monthly_fee: number
          name: string
          owner_id: string
          plan_slug: string
          status: string
          updated_at: string
          whatsapp_limit: number
        }
        Insert: {
          admin_email: string
          admin_name: string
          allow_custom_logic?: boolean
          auto_action?: string
          blocked_pages?: string[]
          byok_api_key?: string | null
          byok_inherit?: boolean
          created_at?: string
          credit_alert_threshold?: number
          credit_balance?: number
          credit_limit?: number
          credits_used_30d?: number
          credits_used_today?: number
          id?: string
          inherit_branding?: boolean
          last_alert_at?: string | null
          last_alert_pct?: number | null
          monthly_fee?: number
          name: string
          owner_id: string
          plan_slug?: string
          status?: string
          updated_at?: string
          whatsapp_limit?: number
        }
        Update: {
          admin_email?: string
          admin_name?: string
          allow_custom_logic?: boolean
          auto_action?: string
          blocked_pages?: string[]
          byok_api_key?: string | null
          byok_inherit?: boolean
          created_at?: string
          credit_alert_threshold?: number
          credit_balance?: number
          credit_limit?: number
          credits_used_30d?: number
          credits_used_today?: number
          id?: string
          inherit_branding?: boolean
          last_alert_at?: string | null
          last_alert_pct?: number | null
          monthly_fee?: number
          name?: string
          owner_id?: string
          plan_slug?: string
          status?: string
          updated_at?: string
          whatsapp_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "sub_companies_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plan_packages"
            referencedColumns: ["slug"]
          },
        ]
      }
      sub_company_alerts: {
        Row: {
          action_taken: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          owner_id: string
          percent: number | null
          sub_company_id: string
          type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          owner_id: string
          percent?: number | null
          sub_company_id: string
          type: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          owner_id?: string
          percent?: number | null
          sub_company_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_company_alerts_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_company_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          last_used_at: string | null
          name: string
          owner_id: string
          scopes: string[]
          sub_company_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          last_used_at?: string | null
          name: string
          owner_id: string
          scopes?: string[]
          sub_company_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          last_used_at?: string | null
          name?: string
          owner_id?: string
          scopes?: string[]
          sub_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_company_api_keys_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_company_login_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          last_used_at: string | null
          owner_id: string
          revoked: boolean
          sub_company_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          owner_id: string
          revoked?: boolean
          sub_company_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          owner_id?: string
          revoked?: boolean
          sub_company_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_company_login_tokens_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_account_access: {
        Row: {
          allowed_pages: string[]
          created_at: string
          created_by: string | null
          id: string
          is_account_admin: boolean
          owner_id: string
          sub_company_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_pages?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_account_admin?: boolean
          owner_id: string
          sub_company_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_pages?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_account_admin?: boolean
          owner_id?: string
          sub_company_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_account_access_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          api_key_id: string | null
          created_at: string
          created_by: string
          events: string[]
          id: string
          is_active: boolean
          name: string | null
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          created_by: string
          events?: string[]
          id?: string
          is_active?: boolean
          name?: string | null
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          created_by?: string
          events?: string[]
          id?: string
          is_active?: boolean
          name?: string | null
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          created_at: string
          display_name: string
          id: string
          last_checked_at: string | null
          last_error: string | null
          metadata: Json
          phone_number: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          status: Database["public"]["Enums"]["whatsapp_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          metadata?: Json
          phone_number?: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          metadata?: Json
          phone_number?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
        }
        Relationships: []
      }
      white_label_settings: {
        Row: {
          company_name: string | null
          created_at: string
          custom_domain: string | null
          domain_active: boolean
          domain_check_message: string | null
          domain_last_checked_at: string | null
          domain_status: string
          domain_verification_token: string | null
          id: string
          login_headline: string | null
          login_image_url: string | null
          login_panel_style: string
          login_subtext: string | null
          logo_dark_url: string | null
          logo_icon_url: string | null
          logo_light_url: string | null
          owner_id: string
          primary_color: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_active?: boolean
          domain_check_message?: string | null
          domain_last_checked_at?: string | null
          domain_status?: string
          domain_verification_token?: string | null
          id?: string
          login_headline?: string | null
          login_image_url?: string | null
          login_panel_style?: string
          login_subtext?: string | null
          logo_dark_url?: string | null
          logo_icon_url?: string | null
          logo_light_url?: string | null
          owner_id: string
          primary_color?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_active?: boolean
          domain_check_message?: string | null
          domain_last_checked_at?: string | null
          domain_status?: string
          domain_verification_token?: string | null
          id?: string
          login_headline?: string | null
          login_image_url?: string | null
          login_panel_style?: string
          login_subtext?: string | null
          logo_dark_url?: string | null
          logo_icon_url?: string | null
          logo_light_url?: string | null
          owner_id?: string
          primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      audit_logs_view: {
        Row: {
          action: string | null
          changed_by: string | null
          changed_by_name: string | null
          changes: Json | null
          created_at: string | null
          id: string | null
          record_id: string | null
          record_label: string | null
          table_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_sub_login_token: {
        Args: { p_hours?: number; p_label?: string; p_sub_company_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          last_used_at: string | null
          owner_id: string
          revoked: boolean
          sub_company_id: string
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "sub_company_login_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_account_access: {
        Args: never
        Returns: {
          allow_custom_logic: boolean
          allowed_pages: string[]
          blocked_pages: string[]
          is_account_admin: boolean
          owner_id: string
          status: string
          sub_company_id: string
          sub_company_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_provision_lock: { Args: { p_email: string }; Returns: undefined }
      search_audit_logs: {
        Args: {
          p_action?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_table?: string
          p_to?: string
          p_user?: string
        }
        Returns: {
          action: string
          changed_by: string
          changed_by_name: string
          changes: Json
          created_at: string
          id: string
          record_id: string
          record_label: string
          table_name: string
          total_count: number
        }[]
      }
      try_acquire_provision_lock: {
        Args: { p_email: string }
        Returns: boolean
      }
      upsert_user_account_access: {
        Args: {
          p_allowed_pages?: string[]
          p_is_account_admin?: boolean
          p_owner_id: string
          p_sub_company_id?: string
          p_user_id: string
        }
        Returns: {
          allowed_pages: string[]
          created_at: string
          created_by: string | null
          id: string
          is_account_admin: boolean
          owner_id: string
          sub_company_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_account_access"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_sub_login_token: {
        Args: { p_token: string }
        Returns: {
          admin_email: string
          admin_name: string
          expires_at: string
          sub_company_id: string
          sub_company_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "atendente" | "closer"
      whatsapp_provider: "uaz" | "meta"
      whatsapp_status: "disconnected" | "connecting" | "connected" | "error"
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
      app_role: ["admin", "atendente", "closer"],
      whatsapp_provider: ["uaz", "meta"],
      whatsapp_status: ["disconnected", "connecting", "connected", "error"],
    },
  },
} as const
