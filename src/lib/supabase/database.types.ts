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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
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
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          organization_name: string;
          role: Database["public"]["Enums"]["member_role"];
          status: string;
        }[];
      };
      org_ai_spend_current_month: {
        Args: { p_org: string };
        Returns: number;
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
    };
    Enums: {
      candidate_event_kind: "status_changed" | "identity_revealed";
      candidate_status: "pending" | "reviewed" | "advance" | "no_advance";
      cv_processing_status: "pending" | "processing" | "done" | "failed";
      job_level: "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | "director";
      job_status: "draft" | "open" | "closed";
      job_tone: "professional" | "friendly" | "dynamic" | "formal";
      job_version_source: "ai" | "manual" | "restored";
      member_role: "admin" | "hr" | "employee";
      member_status: "active" | "disabled";
      requirement_kind: "required" | "preferred";
      requirement_match: "meets" | "partial" | "not_found";
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
      job_level: ["intern", "junior", "mid", "senior", "lead", "manager", "director"],
      job_status: ["draft", "open", "closed"],
      job_tone: ["professional", "friendly", "dynamic", "formal"],
      job_version_source: ["ai", "manual", "restored"],
      member_role: ["admin", "hr", "employee"],
      member_status: ["active", "disabled"],
      requirement_kind: ["required", "preferred"],
      requirement_match: ["meets", "partial", "not_found"],
      work_mode: ["onsite", "hybrid", "remote"],
    },
  },
} as const;
