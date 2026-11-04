// Tipos de la base de datos en el formato de `supabase gen types typescript`.
// Fase 0: escritos a mano a partir de supabase/migrations (el entorno de
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
    };
    Enums: {
      member_role: "admin" | "hr" | "employee";
      member_status: "active" | "disabled";
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
      member_role: ["admin", "hr", "employee"],
      member_status: ["active", "disabled"],
    },
  },
} as const;
