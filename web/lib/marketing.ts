/**
 * Novedades por email (menores de la auditoría 26 oct): la prueba del consentimiento y la baja. Decisión de Álvaro
 * (27 oct): la baja y el registro ahora; la confirmación por email (doble opt-in), antes del primer envío. Hoy no se manda
 * ninguna novedad.
 *
 * - Al marcar la casilla se guarda cuándo y con qué texto (`marketing_at`, `marketing_text`, migración 0015).
 * - No marcarla otra vez al empezar otro libro no da de baja: el consentimiento sigue hasta que se retira (antes se
 *   perdía sin que nadie lo pidiera). La baja va por su enlace (/baja?t=…) o escribiendo a hola@.
 * - Cada fila tiene su llave de baja al azar (`unsubscribe_token`): el enlace de cada novedad lleva la suya.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

type Db = SupabaseClient<Database>;

/** El texto de la casilla, tal cual se enseña (components/crear/StepCast.tsx) y se guarda con el consentimiento. */
export const MARKETING_TEXT = "Quiero recibir avisos de nuevas ideas y ediciones. Opcional; puedes darte de baja cuando quieras.";

/** El enlace de baja de un email de novedades (con List-Unsubscribe, la misma URL vale para la baja en un clic). */
export function unsubscribeLink(origin: string, token: string): string {
  return `${origin}/baja?t=${encodeURIComponent(token)}`;
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda el email del paso 4. Con la casilla marcada, el consentimiento con su fecha y su texto (y deshace una baja
 * anterior: lo ha vuelto a pedir). Sin marcarla, solo crea la fila si no existe: no toca un consentimiento que ya hubiera.
 */
export async function recordLead(db: Db, { email, marketing, now = new Date() }: { email: string; marketing: boolean; now?: Date }): Promise<{ ok: boolean; error?: string }> {
  const base = { email, edition: "illustrated", source: "cuentos-web" };
  const { error } = marketing
    ? await db.from("cuentos_leads").upsert({ ...base, marketing: true, marketing_at: now.toISOString(), marketing_text: MARKETING_TEXT, unsubscribed_at: null }, { onConflict: "email,edition" })
    : await db.from("cuentos_leads").upsert({ ...base, marketing: false }, { onConflict: "email,edition", ignoreDuplicates: true });
  return error ? { ok: false, error: error.code ?? error.message } : { ok: true };
}

/** La baja: deja de ser `marketing` y apunta cuándo. `not_found` con una llave que no existe (o mal escrita). */
export async function unsubscribe(db: Db, token: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: "not_found" | "db" }> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "not_found" };
  const { data, error } = await db.from("cuentos_leads").update({ marketing: false, unsubscribed_at: now.toISOString() }).eq("unsubscribe_token", token).select("id");
  if (error) return { ok: false, error: "db" };
  return data && data.length > 0 ? { ok: true } : { ok: false, error: "not_found" };
}
