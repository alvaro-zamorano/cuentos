/**
 * Presupuesto de generación (B3): cuánto se puede gastar por lead y por día UTC. Tabla `cuentos_spend`
 * (docs/sql/cuentos_spend.sql; RLS sin políticas: solo service role).
 *
 *   LEAD_CAP_CENTS   tope por lead antes del pago (por defecto 30, D2 del 13 oct: hoja 1K + portada 2K y hasta 2 cambios de hoja,
 *                    cada uno con su portada: 3 × (4 + 6) c). `paid: true` lo salta (libro pagado;
 *                    ahí manda MAX_COST_CENTS_PER_BOOK del worker).
 *   DAILY_CAP_CENTS  tope global por día UTC (por defecto 500). Cuenta todo el gasto del día. Lo frena todo salvo los
 *                    libros cobrados de verdad con Stripe (16 oct): un cliente que paga no se queda sin libro por el tope;
 *                    a esos los limita MAX_COST_CENTS_PER_BOOK. Los pagos de prueba (`dry-run:<libro>`) sí se frenan,
 *                    porque en la preview cualquiera puede «pagar».
 *
 *   FREE_BOOK_CAP_CENTS  (26 oct) en el flujo nuevo, el tope antes del pago es por libro, no por email: lo que puede
 *                    gastar un cuento gratis (por defecto 60: 3 hojas y 3 portadas, cada una con su repetición del
 *                    control de calidad). Cuántos cuentos gratis empieza cada persona lo limita lib/book/freeLimit.ts
 *                    en la puerta, para que un cuento que empieza siempre termine.
 *
 * Sin cliente admin, o si la lectura falla, canSpend devuelve ok:false: nunca se gasta a ciegas.
 * Dónde se llama: lib/generation/service.ts (al crear los jobs en /api/generate/sample y /book, y antes de cada
 * imagen en /api/generate/run, que también registra el gasto) y el worker (scripts/worker.ts) para los jobs antiguos.
 * /api/jobs solo encola (no genera), así que no comprueba ni registra gasto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { isLiveSession } from "../stripe";

export type SpendKind = "story" | "sheet" | "sample" | "page";

export interface SpendCheck {
  ok: boolean;
  reason?: string;
}

export interface SpendRecord {
  leadId: string;
  kind: SpendKind;
  provider: string;
  model: string;
  cents: number;
}

type Db = SupabaseClient<Database>;

function capFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function leadCapCents(): number {
  return capFromEnv("LEAD_CAP_CENTS", 30);
}

export function freeBookCapCents(): number {
  return capFromEnv("FREE_BOOK_CAP_CENTS", 60);
}

export function dailyCapCents(): number {
  return capFromEnv("DAILY_CAP_CENTS", 500);
}

/** Inicio del día UTC de `now`, en ISO. */
export function utcDayStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function sum(rows: { cost_cents: number | null }[] | null): number {
  return (rows ?? []).reduce((a, r) => a + (r.cost_cents ?? 0), 0);
}

/**
 * ¿El libro tiene un pedido cobrado de verdad (`cs_live_…`)? Solo esos se saltan el tope diario. Un pago con la tarjeta
 * de prueba de Stripe (`cs_test_…`) o el simulado (`dry-run:<libro>`) no: en la preview pública, la tarjeta 4242 pintaba
 * libros con Gemini sin tope (auditoría 26 oct, B1). Si la lectura falla, se trata como no cobrado.
 */
export async function hasChargedOrder(db: Db, bookId: string): Promise<boolean> {
  const { data, error } = await db.from("cuentos_orders").select("stripe_session_id").eq("book_id", bookId).eq("status", "paid");
  if (error || !data) return false;
  return data.some((o) => isLiveSession(o.stripe_session_id));
}

/** ¿Se pueden gastar `cents` más para este lead hoy? Comprueba el tope por lead (salvo `paid`) y el diario (salvo libro cobrado con Stripe). */
export async function canSpend(
  db: Db | null,
  { leadId, cents, paid = false, now = new Date(), leadCap: leadCapOverride }: { leadId: string; cents: number; paid?: boolean; now?: Date; leadCap?: number },
): Promise<SpendCheck> {
  if (!db) return { ok: false, reason: "sin presupuesto configurado" };
  if (!leadId) return { ok: false, reason: "lead sin identificar" };
  if (!Number.isFinite(cents) || cents < 0) return { ok: false, reason: "coste no válido" };

  const charged = paid && (await hasChargedOrder(db, leadId));
  if (!charged) {
    const day = await db.from("cuentos_spend").select("cost_cents").gte("created_at", utcDayStart(now));
    if (day.error) return { ok: false, reason: "no se pudo leer el gasto del día" };
    const dailyCap = dailyCapCents();
    const spentToday = sum(day.data);
    if (spentToday + cents > dailyCap) return { ok: false, reason: `tope diario (${dailyCap} c) alcanzado: ${spentToday} c gastados hoy` };
  }

  if (!paid) {
    const lead = await db.from("cuentos_spend").select("cost_cents").eq("lead_id", leadId);
    if (lead.error) return { ok: false, reason: "no se pudo leer el gasto del lead" };
    const leadCap = leadCapOverride ?? leadCapCents();
    const spentLead = sum(lead.data);
    if (spentLead + cents > leadCap) return { ok: false, reason: `tope por lead (${leadCap} c) alcanzado: ${spentLead} c gastados` };
  }
  return { ok: true };
}

/** Anota un gasto ya hecho. Devuelve ok:false si no hay cliente o falla la escritura (el llamador decide si avisa). */
export async function recordSpend(db: Db | null, rec: SpendRecord): Promise<SpendCheck> {
  if (!db) return { ok: false, reason: "sin presupuesto configurado" };
  const { error } = await db.from("cuentos_spend").insert({
    lead_id: rec.leadId,
    kind: rec.kind,
    provider: rec.provider,
    model: rec.model,
    cost_cents: Math.max(0, Math.round(rec.cents)),
  });
  return error ? { ok: false, reason: `no se pudo registrar el gasto: ${error.message}` } : { ok: true };
}
