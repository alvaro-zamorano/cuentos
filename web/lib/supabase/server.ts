import "server-only";
import { createAdminClient } from "./admin";

/**
 * Cliente Supabase para rutas API (solo servidor; `server-only` rompe el build si se importa desde el cliente).
 * Devuelve null si faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY:
 * /api/lead degrada a ok sin persistir; /api/books y /api/jobs responden 503.
 */
export function supabaseAdmin() {
  return createAdminClient();
}
