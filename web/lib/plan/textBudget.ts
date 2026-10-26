/**
 * El texto también cuenta en el tope diario (auditoría 26 oct, I6). Escribir el cuento (paso 3, de 5 a 11 c) y cambiar
 * una página no van ligados a un email ni a un libro, y el límite por IP es por instancia de Vercel: sin esto, un script
 * con varias IP escribía cuentos sin techo y el tope diario no se enteraba. Antes de llamar al modelo se mira que quepa
 * una estimación; después se apunta lo gastado (tipo `story` en `cuentos_spend`). Solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { dailyRoom, recordSpend, type SpendCheck } from "../generation/budget";
import type { Llm } from "../llm";

export type TextKind = "plan" | "page";

/** Lo que se reserva antes de llamar al modelo (lo alto de lo medido el 20 oct). */
export const TEXT_ESTIMATE_CENTS: Record<TextKind, number> = { plan: 12, page: 2 };

type Db = SupabaseClient<Database> | null;

/** ¿Cabe este texto hoy? Sin base (en local) o con el modelo de prueba, siempre. */
export async function textRoom(db: Db, kind: TextKind, llm: Pick<Llm, "name">, now = new Date()): Promise<SpendCheck> {
  if (!db || llm.name === "mock") return { ok: true };
  return dailyRoom(db, TEXT_ESTIMATE_CENTS[kind], now);
}

/** Apunta lo que ha costado el texto. Si el modelo no tiene precio conocido, la estimación. Nunca falla la petición. */
export async function recordText(db: Db, kind: TextKind, llm: Pick<Llm, "name" | "model">, costCents: number | null): Promise<void> {
  if (!db || llm.name === "mock") return;
  const cents = Math.ceil(costCents ?? TEXT_ESTIMATE_CENTS[kind]);
  if (cents <= 0) return;
  try {
    const r = await recordSpend(db, { leadId: `texto:${kind}`, kind: "story", provider: llm.name, model: llm.model, cents });
    if (!r.ok) console.error(`[texto] gasto sin apuntar: ${r.reason}`);
  } catch (e) {
    console.error(`[texto] gasto sin apuntar: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
}

/** Mensaje para el padre cuando el tope del día está lleno. */
export const TEXT_BUDGET_MESSAGE = "Hoy ya hemos escrito todos los cuentos que podemos. Vuelve mañana y lo escribimos.";
