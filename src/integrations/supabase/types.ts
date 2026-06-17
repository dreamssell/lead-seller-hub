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
          autonomous_config: Json | null
          avatar_url: string | null
          channels: string[]
          config: Json
          created_at: string
          created_by: string
          description: string | null
          fallback_message: string | null
          id: string
          is_active: boolean
          is_autonomous: boolean | null
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
          autonomous_config?: Json | null
          avatar_url?: string | null
          channels?: string[]
          config?: Json
          created_at?: string
          created_by: string
          description?: string | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          is_autonomous?: boolean | null
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
          autonomous_config?: Json | null
          avatar_url?: string | null
          channels?: string[]
          config?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          is_autonomous?: boolean | null
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
      channel_routing: {
        Row: {
          channel: string
          chat_provider: string
          created_at: string
          enabled: boolean
          id: string
          owner_id: string
          pipeline_id: string | null
          stage_id: string | null
          sub_company_id: string | null
          updated_at: string
          voice_provider: string | null
        }
        Insert: {
          channel: string
          chat_provider?: string
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id: string
          pipeline_id?: string | null
          stage_id?: string | null
          sub_company_id?: string | null
          updated_at?: string
          voice_provider?: string | null
        }
        Update: {
          channel?: string
          chat_provider?: string
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          pipeline_id?: string | null
          stage_id?: string | null
          sub_company_id?: string | null
          updated_at?: string
          voice_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_routing_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routing_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routing_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          channel: string | null
          client_msg_id: string | null
          connection_id: string | null
          content: string
          created_at: string
          customer_id: string | null
          id: string
          metadata: Json | null
          sender_type: string
          sub_company_id: string | null
          uaz_msg_id: string | null
        }
        Insert: {
          channel?: string | null
          client_msg_id?: string | null
          connection_id?: string | null
          content: string
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          sender_type: string
          sub_company_id?: string | null
          uaz_msg_id?: string | null
        }
        Update: {
          channel?: string | null
          client_msg_id?: string | null
          connection_id?: string | null
          content?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          sender_type?: string
          sub_company_id?: string | null
          uaz_msg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          config: Json | null
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
          config?: Json | null
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
          config?: Json | null
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
      connection_alerts: {
        Row: {
          connection_id: string | null
          consecutive_failures: number | null
          created_at: string | null
          id: string
          last_alert_at: string | null
        }
        Insert: {
          connection_id?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          last_alert_at?: string | null
        }
        Update: {
          connection_id?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          last_alert_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_alerts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_events: {
        Row: {
          connection_id: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          metadata_json: Json | null
          payload: Json | null
          status: string
          status_detail: string | null
          test_event_id: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          metadata_json?: Json | null
          payload?: Json | null
          status: string
          status_detail?: string | null
          test_event_id?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          metadata_json?: Json | null
          payload?: Json | null
          status?: string
          status_detail?: string | null
          test_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_agent_id: string | null
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          estimated_value: number | null
          id: string
          job_title: string | null
          last_interaction_at: string | null
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          job_title?: string | null
          last_interaction_at?: string | null
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          job_title?: string | null
          last_interaction_at?: string | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_email_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          id: string
          parent_event_id: string | null
          payload: Json | null
          title: string | null
          type: string
          undo_reason: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          parent_event_id?: string | null
          payload?: Json | null
          title?: string | null
          type: string
          undo_reason?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          parent_event_id?: string | null
          payload?: Json | null
          title?: string | null
          type?: string
          undo_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "crm_events"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_webhook_logs: {
        Row: {
          correlation_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          is_dead_letter: boolean | null
          last_error_details: string | null
          last_error_summary: string | null
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          retry_count: number | null
          retry_history: Json | null
          retry_strategy: Json | null
          status: string | null
          webhook_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          is_dead_letter?: boolean | null
          last_error_details?: string | null
          last_error_summary?: string | null
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          retry_history?: Json | null
          retry_strategy?: Json | null
          status?: string | null
          webhook_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          is_dead_letter?: boolean | null
          last_error_details?: string | null
          last_error_summary?: string | null
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          retry_history?: Json | null
          retry_strategy?: Json | null
          status?: string | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "crm_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          secret_key: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          secret_key?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          secret_key?: string
          updated_at?: string
          url?: string
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
      customer_notes: {
        Row: {
          author_id: string
          author_name: string | null
          content: string
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          content: string
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          channel: string | null
          company: string | null
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          origin_connection_id: string | null
          owner_id: string | null
          phone: string | null
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          channel?: string | null
          company?: string | null
          created_at?: string
          created_by: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          origin_connection_id?: string | null
          owner_id?: string | null
          phone?: string | null
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          channel?: string | null
          company?: string | null
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          origin_connection_id?: string | null
          owner_id?: string | null
          phone?: string | null
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_origin_connection_id_fkey"
            columns: ["origin_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_cleanup_logs: {
        Row: {
          clean_date: string | null
          id: string
          keys_removed: number
          reason: string | null
          webhook_id: string | null
        }
        Insert: {
          clean_date?: string | null
          id?: string
          keys_removed: number
          reason?: string | null
          webhook_id?: string | null
        }
        Update: {
          clean_date?: string | null
          id?: string
          keys_removed?: number
          reason?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_cleanup_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
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
      lead_events: {
        Row: {
          actor_id: string | null
          channel: string | null
          created_at: string
          from_stage_id: string | null
          from_stage_name: string | null
          id: string
          lead_id: string
          metadata: Json
          owner_id: string
          source: string | null
          sub_company_id: string | null
          to_stage_id: string | null
          to_stage_name: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          channel?: string | null
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          owner_id: string
          source?: string | null
          sub_company_id?: string | null
          to_stage_id?: string | null
          to_stage_name?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          channel?: string | null
          created_at?: string
          from_stage_id?: string | null
          from_stage_name?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          owner_id?: string
          source?: string | null
          sub_company_id?: string | null
          to_stage_id?: string | null
          to_stage_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          channel: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          email: string | null
          estimated_value: number | null
          id: string
          name: string
          notes: string | null
          origin_connection_id: string | null
          owner_id: string | null
          phone: string | null
          pipeline_id: string | null
          source: string | null
          stage_id: string | null
          status: string
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          name: string
          notes?: string | null
          origin_connection_id?: string | null
          owner_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          name?: string
          notes?: string | null
          origin_connection_id?: string | null
          owner_id?: string | null
          phone?: string | null
          pipeline_id?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_origin_connection_id_fkey"
            columns: ["origin_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      log_cleanup_history: {
        Row: {
          connection_id: string | null
          created_at: string | null
          deleted_count: number | null
          error_message: string | null
          id: string
          status: string | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string | null
          deleted_count?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string | null
          deleted_count?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_cleanup_history_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
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
      notification_preferences: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          notify_funnel_change: boolean
          notify_new_lead: boolean
          notify_pipeline_create: boolean
          notify_pipeline_delete: boolean
          notify_pipeline_reorder: boolean
          notify_pipeline_update: boolean
          notify_stage_change: boolean
          notify_stage_create: boolean
          notify_stage_delete: boolean
          notify_stage_reorder: boolean
          notify_stage_update: boolean
          owner_id: string
          sub_company_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          notify_funnel_change?: boolean
          notify_new_lead?: boolean
          notify_pipeline_create?: boolean
          notify_pipeline_delete?: boolean
          notify_pipeline_reorder?: boolean
          notify_pipeline_update?: boolean
          notify_stage_change?: boolean
          notify_stage_create?: boolean
          notify_stage_delete?: boolean
          notify_stage_reorder?: boolean
          notify_stage_update?: boolean
          owner_id: string
          sub_company_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          notify_funnel_change?: boolean
          notify_new_lead?: boolean
          notify_pipeline_create?: boolean
          notify_pipeline_delete?: boolean
          notify_pipeline_reorder?: boolean
          notify_pipeline_update?: boolean
          notify_stage_change?: boolean
          notify_stage_create?: boolean
          notify_stage_delete?: boolean
          notify_stage_reorder?: boolean
          notify_stage_update?: boolean
          owner_id?: string
          sub_company_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channel: string | null
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json
          owner_id: string
          read_at: string | null
          source: string | null
          sub_company_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          owner_id: string
          read_at?: string | null
          source?: string | null
          sub_company_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          owner_id?: string
          read_at?: string | null
          source?: string | null
          sub_company_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          id: string
          label: string | null
          owner_id: string
          pipeline_id: string | null
          stage_id: string | null
          sub_company_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          id?: string
          label?: string | null
          owner_id: string
          pipeline_id?: string | null
          stage_id?: string | null
          sub_company_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          id?: string
          label?: string | null
          owner_id?: string
          pipeline_id?: string | null
          stage_id?: string | null
          sub_company_id?: string | null
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          pipeline_id: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          pipeline_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_templates: {
        Row: {
          channel: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          owner_id: string | null
          stages: Json
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          owner_id?: string | null
          stages: Json
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          owner_id?: string | null
          stages?: Json
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          owner_id: string
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          owner_id: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_sub_company_id_fkey"
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
      quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          shortcut: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut?: string
          updated_at?: string
        }
        Relationships: []
      }
      signature_documents: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          expires_at: string | null
          id: string
          lead_id: string | null
          metadata: Json
          method: Database["public"]["Enums"]["signature_method"]
          original_file_path: string
          owner_id: string
          signed_at: string | null
          signed_file_path: string | null
          signed_ip: string | null
          signed_user_agent: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          status: Database["public"]["Enums"]["signature_status"]
          sub_company_id: string | null
          title: string
          updated_at: string
          validation_hash: string | null
          viewed_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          method?: Database["public"]["Enums"]["signature_method"]
          original_file_path: string
          owner_id: string
          signed_at?: string | null
          signed_file_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: Database["public"]["Enums"]["signature_status"]
          sub_company_id?: string | null
          title: string
          updated_at?: string
          validation_hash?: string | null
          viewed_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          method?: Database["public"]["Enums"]["signature_method"]
          original_file_path?: string
          owner_id?: string
          signed_at?: string | null
          signed_file_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: Database["public"]["Enums"]["signature_status"]
          sub_company_id?: string | null
          title?: string
          updated_at?: string
          validation_hash?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_documents_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_events: {
        Row: {
          actor_id: string | null
          created_at: string
          document_id: string
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          status: Database["public"]["Enums"]["signature_status"] | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          document_id: string
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          status?: Database["public"]["Enums"]["signature_status"] | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          document_id?: string
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          status?: Database["public"]["Enums"]["signature_status"] | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "signature_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_tokens: {
        Row: {
          created_at: string
          document_id: string
          email_verified_at: string | null
          expires_at: string
          id: string
          sms_pin: string | null
          sms_verified_at: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          email_verified_at?: string | null
          expires_at: string
          id?: string
          sms_pin?: string | null
          sms_verified_at?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          email_verified_at?: string | null
          expires_at?: string
          id?: string
          sms_pin?: string | null
          sms_verified_at?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_tokens_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "signature_documents"
            referencedColumns: ["id"]
          },
        ]
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
      telemetry_logs: {
        Row: {
          correlation_id: string
          created_at: string | null
          id: string
          message: string | null
          metadata: Json | null
          retry_count: number | null
          type: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          retry_count?: number | null
          type?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          retry_count?: number | null
          type?: string | null
        }
        Relationships: []
      }
      uaz_alerts_history: {
        Row: {
          alert_type: string
          channel_type: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          remediated_at: string | null
          remediation_result: string | null
          resolved_at: string | null
          severity: string
          tenant_id: string | null
        }
        Insert: {
          alert_type: string
          channel_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          remediated_at?: string | null
          remediation_result?: string | null
          resolved_at?: string | null
          severity?: string
          tenant_id?: string | null
        }
        Update: {
          alert_type?: string
          channel_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          remediated_at?: string | null
          remediation_result?: string | null
          resolved_at?: string | null
          severity?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uaz_alerts_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      uaz_audit_logs: {
        Row: {
          created_at: string
          event_type: string
          final_cause: string | null
          full_trace: Json | null
          id: string
          is_remediation: boolean | null
          latency_ms: number | null
          message: string | null
          payload: Json | null
          remediation_target_id: string | null
          response: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          event_type: string
          final_cause?: string | null
          full_trace?: Json | null
          id?: string
          is_remediation?: boolean | null
          latency_ms?: number | null
          message?: string | null
          payload?: Json | null
          remediation_target_id?: string | null
          response?: Json | null
          status: string
        }
        Update: {
          created_at?: string
          event_type?: string
          final_cause?: string | null
          full_trace?: Json | null
          id?: string
          is_remediation?: boolean | null
          latency_ms?: number | null
          message?: string | null
          payload?: Json | null
          remediation_target_id?: string | null
          response?: Json | null
          status?: string
        }
        Relationships: []
      }
      uaz_incidents: {
        Row: {
          cause: string | null
          created_at: string
          customer_id: string | null
          id: string
          original_log_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          trace: Json | null
        }
        Insert: {
          cause?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          original_log_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          trace?: Json | null
        }
        Update: {
          cause?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          original_log_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          trace?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "uaz_incidents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uaz_incidents_original_log_id_fkey"
            columns: ["original_log_id"]
            isOneToOne: false
            referencedRelation: "uaz_audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      uaz_system_settings: {
        Row: {
          alert_persistence_minutes: number | null
          alert_threshold_failure_rate: number | null
          alert_threshold_latency: number | null
          backoff_base_delay: number | null
          backoff_max_retries: number | null
          backoff_multiplier: number | null
          id: string
          idempotency_window_minutes: number | null
          incident_threshold_retries: number | null
          queue_threshold_global: number | null
          queue_threshold_per_channel: Json | null
          queue_threshold_per_tenant: Json | null
          remediation_interval_minutes: number | null
          remediation_policy_per_channel: Json | null
          remediation_policy_per_tenant: Json | null
          request_timeout_ms: number | null
          updated_at: string | null
        }
        Insert: {
          alert_persistence_minutes?: number | null
          alert_threshold_failure_rate?: number | null
          alert_threshold_latency?: number | null
          backoff_base_delay?: number | null
          backoff_max_retries?: number | null
          backoff_multiplier?: number | null
          id?: string
          idempotency_window_minutes?: number | null
          incident_threshold_retries?: number | null
          queue_threshold_global?: number | null
          queue_threshold_per_channel?: Json | null
          queue_threshold_per_tenant?: Json | null
          remediation_interval_minutes?: number | null
          remediation_policy_per_channel?: Json | null
          remediation_policy_per_tenant?: Json | null
          request_timeout_ms?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_persistence_minutes?: number | null
          alert_threshold_failure_rate?: number | null
          alert_threshold_latency?: number | null
          backoff_base_delay?: number | null
          backoff_max_retries?: number | null
          backoff_multiplier?: number | null
          id?: string
          idempotency_window_minutes?: number | null
          incident_threshold_retries?: number | null
          queue_threshold_global?: number | null
          queue_threshold_per_channel?: Json | null
          queue_threshold_per_tenant?: Json | null
          remediation_interval_minutes?: number | null
          remediation_policy_per_channel?: Json | null
          remediation_policy_per_tenant?: Json | null
          request_timeout_ms?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      unauthorized_embed_attempts: {
        Row: {
          connection_id: string | null
          created_at: string | null
          domain: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string | null
          domain: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string | null
          domain?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unauthorized_embed_attempts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_account_access: {
        Row: {
          allowed_pages: string[]
          can_manage_pipelines: boolean
          can_move_leads: boolean
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
          can_manage_pipelines?: boolean
          can_move_leads?: boolean
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
          can_manage_pipelines?: boolean
          can_move_leads?: boolean
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
      user_signature_roles: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          role: Database["public"]["Enums"]["signature_role"]
          sub_company_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          role?: Database["public"]["Enums"]["signature_role"]
          sub_company_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          role?: Database["public"]["Enums"]["signature_role"]
          sub_company_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_signature_roles_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ui_state: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          scope: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          scope: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          scope?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_resolved: boolean | null
          message: string | null
          metadata: Json | null
          room_id: string | null
          severity: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          message?: string | null
          metadata?: Json | null
          room_id?: string | null
          severity?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          message?: string | null
          metadata?: Json | null
          room_id?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_alerts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      video_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          is_bypass: boolean | null
          performed_by: string | null
          reason: string | null
          room_id: string
          target_name: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          is_bypass?: boolean | null
          performed_by?: string | null
          reason?: string | null
          room_id: string
          target_name: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_bypass?: boolean | null
          performed_by?: string | null
          reason?: string | null
          room_id?: string
          target_name?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_audit_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      video_error_logs: {
        Row: {
          browser_info: Json | null
          context: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          id: string
          room_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          browser_info?: Json | null
          context?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          id?: string
          room_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          browser_info?: Json | null
          context?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          room_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_error_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      video_participants: {
        Row: {
          cooldown_until: string | null
          id: string
          is_banned: boolean | null
          is_guest: boolean
          joined_at: string | null
          last_seen_at: string | null
          media_status: Json | null
          name: string
          role: string
          room_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          cooldown_until?: string | null
          id?: string
          is_banned?: boolean | null
          is_guest?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          media_status?: Json | null
          name: string
          role?: string
          room_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          cooldown_until?: string | null
          id?: string
          is_banned?: boolean | null
          is_guest?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          media_status?: Json | null
          name?: string
          role?: string
          room_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "video_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      video_rooms: {
        Row: {
          blacklist: string[] | null
          created_at: string
          expires_at: string | null
          host_id: string
          id: string
          invite_token: string
          is_active: boolean
          is_group: boolean
          is_locked: boolean | null
          permissions_config: Json | null
          settings: Json
          title: string
          updated_at: string
        }
        Insert: {
          blacklist?: string[] | null
          created_at?: string
          expires_at?: string | null
          host_id: string
          id?: string
          invite_token: string
          is_active?: boolean
          is_group?: boolean
          is_locked?: boolean | null
          permissions_config?: Json | null
          settings?: Json
          title: string
          updated_at?: string
        }
        Update: {
          blacklist?: string[] | null
          created_at?: string
          expires_at?: string | null
          host_id?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          is_group?: boolean
          is_locked?: boolean | null
          permissions_config?: Json | null
          settings?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      wavoip_audit_logs: {
        Row: {
          id: string
          is_replay: boolean | null
          message: string | null
          metadata: Json | null
          payload_hash: string | null
          replay_source_id: string | null
          replay_timestamp: string | null
          replay_user_id: string | null
          request_id: string | null
          status: string
          sub_company_id: string
          timestamp: string | null
          type: string
          version: string | null
        }
        Insert: {
          id?: string
          is_replay?: boolean | null
          message?: string | null
          metadata?: Json | null
          payload_hash?: string | null
          replay_source_id?: string | null
          replay_timestamp?: string | null
          replay_user_id?: string | null
          request_id?: string | null
          status: string
          sub_company_id: string
          timestamp?: string | null
          type: string
          version?: string | null
        }
        Update: {
          id?: string
          is_replay?: boolean | null
          message?: string | null
          metadata?: Json | null
          payload_hash?: string | null
          replay_source_id?: string | null
          replay_timestamp?: string | null
          replay_user_id?: string | null
          request_id?: string | null
          status?: string
          sub_company_id?: string
          timestamp?: string | null
          type?: string
          version?: string | null
        }
        Relationships: []
      }
      wavoip_devices: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          is_default: boolean
          label: string
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: string | null
          owner_id: string
          phone: string | null
          sub_company_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          label?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          owner_id: string
          phone?: string | null
          sub_company_id?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          label?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: string | null
          owner_id?: string
          phone?: string | null
          sub_company_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      wavoip_filter_presets: {
        Row: {
          created_at: string | null
          created_by: string | null
          filters: Json
          id: string
          name: string
          sub_company_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          filters: Json
          id?: string
          name: string
          sub_company_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          sub_company_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      wavoip_settings: {
        Row: {
          alert_channels: Json | null
          alert_threshold_seconds: number | null
          created_at: string | null
          id: string
          sub_company_id: string
          updated_at: string | null
          ws_backoff: Json | null
        }
        Insert: {
          alert_channels?: Json | null
          alert_threshold_seconds?: number | null
          created_at?: string | null
          id?: string
          sub_company_id: string
          updated_at?: string | null
          ws_backoff?: Json | null
        }
        Update: {
          alert_channels?: Json | null
          alert_threshold_seconds?: number | null
          created_at?: string | null
          id?: string
          sub_company_id?: string
          updated_at?: string | null
          ws_backoff?: Json | null
        }
        Relationships: []
      }
      wavoip_sync_state: {
        Row: {
          created_at: string | null
          dedup_window: number
          id: string
          last_ws_status: string | null
          last_ws_update: string | null
          recent_event_keys: string[] | null
          sub_company_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dedup_window?: number
          id?: string
          last_ws_status?: string | null
          last_ws_update?: string | null
          recent_event_keys?: string[] | null
          sub_company_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dedup_window?: number
          id?: string
          last_ws_status?: string | null
          last_ws_update?: string | null
          recent_event_keys?: string[] | null
          sub_company_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      wavoip_validation_logs: {
        Row: {
          device_id: string | null
          device_label: string | null
          device_token: string | null
          id: string
          message: string | null
          owner_id: string
          raw: Json | null
          status: string
          sub_company_id: string | null
          validated_at: string
        }
        Insert: {
          device_id?: string | null
          device_label?: string | null
          device_token?: string | null
          id?: string
          message?: string | null
          owner_id: string
          raw?: Json | null
          status: string
          sub_company_id?: string | null
          validated_at?: string
        }
        Update: {
          device_id?: string | null
          device_label?: string | null
          device_token?: string | null
          id?: string
          message?: string | null
          owner_id?: string
          raw?: Json | null
          status?: string
          sub_company_id?: string | null
          validated_at?: string
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          consumed_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          purpose: string
          rp_id: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          purpose: string
          rp_id: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          consumed_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          purpose?: string
          rp_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          friendly_name: string
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_idempotency_keys: {
        Row: {
          created_at: string | null
          id: string
          idempotency_key: string
          latency_ms: number | null
          response_body: string | null
          response_status: number | null
          webhook_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          idempotency_key: string
          latency_ms?: number | null
          response_body?: string | null
          response_status?: number | null
          webhook_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          idempotency_key?: string
          latency_ms?: number | null
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_idempotency_keys_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          direction: string | null
          error_message: string | null
          event_type: string
          headers: Json | null
          id: string
          idempotency_key: string | null
          is_idempotent_hit: boolean | null
          latency_ms: number | null
          method: string
          payload: Json | null
          request_id: string | null
          response_body: string | null
          response_status: number | null
          retry_count: number | null
          status: string | null
          timeout_limit: number | null
          url: string
          webhook_id: string | null
        }
        Insert: {
          created_at?: string
          direction?: string | null
          error_message?: string | null
          event_type: string
          headers?: Json | null
          id?: string
          idempotency_key?: string | null
          is_idempotent_hit?: boolean | null
          latency_ms?: number | null
          method: string
          payload?: Json | null
          request_id?: string | null
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          status?: string | null
          timeout_limit?: number | null
          url: string
          webhook_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string | null
          error_message?: string | null
          event_type?: string
          headers?: Json | null
          id?: string
          idempotency_key?: string | null
          is_idempotent_hit?: boolean | null
          latency_ms?: number | null
          method?: string
          payload?: Json | null
          request_id?: string | null
          response_body?: string | null
          response_status?: number | null
          retry_count?: number | null
          status?: string | null
          timeout_limit?: number | null
          url?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          alert_email: string | null
          alert_slack_url: string | null
          alert_threshold: number | null
          api_key_id: string | null
          created_at: string
          created_by: string
          events: string[]
          id: string
          idempotency_header: string | null
          idempotency_missing_behavior: string | null
          idempotency_ttl_hours: number | null
          is_active: boolean
          last_rotated_at: string | null
          max_retries: number | null
          name: string | null
          payload_schema: Json | null
          previous_secret: string | null
          secret: string | null
          secret_version: number | null
          timeout_seconds: number | null
          type: string | null
          updated_at: string
          url: string
        }
        Insert: {
          alert_email?: string | null
          alert_slack_url?: string | null
          alert_threshold?: number | null
          api_key_id?: string | null
          created_at?: string
          created_by: string
          events?: string[]
          id?: string
          idempotency_header?: string | null
          idempotency_missing_behavior?: string | null
          idempotency_ttl_hours?: number | null
          is_active?: boolean
          last_rotated_at?: string | null
          max_retries?: number | null
          name?: string | null
          payload_schema?: Json | null
          previous_secret?: string | null
          secret?: string | null
          secret_version?: number | null
          timeout_seconds?: number | null
          type?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          alert_email?: string | null
          alert_slack_url?: string | null
          alert_threshold?: number | null
          api_key_id?: string | null
          created_at?: string
          created_by?: string
          events?: string[]
          id?: string
          idempotency_header?: string | null
          idempotency_missing_behavior?: string | null
          idempotency_ttl_hours?: number | null
          is_active?: boolean
          last_rotated_at?: string | null
          max_retries?: number | null
          name?: string | null
          payload_schema?: Json | null
          previous_secret?: string | null
          secret?: string | null
          secret_version?: number | null
          timeout_seconds?: number | null
          type?: string | null
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
          authorized_domains: string[] | null
          created_at: string
          degradation_status: string | null
          display_name: string
          id: string
          last_checked_at: string | null
          last_cleanup_at: string | null
          last_degradation_at: string | null
          last_error: string | null
          log_retention_days: number | null
          metadata: Json
          next_cleanup_at: string | null
          owner_id: string | null
          phone_number: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          role: string
          status: Database["public"]["Enums"]["whatsapp_status"]
          sub_company_id: string | null
          updated_at: string
        }
        Insert: {
          authorized_domains?: string[] | null
          created_at?: string
          degradation_status?: string | null
          display_name: string
          id?: string
          last_checked_at?: string | null
          last_cleanup_at?: string | null
          last_degradation_at?: string | null
          last_error?: string | null
          log_retention_days?: number | null
          metadata?: Json
          next_cleanup_at?: string | null
          owner_id?: string | null
          phone_number?: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          role?: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          sub_company_id?: string | null
          updated_at?: string
        }
        Update: {
          authorized_domains?: string[] | null
          created_at?: string
          degradation_status?: string | null
          display_name?: string
          id?: string
          last_checked_at?: string | null
          last_cleanup_at?: string | null
          last_degradation_at?: string | null
          last_error?: string | null
          log_retention_days?: number | null
          metadata?: Json
          next_cleanup_at?: string | null
          owner_id?: string | null
          phone_number?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          role?: string
          status?: Database["public"]["Enums"]["whatsapp_status"]
          sub_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_sub_company_id_fkey"
            columns: ["sub_company_id"]
            isOneToOne: false
            referencedRelation: "sub_companies"
            referencedColumns: ["id"]
          },
        ]
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
      calculate_next_retry: { Args: { retry_count: number }; Returns: string }
      can_user_manage_pipelines: {
        Args: { p_owner_id: string; p_sub_company_id: string }
        Returns: boolean
      }
      can_user_move_leads: {
        Args: { p_owner_id: string; p_sub_company_id: string }
        Returns: boolean
      }
      cleanup_connection_events: { Args: never; Returns: undefined }
      cleanup_expired_idempotency_keys: {
        Args: { ttl_hours?: number }
        Returns: number
      }
      cleanup_expired_idempotency_keys_v2: {
        Args: never
        Returns: {
          removed_count: number
          webhook_id: string
        }[]
      }
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
      get_idempotency_expiration_report: {
        Args: { p_webhook_id: string }
        Returns: Json
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
      get_my_signature_role: {
        Args: { p_sub_company_id: string }
        Returns: Database["public"]["Enums"]["signature_role"]
      }
      get_room_invite_token: { Args: { p_room_id: string }; Returns: string }
      get_webhook_idempotency_stats: {
        Args: { p_end_date: string; p_start_date: string; p_webhook_id: string }
        Returns: {
          hit_ratio: number
          idempotency_hits: number
          total_requests: number
          webhook_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_signature_leader: {
        Args: { p_sub_company_id: string }
        Returns: boolean
      }
      log_video_action: {
        Args: {
          p_action: string
          p_performed_by: string
          p_room_id: string
          p_target_name: string
          p_target_user_id: string
        }
        Returns: undefined
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
          can_manage_pipelines: boolean
          can_move_leads: boolean
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
      user_wants_notification: {
        Args: {
          p_channel: string
          p_owner_id: string
          p_sub_company_id: string
          p_type: string
          p_user_id: string
        }
        Returns: boolean
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
      signature_method: "canvas" | "email" | "sms"
      signature_role: "agente" | "supervisor" | "coordenador" | "diretor"
      signature_status:
        | "draft"
        | "pending"
        | "viewed"
        | "authenticating"
        | "signed"
        | "expired"
        | "cancelled"
      whatsapp_provider:
        | "uaz"
        | "meta"
        | "wavoip"
        | "instagram"
        | "telegram"
        | "facebook"
        | "linkedin"
        | "tiktok"
        | "youtube"
        | "widget"
        | "evolution"
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
      signature_method: ["canvas", "email", "sms"],
      signature_role: ["agente", "supervisor", "coordenador", "diretor"],
      signature_status: [
        "draft",
        "pending",
        "viewed",
        "authenticating",
        "signed",
        "expired",
        "cancelled",
      ],
      whatsapp_provider: [
        "uaz",
        "meta",
        "wavoip",
        "instagram",
        "telegram",
        "facebook",
        "linkedin",
        "tiktok",
        "youtube",
        "widget",
        "evolution",
      ],
      whatsapp_status: ["disconnected", "connecting", "connected", "error"],
    },
  },
} as const
