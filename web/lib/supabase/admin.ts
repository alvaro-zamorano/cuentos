import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Cliente con service role (salta RLS). Uso: rutas API (vía ./server) y el worker del Mac Mini.
 * Nunca importar desde componentes de cliente. Las variables se leen en tiempo de ejecución.
 */
let cached: SupabaseClient<Database> | null | undefined;

export function createAdminClient(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}
