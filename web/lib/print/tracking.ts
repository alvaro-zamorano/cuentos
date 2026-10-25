/**
 * Página propia de seguimiento del libro impreso (24 oct, Álvaro): textos, hitos y fechas. Sin dependencias de
 * servidor, para probarlo en los tests. Los datos vienen de `trackingView` (lib/book/print.ts).
 */
import type { PrintInfo, PrintStatus, PrintStep } from "./types";

const TZ = "Europe/Madrid";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Día y mes de un instante, en Madrid: «24 de octubre». */
export function dayLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return `${get("day")} de ${MONTHS[get("month") - 1]}`;
}

/** Fecha sin hora (AAAA-MM-DD) como día y mes, sin pasar por zonas horarias. */
function plainDay(d: string): { day: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { day, month } : null;
}

/** Entrega estimada en una frase: «el 29 de octubre», «entre el 29 y el 31 de octubre» o «entre el 30 de octubre y el 2 de noviembre». */
export function etaLabel(from?: string | null, to?: string | null): string | null {
  const a = from ? plainDay(from) : null;
  const b = to ? plainDay(to) : null;
  const one = a ?? b;
  if (!one) return null;
  if (!a || !b || (a.day === b.day && a.month === b.month)) return `el ${one.day} de ${MONTHS[one.month - 1]}`;
  if (a.month === b.month) return `entre el ${a.day} y el ${b.day} de ${MONTHS[a.month - 1]}`;
  return `entre el ${a.day} de ${MONTHS[a.month - 1]} y el ${b.day} de ${MONTHS[b.month - 1]}`;
}

export interface TrackStep {
  key: "paid" | PrintStep;
  label: string;
  state: "done" | "current" | "todo";
  date: string | null;
}

const ORDER: { key: TrackStep["key"]; label: string }[] = [
  { key: "paid", label: "Pedido recibido" },
  { key: "sent", label: "En la imprenta" },
  { key: "in_production", label: "Imprimiéndose" },
  { key: "shipped", label: "De camino" },
  { key: "delivered", label: "Entregado" },
];

/** Hasta qué hito ha llegado cada estado (índice en ORDER). */
const REACHED: Record<PrintStatus, number> = {
  awaiting_approval: 0,
  sending: 0,
  failed: 0,
  sent: 1,
  in_production: 2,
  shipped: 3,
  delivered: 4,
  returned: 3,
  canceled: 0,
};

/** Los cinco hitos con su estado. El alcanzado es el actual, salvo «Entregado», que ya está hecho. */
export function trackSteps(status: PrintStatus, paidAt: string, sentAt: string | null, info: PrintInfo): TrackStep[] {
  const reached = REACHED[status];
  const steps = info.steps ?? {};
  return ORDER.map(({ key, label }, i) => {
    const date = key === "paid" ? paidAt : key === "sent" ? (steps.sent ?? sentAt) : (steps[key] ?? null);
    const state: TrackStep["state"] = i < reached || (i === reached && status === "delivered") ? "done" : i === reached ? "current" : "todo";
    return { key, label, state, date: state === "todo" ? null : dayLabel(date) };
  });
}

/** Titular y frase de cada estado, para quien compra (y quizá regala). */
export const TRACK_COPY: Record<PrintStatus, { title: string; text: string }> = {
  awaiting_approval: { title: "Esperando tu visto bueno", text: "El libro aún no ha salido hacia la imprenta. Lo mandamos cuando lo revises y pulses «Mandar a imprimir»." },
  sending: { title: "Camino de la imprenta", text: "Estamos preparando el libro para la imprenta. En unos minutos lo tienen." },
  failed: { title: "Lo estamos revisando", text: "Ha habido un problema al mandarlo a la imprenta. Lo estamos mirando y te escribimos en cuanto salga." },
  sent: { title: "En la imprenta", text: "Lo han recibido y van a imprimirlo y encuadernarlo en tapa dura. Te escribimos cuando salga." },
  in_production: { title: "Imprimiéndose", text: "Lo están imprimiendo y encuadernando. Te escribimos cuando salga hacia tu casa." },
  shipped: { title: "Va de camino", text: "Ha salido de la imprenta. Abajo tienes el seguimiento del transportista." },
  delivered: { title: "Entregado", text: "Según el transportista, el libro ya ha llegado. Que lo disfrutéis." },
  returned: { title: "El envío ha vuelto", text: "El transportista no lo ha podido entregar. Escríbenos y lo resolvemos." },
  canceled: { title: "Pedido cancelado", text: "El pedido de imprenta se ha cancelado. Escríbenos si no lo esperabas." },
};
