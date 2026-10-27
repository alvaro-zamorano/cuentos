/**
 * Stripe Checkout sin SDK (B5): crear la sesión de pago y verificar el webhook. Sin STRIPE_SECRET_KEY no hay pago real
 * (el libro ofrece el pago de prueba si NEXT_PUBLIC_DRY_RUN_PAYMENT=1, o «muy pronto»). Solo servidor.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function stripeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.STRIPE_SECRET_KEY?.trim() && !!env.STRIPE_WEBHOOK_SECRET?.trim();
}

export type PaymentMode = "stripe" | "dry-run" | "none";

/**
 * Cómo se paga en este despliegue: Stripe si están sus dos claves; si no, el pago de prueba con
 * NEXT_PUBLIC_DRY_RUN_PAYMENT=1 (nunca en producción); si no, «muy pronto».
 */
export function paymentMode(env: Record<string, string | undefined> = process.env): PaymentMode {
  if (stripeEnabled(env)) return "stripe";
  if (dryRunPaymentAllowed(env)) return "dry-run";
  return "none";
}

/** El pago de prueba nunca regala libros en producción, aunque se quede puesta la variable. */
export function dryRunPaymentAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PUBLIC_DRY_RUN_PAYMENT === "1" && env.VERCEL_ENV !== "production";
}

/**
 * Renuncia al desistimiento (art. 103 c) y m) TRLGDCU): libro personalizado y contenido digital. Quien paga marca la casilla
 * del paso 5; el servidor no abre el pago sin ella y la deja apuntada en los metadatos de Stripe (sesión y cobro), que
 * duran más que el libro. WAIVER_VERSION cambia si cambia el texto de la casilla.
 */
export const WAIVER_VERSION = "2026-10-16";

export function waiverAccepted(body: Record<string, unknown> | null | undefined): boolean {
  return body?.waiver === true;
}

export interface CheckoutInput {
  bookId: string;
  email: string | null;
  amountCents: number;
  /** Tapa dura (con envío y el PDF) o solo el PDF. Va en los metadatos: el webhook crea el pedido de esa edición. */
  edition?: "hardcover" | "illustrated";
  origin: string;
  /** Momento (ISO) en que se aceptó la renuncia al desistimiento. */
  waiverAt?: string;
  /** Pasar a tapa dura un libro ya pagado en PDF: el webhook crea un segundo pedido, de tapa dura. */
  upgrade?: boolean;
}

/** Vida de una sesión de pago: 35 minutos. */
export const CHECKOUT_TTL_S = 35 * 60;

/** Cuerpo form-encoded de /v1/checkout/sessions (exportado para los tests). */
export function checkoutBody({ bookId, email, amountCents, origin, waiverAt, edition = "illustrated", upgrade = false }: CheckoutInput, now = Date.now()): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  // la sesión caduca a los 35 min (Stripe admite de 30 min a 24 h; por defecto, 24 h): menos tiempo con dos pagos
  // abiertos para el mismo libro si se vuelve atrás o se abre en dos pestañas (auditoría 26 oct, B7)
  p.set("expires_at", String(Math.floor(now / 1000) + CHECKOUT_TTL_S));
  p.set("success_url", `${origin}/crear?b=${bookId}&pagado=1${upgrade ? "&mejora=1" : ""}`);
  p.set("cancel_url", `${origin}/crear?b=${bookId}`);
  p.set("client_reference_id", bookId);
  p.set("metadata[bookId]", bookId);
  p.set("payment_intent_data[metadata][bookId]", bookId);
  p.set("metadata[edition]", edition);
  p.set("payment_intent_data[metadata][edition]", edition);
  if (upgrade) {
    p.set("metadata[upgrade]", "1");
    p.set("payment_intent_data[metadata][upgrade]", "1");
  }
  if (waiverAt) {
    for (const k of ["metadata", "payment_intent_data[metadata]"]) {
      p.set(`${k}[withdrawal_waiver_at]`, waiverAt);
      p.set(`${k}[withdrawal_waiver_version]`, WAIVER_VERSION);
    }
  }
  if (email) p.set("customer_email", email);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "eur");
  p.set("line_items[0][price_data][unit_amount]", String(amountCents));
  const hard = edition === "hardcover";
  // sin el título del cuento, que suele llevar el nombre del niño: Stripe guarda el nombre del producto años (menores de
  // la auditoría 26 oct)
  const name = upgrade ? "Pasar a tapa dura" : hard ? "Libro de tapa dura personalizado" : "Libro ilustrado personalizado";
  p.set("line_items[0][price_data][product_data][name]", name);
  p.set(
    "line_items[0][price_data][product_data][description]",
    upgrade
      ? "La diferencia hasta el libro apaisado de tapa dura, con envío a la Península y Baleares incluido. El PDF ya lo tienes."
      : hard
        ? "Libro apaisado de tapa dura con 12 ilustraciones, envío a la Península y Baleares incluido, y el PDF."
        : "12 ilustraciones, revisión página a página y PDF para imprimir en A4 apaisado.",
  );
  p.set("locale", "es");
  return p;
}

