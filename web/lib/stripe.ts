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

export interface CheckoutInput {
  bookId: string;
  email: string | null;
  title: string;
  amountCents: number;
  origin: string;
}

/** Cuerpo form-encoded de /v1/checkout/sessions (exportado para los tests). */
export function checkoutBody({ bookId, email, title, amountCents, origin }: CheckoutInput): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", `${origin}/crear?b=${bookId}&pagado=1`);
  p.set("cancel_url", `${origin}/crear?b=${bookId}`);
  p.set("client_reference_id", bookId);
  p.set("metadata[bookId]", bookId);
  p.set("payment_intent_data[metadata][bookId]", bookId);
  if (email) p.set("customer_email", email);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "eur");
  p.set("line_items[0][price_data][unit_amount]", String(amountCents));
  p.set("line_items[0][price_data][product_data][name]", `Libro ilustrado · ${title}`.slice(0, 120));
  p.set("line_items[0][price_data][product_data][description]", "12 ilustraciones, revisión página a página y PDF para imprimir en A4.");
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

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id?: string; payment_status?: string; amount_total?: number; metadata?: Record<string, string>; client_reference_id?: string; customer_email?: string; customer_details?: { email?: string } } };
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
