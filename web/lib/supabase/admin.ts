import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Cliente con service role (salta RLS). Uso: rutas API (vía ./server) y el worker del Mac Mini.
 * Nunca importar desde componentes de cliente. Las variables se leen en tiempo de ejecución.
 */
let cached: SupabaseClient<Database> | null | undefined;

export function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

/**
 * Qué tipo de clave es, sin exponerla: "secret" / "publishable" (claves sb_ nuevas) o "jwt:<role>" (claves JWT antiguas,
 * role = service_role | anon). Sirve para detectar que se pegó la anon/publishable donde va la de servicio.
 */
export function keyKind(key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  const parts = key.split(".");
  if (parts.length !== 3) return "unknown";
  try {
    const role = (JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown }).role;
    return typeof role === "string" ? `jwt:${role}` : "jwt";
  } catch {
    return "unknown";
  }
}

export function createAdminClient(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRoleKey();
  cached = url && key ? createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}
