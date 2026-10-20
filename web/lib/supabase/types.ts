// Tipos de Supabase limitados a las tablas cuentos_* (la base es compartida con otros productos).
// Generado con generate_typescript_types (MCP Supabase) el 8 oct 2026 y filtrado; regenerar al cambiar el esquema.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cuentos_assets: {
        Row: {
          category: string | null
          created_at: string
          id: number
          kind: string
          path: string
          style_id: string
          trait_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: never
          kind: string
          path: string
          style_id: string
          trait_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: never
          kind?: string
          path?: string
          style_id?: string
          trait_id?: string | null
        }
        Relationships: []
      }
      cuentos_books: {
        Row: {
          created_at: string
          draft: Json
          edition: string
          email: string | null
          expires_at: string
          id: string
          public_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft: Json
          edition?: string
          email?: string | null
          expires_at?: string
          id?: string
          public_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          edition?: string
          email?: string | null
          expires_at?: string
          id?: string
          public_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      // job_key, variant, paid y storage_path añadidas a mano (brief 7, docs/sql/cuentos_generation_jobs_b3.sql).
      cuentos_feedback: {
        Row: {
          book_id: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: string
          note: string | null
          page_n: number
          reason: string
          style_id: string | null
          variant: number | null
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: string
          note?: string | null
          page_n: number
          reason: string
          style_id?: string | null
          variant?: number | null
        }
        Update: {
          book_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          note?: string | null
          page_n?: number
          reason?: string
          style_id?: string | null
          variant?: number | null
        }
        Relationships: []
      }
      cuentos_generation_jobs: {
        Row: {
          attempts: number
          book_id: string
          candidates: Json
          chosen: string | null
          cost_cents: number
          created_at: string
          error: string | null
          id: string
          job_key: string | null
          kind: string
          page_n: number | null
          paid: boolean
          prompt: string
          references: Json
          status: string
          storage_path: string | null
          style_id: string
          updated_at: string
          variant: number
        }
        Insert: {
          attempts?: number
          book_id: string
          candidates?: Json
          chosen?: string | null
          cost_cents?: number
          created_at?: string
          error?: string | null
          id?: string
          job_key?: string | null
          kind: string
          page_n?: number | null
          paid?: boolean
          prompt: string
          references?: Json
          status?: string
          storage_path?: string | null
          style_id: string
          updated_at?: string
          variant?: number
        }
        Update: {
          attempts?: number
          book_id?: string
          candidates?: Json
          chosen?: string | null
          cost_cents?: number
          created_at?: string
          error?: string | null
          id?: string
          job_key?: string | null
          kind?: string
          page_n?: number | null
          paid?: boolean
          prompt?: string
          references?: Json
          status?: string
          storage_path?: string | null
          style_id?: string
          updated_at?: string
          variant?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuentos_generation_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "cuentos_books"
            referencedColumns: ["id"]
          },
        ]
      }
      // Añadida a mano (brief 5) con las columnas acordadas; regenerar los tipos cuando la tabla exista.
      cuentos_stories: {
        Row: {
          cost_cents: number
          created_at: string
          fallback: boolean
          id: string
          input: Json
          input_hash: string
          issues: Json
          model: string
          provider: string
          story: Json
          usage: Json
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          fallback?: boolean
          id?: string
          input: Json
          input_hash: string
          issues?: Json
          model: string
          provider: string
          story: Json
          usage?: Json
        }
        Update: {
          cost_cents?: number
          created_at?: string
          fallback?: boolean
          id?: string
          input?: Json
          input_hash?: string
          issues?: Json
          model?: string
          provider?: string
          story?: Json
          usage?: Json
        }
        Relationships: []
      }
      // Añadida a mano (brief 6, docs/sql/cuentos_spend.sql); regenerar los tipos cuando la tabla exista.
      cuentos_spend: {
        Row: {
          cost_cents: number
          created_at: string
          id: string
          kind: string
          lead_id: string
          model: string
          provider: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          id?: string
          kind: string
          lead_id: string
          model: string
          provider: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          model?: string
          provider?: string
        }
        Relationships: []
      }
      cuentos_leads: {
        Row: {
          created_at: string
          edition: string
          email: string
          id: number
          marketing: boolean
          source: string
        }
        Insert: {
          created_at?: string
          edition?: string
          email: string
          id?: never
          marketing?: boolean
          source?: string
        }
        Update: {
          created_at?: string
          edition?: string
          email?: string
          id?: never
          marketing?: boolean
          source?: string
        }
        Relationships: []
      }
      cuentos_orders: {
        Row: {
          amount_cents: number
          book_id: string
          created_at: string
          currency: string
          edition: string
          id: string
          print_error: string | null
          print_order_id: string | null
          print_reminded_at: string | null
          print_sent_at: string | null
          print_shipped_mailed_at: string | null
          print_status: string | null
          print_tracking_url: string | null
          print_updated_at: string | null
          shipping: Json | null
          status: string
          stripe_session_id: string | null
        }
        Insert: {
          amount_cents: number
          book_id: string
          created_at?: string
          currency?: string
          edition: string
          id?: string
          print_error?: string | null
          print_order_id?: string | null
          print_reminded_at?: string | null
          print_sent_at?: string | null
          print_shipped_mailed_at?: string | null
          print_status?: string | null
          print_tracking_url?: string | null
          print_updated_at?: string | null
          shipping?: Json | null
          status?: string
          stripe_session_id?: string | null
        }
        Update: {
          amount_cents?: number
          book_id?: string
          created_at?: string
          currency?: string
          edition?: string
          id?: string
          print_error?: string | null
          print_order_id?: string | null
          print_reminded_at?: string | null
          print_sent_at?: string | null
          print_shipped_mailed_at?: string | null
          print_status?: string | null
          print_tracking_url?: string | null
          print_updated_at?: string | null
          shipping?: Json | null
          status?: string
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentos_orders_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "cuentos_books"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
