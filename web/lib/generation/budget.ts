/**
 * Presupuesto de generación (B3): cuánto se puede gastar por lead y por día UTC. Tabla `cuentos_spend`
 * (docs/sql/cuentos_spend.sql; RLS sin políticas: solo service role).
 *
 *   LEAD_CAP_CENTS   tope por lead antes del pago (por defecto 30, D2 del 13 oct: hoja 1K + portada 2K y hasta 2 cambios de hoja,
 *                    cada uno con su portada: 3 × (4 + 6) c). `paid: true` lo salta (libro pagado;
 *                    ahí manda MAX_COST_CENTS_PER_BOOK del worker).
 *   DAILY_CAP_CENTS  tope global por día UTC (por defecto 500) para lo que no se cobra. Lo frena todo salvo los
 *                    libros cobrados de verdad con Stripe (16 oct): un cliente que paga no se queda sin libro por el tope;
 *                    a esos los limita MAX_COST_CENTS_PER_BOOK. Desde el 26 oct (auditoría, B2) lo que se pinta para
 *                    ellos tras el cobro tampoco cuenta: con unas cinco ventas, el resto del día nadie podía dibujar
 *                    gratis. Los pagos de prueba (`cs_test_…`, `dry-run:<libro>`) sí cuentan y se frenan, porque en la
 *                    preview cualquiera puede «pagar». Al pasar del 80 % llega un aviso a MAIL_FORWARD_TO.
 *                    El texto también cuenta (I6, lib/plan/textBudget.ts): escribir el cuento y cambiar páginas.
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
import { sendSupportNotice } from "../mail";
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

const DAY_MS = 24 * 3600 * 1000;
/** Un libro se guarda 30 días desde el pago: lo que se pinta hoy para uno cobrado es de un pedido de estos últimos días. */
const PAID_LOOKBACK_MS = 40 * DAY_MS;

export interface FreeSpendToday {
  /** Lo gastado hoy (UTC) que cuenta para el tope diario. */
  total: number;
  /** ¿Cuenta un gasto de este lead en este momento? No, si es de un libro cobrado de verdad y posterior al cobro. */
  counts: (leadId: string, at: number) => boolean;
}

/**
 * Lo gastado hoy que cuenta para el tope diario (B2): todo menos lo pintado para libros cobrados de verdad (`cs_live_`)
 * después de cobrarlos. Lo de antes del pago (hoja y portada gratis) sí cuenta. null si falla la lectura.
 */
export async function freeSpendToday(db: Db, now = new Date()): Promise<FreeSpendToday | null> {
  const dayStart = utcDayStart(now);
  const day = await db.from("cuentos_spend").select("cost_cents, lead_id, created_at").gte("created_at", dayStart);
  if (day.error || !day.data) return null;
  const since = new Date(Date.parse(dayStart) - PAID_LOOKBACK_MS).toISOString();
  const orders = await db.from("cuentos_orders").select("book_id, stripe_session_id, created_at").eq("status", "paid").like("stripe_session_id", "cs_live_%").gte("created_at", since);
  if (orders.error || !orders.data) return null;
  const paidAt = new Map<string, number>();
  for (const o of orders.data) {
    if (!isLiveSession(o.stripe_session_id)) continue;
    const t = Date.parse(o.created_at);
    const prev = paidAt.get(o.book_id);
    if (prev === undefined || t < prev) paidAt.set(o.book_id, t);
  }
  const counts = (leadId: string, at: number) => {
    const t = paidAt.get(leadId);
    return t === undefined || at < t;
  };
  const total = day.data.reduce((a, r) => (counts(r.lead_id, Date.parse(r.created_at)) ? a + (r.cost_cents ?? 0) : a), 0);
  return { total, counts };
}

/** ¿Caben `cents` más hoy en el tope diario? Sin lead: para el texto (auditoría 26 oct, I6) y dentro de canSpend. */
export async function dailyRoom(db: Db | null, cents: number, now = new Date()): Promise<SpendCheck> {
  if (!db) return { ok: false, reason: "sin presupuesto configurado" };
  const day = await freeSpendToday(db, now);
  if (!day) return { ok: false, reason: "no se pudo leer el gasto del día" };
  const cap = dailyCapCents();
  return day.total + cents > cap ? { ok: false, reason: `tope diario (${cap} c) alcanzado: ${day.total} c gastados hoy` } : { ok: true };
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
    const room = await dailyRoom(db, cents, now);
    if (!room.ok) return room;
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

/** Aviso del 80 %: a esta fracción del tope diario llega un email a MAIL_FORWARD_TO (B2). */
export const DAILY_ALERT_AT = 0.8;

type Notify = (subject: string, text: string) => Promise<{ sent: boolean }>;

/**
 * Anota un gasto ya hecho. Devuelve ok:false si no hay cliente o falla la escritura (el llamador decide si avisa).
 * Si este gasto hace pasar del 80 % el tope diario, avisa por email (una vez por cruce; si falla, solo queda en el log).
 */
export async function recordSpend(db: Db | null, rec: SpendRecord, { now = new Date(), notify = sendSupportNotice }: { now?: Date; notify?: Notify } = {}): Promise<SpendCheck> {
  if (!db) return { ok: false, reason: "sin presupuesto configurado" };
  const cents = Math.max(0, Math.round(rec.cents));
  const { error } = await db.from("cuentos_spend").insert({
    lead_id: rec.leadId,
    kind: rec.kind,
    provider: rec.provider,
    model: rec.model,
    cost_cents: cents,
  });
  if (error) return { ok: false, reason: `no se pudo registrar el gasto: ${error.message}` };
  if (cents > 0) await dailyAlert(db, rec.leadId, cents, now, notify);
  return { ok: true };
}

async function dailyAlert(db: Db, leadId: string, cents: number, now: Date, notify: Notify): Promise<void> {
  try {
    const day = await freeSpendToday(db, now);
    if (!day || !day.counts(leadId, now.getTime())) return;
    const cap = dailyCapCents();
    const line = DAILY_ALERT_AT * cap;
    if (cap <= 0 || day.total < line || day.total - cents >= line) return;
    const r = await notify(
      `Gasto del día al ${Math.round((day.total / cap) * 100)} %`,
      [
        `Hoy (UTC) se llevan ${day.total} c de ${cap} c (DAILY_CAP_CENTS) en lo que no se ha cobrado: dibujos y texto.`,
        "Al llegar al tope, nadie más puede escribir ni dibujar gratis hasta mañana. Lo que se pinta para libros cobrados no cuenta.",
        "Si hace falta, sube DAILY_CAP_CENTS en Vercel. El detalle, en la tabla cuentos_spend de Supabase.",
      ].join("\n"),
    );
    if (!r.sent) console.warn("[presupuesto] aviso del 80 % sin enviar");
  } catch (e) {
    console.warn(`[presupuesto] aviso del 80 %: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
}
