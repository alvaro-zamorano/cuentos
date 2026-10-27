/**
 * Presupuesto de generación (B3): cuánto se puede gastar por lead y por día (de Madrid). Tabla `cuentos_spend`
 * (supabase/migrations/0009_cuentos_9_spend.sql; RLS sin políticas: solo service role).
 *
 *   LEAD_CAP_CENTS   tope por lead antes del pago (por defecto 30, D2 del 13 oct: hoja 1K + portada 2K y hasta 2 cambios de hoja,
 *                    cada uno con su portada: 3 × (4 + 6) c). `paid: true` lo salta (libro pagado;
 *                    ahí manda MAX_COST_CENTS_PER_BOOK del worker).
 *   DAILY_CAP_CENTS  tope global por día de Madrid (por defecto 500) para lo que no se cobra. Lo frena todo salvo los
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

/**
 * El día del tope es el de España (menores de la auditoría 26 oct): antes era el UTC y el contador volvía a cero a la
 * 01:00 o las 02:00 de Madrid, mientras el aviso decía «vuelve mañana».
 */
export const CAP_TZ = "Europe/Madrid";

/** Lo que adelanta la hora de `tz` a la UTC en ese momento, en ms. */
function tzOffsetMs(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at.getTime() / 1000) * 1000;
}

/** La fecha del día del tope (AAAA-MM-DD, hora de Madrid). */
export function capDay(now = new Date()): string {
  return new Date(now.getTime() + tzOffsetMs(now, CAP_TZ)).toISOString().slice(0, 10);
}

/** Medianoche de Madrid del día de `now`, en ISO (UTC). */
export function capDayStart(now = new Date()): string {
  const [y, m, d] = capDay(now).split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  // el desfase de esa medianoche (el día del cambio de hora no es el de ahora)
  let t = midnight - tzOffsetMs(now, CAP_TZ);
  t = midnight - tzOffsetMs(new Date(t), CAP_TZ);
  return new Date(t).toISOString();
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
  /** Lo gastado hoy (día de Madrid) que cuenta para el tope diario. */
  total: number;
  /** ¿Cuenta un gasto de este lead en este momento? No, si es de un libro cobrado de verdad y posterior al cobro. */
  counts: (leadId: string, at: number) => boolean;
}

/** Supabase devuelve como mucho 1000 filas por consulta: se piden por páginas (revisión 26 oct). null si falla. */
const PAGE_ROWS = 1000;
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < 50 * PAGE_ROWS; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < PAGE_ROWS) break;
  }
  return out;
}

/**
 * Lo gastado hoy que cuenta para el tope diario (B2): todo menos lo pintado para libros cobrados de verdad (`cs_live_`)
 * después de cobrarlos. Lo de antes del pago (hoja y portada gratis) sí cuenta. null si falla la lectura.
 */
export async function freeSpendToday(db: Db, now = new Date()): Promise<FreeSpendToday | null> {
  const dayStart = capDayStart(now);
  const day = await allRows((from, to) => db.from("cuentos_spend").select("cost_cents, lead_id, created_at").gte("created_at", dayStart).order("created_at", { ascending: true }).range(from, to));
  if (!day) return null;
  const since = new Date(Date.parse(dayStart) - PAID_LOOKBACK_MS).toISOString();
  const orders = await allRows((from, to) =>
    db.from("cuentos_orders").select("book_id, stripe_session_id, created_at").eq("status", "paid").like("stripe_session_id", "cs_live_%").gte("created_at", since).order("created_at", { ascending: true }).range(from, to),
  );
  if (!orders) return null;
  const paidAt = new Map<string, number>();
  for (const o of orders) {
    if (!isLiveSession(o.stripe_session_id)) continue;
    const t = Date.parse(o.created_at);
    const prev = paidAt.get(o.book_id);
    if (prev === undefined || t < prev) paidAt.set(o.book_id, t);
  }
  const counts = (leadId: string, at: number) => {
    const t = paidAt.get(leadId);
    return t === undefined || at < t;
  };
  const total = day.reduce((a, r) => (counts(r.lead_id, Date.parse(r.created_at)) ? a + (r.cost_cents ?? 0) : a), 0);
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
 * Si el gasto del día pasa del 80 % del tope, avisa por email una vez al día (si falla, solo queda en el log).
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
  if (cents > 0) await dailyAlert(db, now, notify);
  return { ok: true };
}

async function dailyAlert(db: Db, now: Date, notify: Notify): Promise<void> {
  try {
    const cap = dailyCapCents();
    if (cap <= 0) return;
    const day = await freeSpendToday(db, now);
    if (!day || day.total < DAILY_ALERT_AT * cap) return;
    // una vez al día, con una fila de gasto cero como marca (sin tabla nueva). Antes se miraba si este gasto cruzaba la
    // línea, y con varios gastos a la vez el aviso podía no salir nunca (revisión 26 oct); ahora, como mucho, sale dos veces
    const marker = `aviso-tope:${capDay(now)}`;
    const seen = await db.from("cuentos_spend").select("id").eq("lead_id", marker).limit(1);
    if (seen.error || (seen.data && seen.data.length > 0)) return;
    const mark = await db.from("cuentos_spend").insert({ lead_id: marker, kind: "story", provider: "aviso", model: "80%", cost_cents: 0 });
    if (mark.error) return;
    const r = await notify(
      `Gasto del día al ${Math.round((day.total / cap) * 100)} %`,
      [
        `Hoy (día de Madrid) se llevan ${day.total} c de ${cap} c (DAILY_CAP_CENTS) en lo que no se ha cobrado: dibujos y texto.`,
        "Al llegar al tope, nadie más puede escribir ni dibujar gratis hasta mañana. Lo que se pinta para libros cobrados no cuenta.",
        "Si hace falta, sube DAILY_CAP_CENTS en Vercel. El detalle, en la tabla cuentos_spend de Supabase.",
      ].join("\n"),
    );
    if (!r.sent) console.warn("[presupuesto] aviso del 80 % sin enviar");
  } catch (e) {
    console.warn(`[presupuesto] aviso del 80 %: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
}