export async function createCheckout(input: CheckoutInput): Promise<{ url: string; id: string } | { error: string }> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { error: "stripe_off" };
  let res: Response;
  try {
    res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
      body: checkoutBody(input),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { error: "stripe_network" };
  }
  const json = (await res.json().catch(() => null)) as { url?: string; id?: string; error?: { type?: string } } | null;
  if (!res.ok || !json?.url || !json.id) return { error: `stripe_${res.status}_${json?.error?.type ?? ""}` };
  return { url: json.url, id: json.id };
}

/**
 * La sesión de Checkout de un cobro (devoluciones y disputas, I5: los eventos traen el PaymentIntent, no la sesión).
 * `{ id: null }` si Stripe no la conoce; `{ error }` si la clave no vale (no se arregla reintentando). La red y los 5xx
 * lanzan: el webhook responde 500 y Stripe reintenta.
 */
export async function sessionForPaymentIntent(paymentIntent: string, env: Record<string, string | undefined> = process.env): Promise<{ id: string | null } | { error: string }> {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { error: "stripe_off" };
  const url = `https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status >= 500 || res.status === 429) throw new Error(`stripe_${res.status}`);
  if (!res.ok) return { error: `stripe_${res.status}` };
  const json = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
  return { id: json?.data?.[0]?.id ?? null };
}

export interface StripeEvent {
  id: string;
  type: string;
  /** true en modo real, false en modo de prueba (Stripe lo manda siempre). */
  livemode?: boolean;
  data: { object: { id?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: Record<string, string>; client_reference_id?: string; customer_email?: string; customer_details?: { email?: string } } };
}

/**
 * En producción solo cuentan los cobros reales. Allí Gelato imprime de verdad, así que un evento de prueba (tarjeta 4242)
 * con claves de prueba mal puestas no puede acabar en un libro impreso. Fuera de producción vale cualquiera.
 */
export function eventModeAllowed(event: Pick<StripeEvent, "livemode">, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production" || event.livemode === true;
}

/** ¿Es un cobro real de Stripe (`cs_live_…`)? Las sesiones de prueba son `cs_test_…`; el pago simulado, `dry-run:<libro>`. */
export function isLiveSession(sessionId: string | null | undefined): boolean {
  return typeof sessionId === "string" && sessionId.startsWith("cs_live_");
}

/**
 * ¿Cuenta este pedido como pagado en este entorno? La base es la misma en la preview y en producción. En producción solo
 * cuentan los cobros reales: un libro pagado en la preview con la tarjeta 4242 o con el pago simulado no se abre como
 * pagado en www, no se imprime y no hace pasar por «duplicado» un cobro real del mismo libro (auditoría 26 oct, B1).
 * Fuera de producción cuenta cualquiera, para poder probar.
 */
export function paidInEnv(sessionId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production" || isLiveSession(sessionId);
}

/**
 * ¿Toca este entorno este pedido? Producción, solo los cobros reales. Fuera de producción, solo los de prueba: la preview
 * no manda a la imprenta (como borrador) ni recuerda por email los pedidos reales de los clientes, que dejaría marcados
 * en la base compartida (auditoría 26 oct, B1).
 */
export function orderBelongsToEnv(sessionId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" ? isLiveSession(sessionId) : !isLiveSession(sessionId);
}

/**
 * ¿El pedido se cobró de verdad? Producción solo manda a la imprenta pedidos con sesión real (`cs_live_…`): la base es la
 * misma que la de la preview, y un libro pagado allí con la tarjeta 4242 (o con el pago de prueba) se puede abrir en el
 * dominio de producción.
 */
export function printableInEnv(sessionId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return paidInEnv(sessionId, env);
}

/**
 * Verifica la cabecera Stripe-Signature (t=…,v1=…) con HMAC-SHA256 de `${t}.${payload}` y una tolerancia de 5 min.
 * Devuelve el evento o null.
 */
export function verifyWebhook(payload: string, header: string | null, secret: string, now = Date.now()): StripeEvent | null {
  if (!header || !secret) return null;
  const parts = header.split(",").map((kv) => kv.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0 || !/^\d+$/.test(t)) return null;
  if (Math.abs(now / 1000 - Number(t)) > 300) return null;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}
