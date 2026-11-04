// Tipos de la base de datos en el formato de `supabase gen types typescript`.
// Fases 0-1: escritos a mano a partir de supabase/migrations (el entorno de
// desarrollo no tenía Docker). Con el stack oficial, regenerar con `pnpm db:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.4";
  };
  public: {
    Tables: {
      ai_usage: {
        Row: {
          attempts: number;
          cache_creation_input_tokens: number;
          cache_read_input_tokens: number;
          cost_usd_est: number;
          created_at: string;
          duration_ms: number | null;
          error_code: string | null;
          feature: string;
          id: number;
          input_tokens: number;
          model: string;
          org_id: string;
          output_tokens: number;
          prompt_id: string | null;
          prompt_version: number | null;
          provider: string;
          request_id: string | null;
          status: string;
          user_id: string | null;
        };
        Insert: {
          attempts?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          cost_usd_est?: number;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          feature: string;
          id?: never;
          input_tokens?: number;
          model: string;
          org_id: string;
          output_tokens?: number;
          prompt_id?: string | null;
          prompt_version?: number | null;
          provider: string;
          request_id?: string | null;
          status: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          cost_usd_est?: number;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          feature?: string;
          id?: never;
          input_tokens?: number;
          model?: string;
          org_id?: string;
          output_tokens?: number;
          prompt_id?: string | null;
          prompt_version?: number | null;
          provider?: string;
          request_id?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          details: Json;
          entity_id: string | null;
          entity_type: string;
          id: number;
          org_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          org_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          details?: Json;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_events: {
        Row: {
          actor_id: string | null;
          candidate_id: string;
          created_at: string;
          from_status: Database["public"]["Enums"]["candidate_status"] | null;
          id: string;
          kind: Database["public"]["Enums"]["candidate_event_kind"];
          note: string | null;
          org_id: string;
          to_status: Database["public"]["Enums"]["candidate_status"] | null;
        };
        Insert: {
          actor_id?: string | null;
          candidate_id: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["candidate_status"] | null;
          id?: string;
          kind: Database["public"]["Enums"]["candidate_event_kind"];
          note?: string | null;
          org_id: string;
          to_status?: Database["public"]["Enums"]["candidate_status"] | null;
        };
        Update: {
          actor_id?: string | null;
          candidate_id?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["candidate_status"] | null;
          id?: string;
          kind?: Database["public"]["Enums"]["candidate_event_kind"];
          note?: string | null;
          org_id?: string;
          to_status?: Database["public"]["Enums"]["candidate_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_events_candidate_id_org_id_fkey";
            columns: ["candidate_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      candidate_pii: {
        Row: {
          candidate_id: string;
          created_at: string;
          cv_filename: string | null;
          email: string | null;
          full_name: string | null;
          links: string[];
          location: string | null;
          org_id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          cv_filename?: string | null;
          email?: string | null;
          full_name?: string | null;
          links?: string[];
          location?: string | null;
          org_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          cv_filename?: string | null;
          email?: string | null;
          full_name?: string | null;
          links?: string[];
          location?: string | null;
          org_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_pii_candidate_id_org_id_fkey";
            columns: ["candidate_id", "org_id"];
            isOneToOne: true;
            referencedRelation: "candidates";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      candidates: {
        Row: {
          candidate_number: number;
          created_at: string;
          created_by: string | null;
          cv_mime: string;
          cv_path: string;
          cv_size: number;
          id: string;
          identity_revealed_at: string | null;
          identity_revealed_by: string | null;
          job_id: string;
          org_id: string;
          processing_error: string | null;
          processing_started_at: string | null;
          processing_status: Database["public"]["Enums"]["cv_processing_status"];
          redacted_text: string | null;
          retention_until: string;
          status: Database["public"]["Enums"]["candidate_status"];
          status_changed_at: string | null;
          status_changed_by: string | null;
          updated_at: string;
        };
        Insert: {
          candidate_number?: number;
          created_at?: string;
          created_by?: string | null;
          cv_mime: string;
          cv_path: string;
          cv_size: number;
          id?: string;
          identity_revealed_at?: string | null;
          identity_revealed_by?: string | null;
          job_id: string;
          org_id: string;
          processing_error?: string | null;
          processing_started_at?: string | null;
          processing_status?: Database["public"]["Enums"]["cv_processing_status"];
          redacted_text?: string | null;
          retention_until?: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          updated_at?: string;
        };
        Update: {
          candidate_number?: number;
          created_at?: string;
          created_by?: string | null;
          cv_mime?: string;
          cv_path?: string;
          cv_size?: number;
          id?: string;
          identity_revealed_at?: string | null;
          identity_revealed_by?: string | null;
          job_id?: string;
          org_id?: string;
          processing_error?: string | null;
          processing_started_at?: string | null;
          processing_status?: Database["public"]["Enums"]["cv_processing_status"];
          redacted_text?: string | null;
          retention_until?: string;
          status?: Database["public"]["Enums"]["candidate_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "job_positions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      cv_analyses: {
        Row: {
          ai_usage_ids: number[];
          candidate_id: string;
          created_at: string;
          guard_flags: Json;
          id: string;
          identity_prompt_id: string | null;
          identity_prompt_version: number | null;
          interview_questions: Json;
          model: string;
          org_id: string;
          preferred_met: number;
          preferred_total: number;
          profile: Json;
          prompt_id: string;
          prompt_version: number;
          requested_by: string | null;
          required_met: number;
          required_total: number;
          requirements_snapshot: Json;
          summary: string;
        };
        Insert: {
          ai_usage_ids?: number[];
          candidate_id: string;
          created_at?: string;
          guard_flags?: Json;
          id?: string;
          identity_prompt_id?: string | null;
          identity_prompt_version?: number | null;
          interview_questions?: Json;
          model: string;
          org_id: string;
          preferred_met?: number;
          preferred_total?: number;
          profile?: Json;
          prompt_id: string;
          prompt_version: number;
          requested_by?: string | null;
          required_met?: number;
          required_total?: number;
          requirements_snapshot?: Json;
          summary: string;
        };
        Update: {
          ai_usage_ids?: number[];
          candidate_id?: string;
          created_at?: string;
          guard_flags?: Json;
          id?: string;
          identity_prompt_id?: string | null;
          identity_prompt_version?: number | null;
          interview_questions?: Json;
          model?: string;
          org_id?: string;
          preferred_met?: number;
          preferred_total?: number;
          profile?: Json;
          prompt_id?: string;
          prompt_version?: number;
          requested_by?: string | null;
          required_met?: number;
          required_total?: number;
          requirements_snapshot?: Json;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cv_analyses_candidate_id_org_id_fkey";
            columns: ["candidate_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      cv_requirement_matches: {
        Row: {
          analysis_id: string;
          evidence: string | null;
          evidence_verified: boolean;
          explanation: string;
          id: string;
          org_id: string;
          requirement_id: string | null;
          requirement_kind: Database["public"]["Enums"]["requirement_kind"];
          requirement_text: string;
          result: Database["public"]["Enums"]["requirement_match"];
          sort_order: number;
        };
        Insert: {
          analysis_id: string;
          evidence?: string | null;
          evidence_verified?: boolean;
          explanation?: string;
          id?: string;
          org_id: string;
          requirement_id?: string | null;
          requirement_kind: Database["public"]["Enums"]["requirement_kind"];
          requirement_text: string;
          result: Database["public"]["Enums"]["requirement_match"];
          sort_order?: number;
        };
        Update: {
          analysis_id?: string;
          evidence?: string | null;
          evidence_verified?: boolean;
          explanation?: string;
          id?: string;
          org_id?: string;
          requirement_id?: string | null;
          requirement_kind?: Database["public"]["Enums"]["requirement_kind"];
          requirement_text?: string;
          result?: Database["public"]["Enums"]["requirement_match"];
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cv_requirement_matches_analysis_id_org_id_fkey";
            columns: ["analysis_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "cv_analyses";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      faq_conversations: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faq_conversations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      faq_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          embedding_model: string | null;
          id: string;
          org_id: string;
          outcome: Database["public"]["Enums"]["faq_outcome"] | null;
          question_embedding: string | null;
          role: string;
          segments: Json | null;
          sources: Json;
          user_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          embedding_model?: string | null;
          id?: string;
          org_id: string;
          outcome?: Database["public"]["Enums"]["faq_outcome"] | null;
          question_embedding?: string | null;
          role: string;
          segments?: Json | null;
          sources?: Json;
          user_id?: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          embedding_model?: string | null;
          id?: string;
          org_id?: string;
          outcome?: Database["public"]["Enums"]["faq_outcome"] | null;
          question_embedding?: string | null;
          role?: string;
          segments?: Json | null;
          sources?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faq_messages_conversation_id_org_id_fkey";
            columns: ["conversation_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "faq_conversations";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      hr_queries: {
        Row: {
          answer: string | null;
          answered_at: string | null;
          answered_by: string | null;
          created_at: string;
          id: string;
          org_id: string;
          question: string;
          requester_id: string;
          status: Database["public"]["Enums"]["hr_query_status"];
        };
        Insert: {
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          question: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["hr_query_status"];
        };
        Update: {
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          question?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["hr_query_status"];
        };
        Relationships: [
          {
            foreignKeyName: "hr_queries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      interview_guides: {
        Row: {
          ai_usage_id: number | null;
          candidate_id: string | null;
          content: Json;
          created_at: string;
          created_by: string | null;
          focus_requirements: Json;
          guard_flags: Json;
          id: string;
          job_id: string;
          model: string;
          org_id: string;
          prompt_id: string;
          prompt_version: number;
        };
        Insert: {
          ai_usage_id?: number | null;
          candidate_id?: string | null;
          content: Json;
          created_at?: string;
          created_by?: string | null;
          focus_requirements?: Json;
          guard_flags?: Json;
          id?: string;
          job_id: string;
          model: string;
          org_id: string;
          prompt_id: string;
          prompt_version: number;
        };
        Update: {
          ai_usage_id?: number | null;
          candidate_id?: string | null;
          content?: Json;
          created_at?: string;
          created_by?: string | null;
          focus_requirements?: Json;
          guard_flags?: Json;
          id?: string;
          job_id?: string;
          model?: string;
          org_id?: string;
          prompt_id?: string;
          prompt_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "interview_guides_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "job_positions";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "interview_guides_candidate_id_org_id_fkey";
            columns: ["candidate_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_position_versions: {
        Row: {
          ai_usage_id: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          inclusive_review: Json | null;
          inclusive_reviewed_at: string | null;
          internal_description_md: string;
          job_id: string;
          model: string | null;
          offer_linkedin_md: string;
          offer_portal_md: string;
          offer_web_md: string;
          org_id: string;
          prompt_id: string | null;
          prompt_version: number | null;
          restored_from_version: number | null;
          source: Database["public"]["Enums"]["job_version_source"];
          version_number: number;
        };
        Insert: {
          ai_usage_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inclusive_review?: Json | null;
          inclusive_reviewed_at?: string | null;
          internal_description_md?: string;
          job_id: string;
          model?: string | null;
          offer_linkedin_md?: string;
          offer_portal_md?: string;
          offer_web_md?: string;
          org_id: string;
          prompt_id?: string | null;
          prompt_version?: number | null;
          restored_from_version?: number | null;
          source: Database["public"]["Enums"]["job_version_source"];
          version_number?: number;
        };
        Update: {
          ai_usage_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          inclusive_review?: Json | null;
          inclusive_reviewed_at?: string | null;
          internal_description_md?: string;
          job_id?: string;
          model?: string | null;
          offer_linkedin_md?: string;
          offer_portal_md?: string;
          offer_web_md?: string;
          org_id?: string;
          prompt_id?: string | null;
          prompt_version?: number | null;
          restored_from_version?: number | null;
          source?: Database["public"]["Enums"]["job_version_source"];
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "job_position_versions_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "job_positions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      job_positions: {
        Row: {
          anonymous_review: boolean;
          candidate_seq: number;
          benefits: string | null;
          created_at: string;
          created_by: string | null;
          department: string | null;
          id: string;
          level: Database["public"]["Enums"]["job_level"];
          location: string | null;
          org_id: string;
          responsibilities: string;
          salary_currency: string | null;
          salary_max: number | null;
          salary_min: number | null;
          salary_period: string | null;
          status: Database["public"]["Enums"]["job_status"];
          title: string;
          tone: Database["public"]["Enums"]["job_tone"];
          updated_at: string;
          work_mode: Database["public"]["Enums"]["work_mode"];
        };
        Insert: {
          anonymous_review?: boolean;
          candidate_seq?: number;
          benefits?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          id?: string;
          level: Database["public"]["Enums"]["job_level"];
          location?: string | null;
          org_id: string;
          responsibilities: string;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title: string;
          tone?: Database["public"]["Enums"]["job_tone"];
          updated_at?: string;
          work_mode: Database["public"]["Enums"]["work_mode"];
        };
        Update: {
          anonymous_review?: boolean;
          candidate_seq?: number;
          benefits?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          id?: string;
          level?: Database["public"]["Enums"]["job_level"];
          location?: string | null;
          org_id?: string;
          responsibilities?: string;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title?: string;
          tone?: Database["public"]["Enums"]["job_tone"];
          updated_at?: string;
          work_mode?: Database["public"]["Enums"]["work_mode"];
        };
        Relationships: [
          {
            foreignKeyName: "job_positions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_requirements: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          kind: Database["public"]["Enums"]["requirement_kind"];
          org_id: string;
          sort_order: number;
          text: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          kind?: Database["public"]["Enums"]["requirement_kind"];
          org_id: string;
          sort_order?: number;
          text: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          kind?: Database["public"]["Enums"]["requirement_kind"];
          org_id?: string;
          sort_order?: number;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "job_positions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      kb_chunks: {
        Row: {
          blocks: string[];
          chunk_index: number;
          content: string;
          document_id: string;
          embedding: string;
          fts: unknown;
          heading: string | null;
          id: string;
          org_id: string;
          page_from: number | null;
          page_to: number | null;
          token_count: number;
        };
        Insert: {
          blocks: string[];
          chunk_index: number;
          content: string;
          document_id: string;
          embedding: string;
          fts?: never;
          heading?: string | null;
          id?: string;
          org_id: string;
          page_from?: number | null;
          page_to?: number | null;
          token_count?: number;
        };
        Update: {
          blocks?: string[];
          chunk_index?: number;
          content?: string;
          document_id?: string;
          embedding?: string;
          fts?: never;
          heading?: string | null;
          id?: string;
          org_id?: string;
          page_from?: number | null;
          page_to?: number | null;
          token_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "kb_chunks_document_id_org_id_fkey";
            columns: ["document_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "kb_documents";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      kb_documents: {
        Row: {
          chunk_count: number;
          created_at: string;
          doc_type: Database["public"]["Enums"]["kb_doc_type"];
          embedding_model: string | null;
          error: string | null;
          file_mime: string;
          file_path: string;
          file_size: number;
          id: string;
          org_id: string;
          pages: number | null;
          status: Database["public"]["Enums"]["kb_document_status"];
          title: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          chunk_count?: number;
          created_at?: string;
          doc_type?: Database["public"]["Enums"]["kb_doc_type"];
          embedding_model?: string | null;
          error?: string | null;
          file_mime: string;
          file_path: string;
          file_size: number;
          id?: string;
          org_id: string;
          pages?: number | null;
          status?: Database["public"]["Enums"]["kb_document_status"];
          title: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          chunk_count?: number;
          created_at?: string;
          doc_type?: Database["public"]["Enums"]["kb_doc_type"];
          embedding_model?: string | null;
          error?: string | null;
          file_mime?: string;
          file_path?: string;
          file_size?: number;
          id?: string;
          org_id?: string;
          pages?: number | null;
          status?: Database["public"]["Enums"]["kb_document_status"];
          title?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kb_documents_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          org_id: string;
          params: Json;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          org_id: string;
          params?: Json;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          org_id?: string;
          params?: Json;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      onboarding_assignment_tasks: {
        Row: {
          assignment_id: string;
          completed_at: string | null;
          completed_by: string | null;
          description: string;
          due_date: string;
          id: string;
          is_checkpoint: boolean;
          materials: string;
          org_id: string;
          owner_label: string;
          phase: Database["public"]["Enums"]["onboarding_phase"];
          sort_order: number;
          title: string;
        };
        Insert: {
          assignment_id: string;
          completed_at?: string | null;
          completed_by?: string | null;
          description?: string;
          due_date: string;
          id?: string;
          is_checkpoint?: boolean;
          materials?: string;
          org_id: string;
          owner_label?: string;
          phase: Database["public"]["Enums"]["onboarding_phase"];
          sort_order?: number;
          title: string;
        };
        Update: {
          assignment_id?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          description?: string;
          due_date?: string;
          id?: string;
          is_checkpoint?: boolean;
          materials?: string;
          org_id?: string;
          owner_label?: string;
          phase?: Database["public"]["Enums"]["onboarding_phase"];
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_assignment_tasks_assignment_id_org_id_fkey";
            columns: ["assignment_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_assignments";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      onboarding_assignments: {
        Row: {
          created_at: string;
          created_by: string | null;
          employee_email: string | null;
          employee_name: string;
          id: string;
          member_user_id: string | null;
          org_id: string;
          plan_id: string | null;
          plan_title: string;
          start_date: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          employee_email?: string | null;
          employee_name: string;
          id?: string;
          member_user_id?: string | null;
          org_id: string;
          plan_id?: string | null;
          plan_title: string;
          start_date: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          employee_email?: string | null;
          employee_name?: string;
          id?: string;
          member_user_id?: string | null;
          org_id?: string;
          plan_id?: string | null;
          plan_title?: string;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_assignments_plan_id_org_id_fkey";
            columns: ["plan_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_plans";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      onboarding_plan_tasks: {
        Row: {
          description: string;
          due_day: number;
          id: string;
          is_checkpoint: boolean;
          materials: string;
          org_id: string;
          owner_label: string;
          phase: Database["public"]["Enums"]["onboarding_phase"];
          plan_id: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          description?: string;
          due_day: number;
          id?: string;
          is_checkpoint?: boolean;
          materials?: string;
          org_id: string;
          owner_label?: string;
          phase: Database["public"]["Enums"]["onboarding_phase"];
          plan_id: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          description?: string;
          due_day?: number;
          id?: string;
          is_checkpoint?: boolean;
          materials?: string;
          org_id?: string;
          owner_label?: string;
          phase?: Database["public"]["Enums"]["onboarding_phase"];
          plan_id?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_plan_tasks_plan_id_org_id_fkey";
            columns: ["plan_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "onboarding_plans";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      onboarding_plans: {
        Row: {
          ai_usage_id: number | null;
          created_at: string;
          created_by: string | null;
          id: string;
          intro: string;
          job_id: string;
          model: string | null;
          org_id: string;
          prompt_id: string | null;
          prompt_version: number | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          ai_usage_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          intro?: string;
          job_id: string;
          model?: string | null;
          org_id: string;
          prompt_id?: string | null;
          prompt_version?: number | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          ai_usage_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          intro?: string;
          job_id?: string;
          model?: string | null;
          org_id?: string;
          prompt_id?: string | null;
          prompt_version?: number | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_plans_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "job_positions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          ai_monthly_budget_usd: number;
          country: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          cv_retention_months: number;
          id: string;
          is_demo: boolean;
          legal_name: string | null;
          name: string;
          privacy_email: string | null;
          slug: string;
          tax_id: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          ai_monthly_budget_usd?: number;
          country: string;
          created_at?: string;
          created_by?: string | null;
          currency: string;
          cv_retention_months?: number;
          id?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          name: string;
          privacy_email?: string | null;
          slug: string;
          tax_id?: string | null;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          ai_monthly_budget_usd?: number;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          cv_retention_months?: number;
          id?: string;
          is_demo?: boolean;
          legal_name?: string | null;
          name?: string;
          privacy_email?: string | null;
          slug?: string;
          tax_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      training_assignments: {
        Row: {
          assigned_by: string | null;
          attempt_count: number;
          best_score: number | null;
          created_at: string;
          due_date: string | null;
          id: string;
          org_id: string;
          passed_at: string | null;
          training_id: string;
          user_id: string;
        };
        Insert: {
          assigned_by?: string | null;
          attempt_count?: number;
          best_score?: number | null;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          org_id: string;
          passed_at?: string | null;
          training_id: string;
          user_id: string;
        };
        Update: {
          assigned_by?: string | null;
          attempt_count?: number;
          best_score?: number | null;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          org_id?: string;
          passed_at?: string | null;
          training_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_assignments_training_id_org_id_fkey";
            columns: ["training_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "trainings";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_attempts: {
        Row: {
          answers: number[];
          assignment_id: string;
          correct_count: number;
          created_at: string;
          id: string;
          org_id: string;
          passed: boolean;
          score: number;
          total: number;
          training_id: string;
          user_id: string;
        };
        Insert: {
          answers: number[];
          assignment_id: string;
          correct_count: number;
          created_at?: string;
          id?: string;
          org_id: string;
          passed: boolean;
          score: number;
          total: number;
          training_id: string;
          user_id: string;
        };
        Update: {
          answers?: number[];
          assignment_id?: string;
          correct_count?: number;
          created_at?: string;
          id?: string;
          org_id?: string;
          passed?: boolean;
          score?: number;
          total?: number;
          training_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_attempts_assignment_id_org_id_fkey";
            columns: ["assignment_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "training_assignments";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_module_progress: {
        Row: {
          assignment_id: string;
          completed_at: string;
          module_id: string;
          org_id: string;
          user_id: string;
        };
        Insert: {
          assignment_id: string;
          completed_at?: string;
          module_id: string;
          org_id: string;
          user_id?: string;
        };
        Update: {
          assignment_id?: string;
          completed_at?: string;
          module_id?: string;
          org_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_module_progress_assignment_id_org_id_fkey";
            columns: ["assignment_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "training_assignments";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "training_module_progress_module_id_org_id_fkey";
            columns: ["module_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_modules: {
        Row: {
          content: string;
          created_at: string;
          examples: Json;
          id: string;
          objective: string;
          org_id: string;
          position: number;
          summary: string;
          title: string;
          training_id: string;
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          examples?: Json;
          id?: string;
          objective?: string;
          org_id: string;
          position: number;
          summary?: string;
          title: string;
          training_id: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          examples?: Json;
          id?: string;
          objective?: string;
          org_id?: string;
          position?: number;
          summary?: string;
          title?: string;
          training_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_modules_training_id_org_id_fkey";
            columns: ["training_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "trainings";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_quiz_keys: {
        Row: {
          correct_index: number;
          explanation: string;
          org_id: string;
          question_id: string;
        };
        Insert: {
          correct_index: number;
          explanation?: string;
          org_id: string;
          question_id: string;
        };
        Update: {
          correct_index?: number;
          explanation?: string;
          org_id?: string;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_quiz_keys_question_id_org_id_fkey";
            columns: ["question_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "training_quiz_questions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_quiz_questions: {
        Row: {
          created_at: string;
          id: string;
          options: string[];
          org_id: string;
          position: number;
          question: string;
          training_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          options: string[];
          org_id: string;
          position: number;
          question: string;
          training_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          options?: string[];
          org_id?: string;
          position?: number;
          question?: string;
          training_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_quiz_questions_training_id_org_id_fkey";
            columns: ["training_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "trainings";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      training_sources: {
        Row: {
          content: string;
          created_at: string;
          file_mime: string | null;
          file_path: string | null;
          id: string;
          kb_document_id: string | null;
          kind: Database["public"]["Enums"]["training_source_kind"];
          org_id: string;
          title: string;
          training_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          file_mime?: string | null;
          file_path?: string | null;
          id?: string;
          kb_document_id?: string | null;
          kind: Database["public"]["Enums"]["training_source_kind"];
          org_id: string;
          title: string;
          training_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          file_mime?: string | null;
          file_path?: string | null;
          id?: string;
          kb_document_id?: string | null;
          kind?: Database["public"]["Enums"]["training_source_kind"];
          org_id?: string;
          title?: string;
          training_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_sources_training_id_org_id_fkey";
            columns: ["training_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "trainings";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      trainings: {
        Row: {
          audience: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          duplicated_from: string | null;
          generation: Json;
          id: string;
          org_id: string;
          published_at: string | null;
          status: Database["public"]["Enums"]["training_status"];
          title: string;
          topic: string | null;
          updated_at: string;
        };
        Insert: {
          audience?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          duplicated_from?: string | null;
          generation?: Json;
          id?: string;
          org_id: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["training_status"];
          title: string;
          topic?: string | null;
          updated_at?: string;
        };
        Update: {
          audience?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          duplicated_from?: string | null;
          generation?: Json;
          id?: string;
          org_id?: string;
          published_at?: string | null;
          status?: Database["public"]["Enums"]["training_status"];
          title?: string;
          topic?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trainings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      answer_hr_query: {
        Args: { p_answer: string; p_query_id: string };
        Returns: undefined;
      };
      assign_onboarding_plan: {
        Args: {
          p_employee_email?: string;
          p_employee_name: string;
          p_member_user_id?: string;
          p_plan_id: string;
          p_start_date: string;
        };
        Returns: string;
      };
      assign_training: {
        Args: { p_due_date?: string; p_training_id: string; p_user_ids: string[] };
        Returns: number;
      };
      close_organization: {
        Args: { p_confirm_name: string; p_org_id: string };
        Returns: undefined;
      };
      create_demo_organization: {
        Args: { p_country: string; p_name: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      create_organization: {
        Args: {
          p_address?: string;
          p_country: string;
          p_legal_name?: string;
          p_name: string;
          p_privacy_email?: string;
          p_tax_id?: string;
        };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      duplicate_training: {
        Args: { p_title: string; p_training_id: string };
        Returns: string;
      };
      erase_member_data: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: undefined;
      };
      faq_question_clusters: {
        Args: { p_days?: number; p_min_similarity?: number; p_org_id: string };
        Returns: { last_asked_at: string; question: string; total: number; unanswered: number }[];
      };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          organization_name: string;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
        }[];
      };
      match_kb_chunks: {
        Args: {
          p_embedding: string;
          p_embedding_model: string;
          p_match_count?: number;
          p_min_similarity?: number;
          p_org_id: string;
          p_query: string;
        };
        Returns: {
          blocks: string[];
          chunk_id: string;
          document_id: string;
          document_title: string;
          heading: string | null;
          matched_terms: number;
          page_from: number | null;
          page_to: number | null;
          score: number;
          similarity: number;
        }[];
      };
      org_ai_budget_status: {
        Args: { p_org_id: string };
        Returns: { limit_usd: number; spent_usd: number }[];
      };
      org_ai_spend_current_month: {
        Args: { p_org: string };
        Returns: number;
      };
      publish_training: {
        Args: { p_training_id: string };
        Returns: undefined;
      };
      register_candidates: {
        Args: { p_files: Json; p_job_id: string };
        Returns: { candidate_id: string; candidate_number: number; cv_path: string }[];
      };
      reveal_candidate_identity: {
        Args: { p_candidate_id: string; p_reason: string };
        Returns: undefined;
      };
      save_job_position: {
        Args: {
          p_fields: Json;
          p_job_id?: string;
          p_org_id: string;
          p_requirements: Json;
        };
        Returns: string;
      };
      save_onboarding_plan: {
        Args: {
          p_intro: string;
          p_job_id: string;
          p_meta?: Json;
          p_org_id: string;
          p_plan_id?: string;
          p_tasks: Json;
          p_title: string;
        };
        Returns: string;
      };
      save_training_quiz: {
        Args: { p_questions: Json; p_training_id: string };
        Returns: undefined;
      };
      set_candidate_status: {
        Args: {
          p_candidate_id: string;
          p_comment?: string;
          p_status: Database["public"]["Enums"]["candidate_status"];
        };
        Returns: undefined;
      };
      store_candidate_extraction: {
        Args: { p_candidate_id: string; p_identity: Json; p_redacted_text: string };
        Returns: undefined;
      };
      submit_training_attempt: {
        Args: { p_answers: number[]; p_assignment_id: string };
        Returns: Json;
      };
    };
    Enums: {
      candidate_event_kind: "status_changed" | "identity_revealed";
      candidate_status: "pending" | "reviewed" | "advance" | "no_advance";
      cv_processing_status: "pending" | "processing" | "done" | "failed";
      faq_outcome: "answered" | "not_found" | "error";
      hr_query_status: "open" | "answered";
      job_level: "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | "director";
      job_status: "draft" | "open" | "closed";
      job_tone: "professional" | "friendly" | "dynamic" | "formal";
      job_version_source: "ai" | "manual" | "restored";
      kb_doc_type: "policy" | "handbook" | "agreement" | "benefits" | "other";
      kb_document_status: "pending" | "processing" | "ready" | "failed";
      member_role: "admin" | "hr" | "employee";
      member_status: "active" | "disabled";
      onboarding_phase: "d30" | "d60" | "d90";
      requirement_kind: "required" | "preferred";
      requirement_match: "meets" | "partial" | "not_found";
      training_source_kind: "kb_document" | "upload";
      training_status: "draft" | "published";
      work_mode: "onsite" | "hybrid" | "remote";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
      candidate_event_kind: ["status_changed", "identity_revealed"],
      candidate_status: ["pending", "reviewed", "advance", "no_advance"],
      cv_processing_status: ["pending", "processing", "done", "failed"],
      faq_outcome: ["answered", "not_found", "error"],
      hr_query_status: ["open", "answered"],
      job_level: ["intern", "junior", "mid", "senior", "lead", "manager", "director"],
      job_status: ["draft", "open", "closed"],
      job_tone: ["professional", "friendly", "dynamic", "formal"],
      job_version_source: ["ai", "manual", "restored"],
      kb_doc_type: ["policy", "handbook", "agreement", "benefits", "other"],
      kb_document_status: ["pending", "processing", "ready", "failed"],
      member_role: ["admin", "hr", "employee"],
      member_status: ["active", "disabled"],
      onboarding_phase: ["d30", "d60", "d90"],
      requirement_kind: ["required", "preferred"],
      requirement_match: ["meets", "partial", "not_found"],
      training_source_kind: ["kb_document", "upload"],
      training_status: ["draft", "published"],
      work_mode: ["onsite", "hybrid", "remote"],
    },
  },
} as const;
