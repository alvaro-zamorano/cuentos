/**
 * Novedades por email (menores de la auditoría 26 oct): la prueba del consentimiento y la baja. Decisión de Álvaro
 * (27 oct): la baja y el registro ahora; la confirmación por email (doble opt-in), antes del primer envío. Hoy no se manda
 * ninguna novedad.
 *
 * - Al marcar la casilla se guarda cuándo y con qué texto (`marketing_at`, `marketing_text`, migración 0015).
 * - No marcarla otra vez al empezar otro libro no da de baja: el consentimiento sigue hasta que se retira (antes se
 *   perdía sin que nadie lo pidiera). La baja va por su enlace (/baja?t=…) o escribiendo a hola@.
 * - La baja es del buzón (`email_norm`, como en cuentos_books): todas sus filas, de cualquier edición y con el email
 *   escrito de cualquier forma. Y no la deshace volver a marcar la casilla: el email del paso 4 no está verificado, así
 *   que cualquiera podría escribir el de otro. Darse de alta otra vez después de una baja solo podrá hacerse con la
 *   confirmación por email que se hará antes del primer envío.
 * - Cada fila tiene su llave de baja al azar (`unsubscribe_token`): el enlace de cada novedad lleva la suya.
 * - Solo se le podrá mandar una novedad a un buzón con `marketing` y sin `unsubscribed_at` en ninguna de sus filas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { normalizeEmail } from "./emailNorm";

type Db = SupabaseClient<Database>;

/** El texto de la casilla, tal cual se enseña (components/crear/StepCast.tsx) y se guarda con el consentimiento. */
export const MARKETING_TEXT = "Quiero recibir avisos de nuevas ideas y ediciones. Opcional; puedes darte de baja cuando quieras.";

/** El enlace de baja que se ve en el cuerpo de cada novedad: abre /baja, donde hay que pulsar un botón. */
export function unsubscribePageLink(origin: string, token: string): string {
  return `${origin}/baja?t=${encodeURIComponent(token)}`;
}

/**
 * La URL de la baja en un clic de los gestores de correo (cabecera List-Unsubscribe con List-Unsubscribe-Post, RFC 8058):
 * hacen un POST directo a la API, sin abrir la página.
 */
export function unsubscribeOneClickUrl(origin: string, token: string): string {
  return `${origin}/api/baja?t=${encodeURIComponent(token)}`;
}

/** Las cabeceras de baja de cada novedad. */
export function unsubscribeHeaders(origin: string, token: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeOneClickUrl(origin, token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda el email del paso 4. Con la casilla marcada, el consentimiento con su fecha y su texto, salvo que ese buzón se
 * diera de baja antes: entonces solo se asegura la fila, sin novedades. Sin marcarla, solo crea la fila si no existe: no
 * toca un consentimiento que ya hubiera.
 */
export async function recordLead(
  db: Db,
  { email, marketing, now = new Date() }: { email: string; marketing: boolean; now?: Date },
): Promise<{ ok: boolean; error?: string; unsubscribed?: boolean }> {
  const base = { email, edition: "illustrated", source: "cuentos-web" };
  let unsubscribed = false;
  if (marketing) {
    const { data, error } = await db.from("cuentos_leads").select("id").eq("email_norm", normalizeEmail(email)).not("unsubscribed_at", "is", null).limit(1);
    if (error) return { ok: false, error: error.code ?? error.message };
    unsubscribed = (data ?? []).length > 0;
  }
  const { error } =
    marketing && !unsubscribed
      ? await db.from("cuentos_leads").upsert({ ...base, marketing: true, marketing_at: now.toISOString(), marketing_text: MARKETING_TEXT }, { onConflict: "email,edition" })
      : await db.from("cuentos_leads").upsert({ ...base, marketing: false }, { onConflict: "email,edition", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.code ?? error.message };
  return unsubscribed ? { ok: true, unsubscribed } : { ok: true };
}

/**
 * La baja: todas las filas del buzón de esa llave dejan de ser `marketing` y apuntan cuándo (la primera fecha se queda si
 * ya estaban de baja). `not_found` con una llave que no existe (o mal escrita).
 */
export async function unsubscribe(db: Db, token: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: "not_found" | "db" }> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "not_found" };
  const { data: row, error } = await db.from("cuentos_leads").select("email_norm").eq("unsubscribe_token", token).maybeSingle();
  if (error) return { ok: false, error: "db" };
  if (!row) return { ok: false, error: "not_found" };
  const rows = db.from("cuentos_leads").update({ marketing: false, unsubscribed_at: now.toISOString() });
  const { error: e2 } = await (row.email_norm ? rows.eq("email_norm", row.email_norm) : rows.eq("unsubscribe_token", token)).is("unsubscribed_at", null);
  if (e2) return { ok: false, error: "db" };
  return { ok: true };
}
