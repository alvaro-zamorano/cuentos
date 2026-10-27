/**
 * Correo entrante (18 oct): lo que llega a cualquier dirección de `erasesuvez.com` (sobre todo `hola@`) lo recibe Resend,
 * que avisa con un webhook firmado (Svix). Aquí se comprueba la firma, se pide el correo a Resend y se reenvía a
 * MAIL_FORWARD_TO con «Responder a» el remitente. No se guarda nada en nuestra base. Solo servidor.
 *
 * Variables: RESEND_API_KEY (con acceso completo: leer correos recibidos), MAIL_FROM, MAIL_FORWARD_TO (una o varias
 * direcciones separadas por comas) y RESEND_WEBHOOK_SECRET (`whsec_…`, el del webhook de Resend).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const API = "https://api.resend.com";
/** Tolerancia de la marca de tiempo del webhook, como en Stripe. */
const TOLERANCE_S = 300;

export function inboundEnabled(env: Env = process.env): boolean {
  return !!env.RESEND_WEBHOOK_SECRET?.trim() && !!env.RESEND_API_KEY?.trim() && !!env.MAIL_FROM?.trim() && forwardTargets(env).length > 0;
}

export function forwardTargets(env: Env = process.env): string[] {
  return (env.MAIL_FORWARD_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s));
}

/**
 * Firma de Svix: `v1,<base64>` (puede haber varias, separadas por espacios) = HMAC-SHA256 de `${id}.${timestamp}.${cuerpo}`
 * con la clave en base64 que va tras `whsec_`. El cuerpo tiene que ser el texto tal cual llegó.
 */
export function verifySvix(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.trim().replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signature
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .some((s) => {
      const got = Buffer.from(s.slice(3), "base64");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

export interface InboundEvent {
  type: string;
  data?: { email_id?: string; from?: string; to?: string[]; subject?: string };
}

/** Lo que devuelve GET /emails/receiving/{id} (solo los campos que usamos). */
export interface ReceivedEmail {
  id: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  reply_to?: string[];
  created_at?: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string };
  attachments?: { id: string; filename?: string; content_type?: string; content_disposition?: string | null; content_id?: string | null; size?: number }[];
}

export interface ReceivedAttachment {
  id: string;
  filename?: string;
  content_type?: string;
  content_disposition?: string | null;
  content_id?: string | null;
  download_url: string;
}

/** «Ana García <ana@x.com>» → { name, address }. */
export function parseAddress(s: string): { name: string; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() };
  return { name: "", address: s.trim().toLowerCase() };
}

const domainOf = (address: string) => address.split("@")[1]?.toLowerCase() ?? "";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Nombre visible seguro para una cabecera From: sin comillas, ángulos ni saltos de línea. */
const cleanName = (s: string) => s.replace(/["<>\r\n\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

export type ForwardPlan = { skip: string } | { body: Record<string, unknown> };

/**
 * El correo que sale hacia MAIL_FORWARD_TO, o el motivo para no reenviarlo:
 * - `dmarc_fail`: el remitente no supera DMARC (casi siempre suplantación o spam). Se queda en el panel de Resend.
 * - `loop`: viene de nuestra propia dirección, o el destino es de nuestro dominio (reenviaría en bucle).
 */
export function forwardPlan(email: ReceivedEmail, attachments: ReceivedAttachment[], env: Env = process.env): ForwardPlan {
  const targets = forwardTargets(env);
  const fromEnv = parseAddress(env.MAIL_FROM?.trim() ?? "");
  const sender = parseAddress(email.from ?? "");
  if (!targets.length || !fromEnv.address.includes("@")) return { skip: "sin_configurar" };
  if (email.authentication?.dmarc === "fail") return { skip: "dmarc_fail" };
  const ownDomain = domainOf(fromEnv.address);
  if (sender.address === fromEnv.address || targets.some((t) => domainOf(t) === ownDomain)) return { skip: "loop" };

  const who = cleanName(sender.name || sender.address) || "Alguien";
  const brand = cleanName(fromEnv.name) || ownDomain;
  // en una línea y con largo razonable: un asunto con saltos de línea no debe colar cabeceras (menores de la auditoría)
  const subject = (email.subject ?? "").replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 250) || "(sin asunto)";
  const to = (email.to ?? []).join(", ");
  const head = `De: ${email.from}\nPara: ${to}${email.cc?.length ? `\nCC: ${email.cc.join(", ")}` : ""}`;
  const replyTo = email.reply_to?.length ? email.reply_to : [sender.address];

  const text = `${head}\n\n${email.text?.trim() || "(sin texto: mira la versión HTML)"}`;
  const banner = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#555;border-bottom:1px solid #ddd;padding:0 0 10px;margin:0 0 16px;white-space:pre-line">${esc(head)}</div>`;
  const html = email.html?.trim() ? `${banner}${email.html}` : `${banner}<pre style="font-family:inherit;white-space:pre-wrap">${esc(email.text ?? "")}</pre>`;

  const files = attachments
    .filter((a) => a.download_url)
    .map((a) => ({
      filename: a.filename || "adjunto",
      path: a.download_url,
      ...(a.content_type ? { content_type: a.content_type } : {}),
      ...(a.content_id ? { content_id: a.content_id.replace(/^<|>$/g, "") } : {}),
    }));

  return {
    body: {
      from: `"${who} (vía ${brand})" <${fromEnv.address}>`,
      to: targets,
      reply_to: replyTo,
      subject,
      text,
      html,
      ...(files.length ? { attachments: files } : {}),
    },
  };
}

export type InboundResult = { action: "forwarded" | "ignored" | "skipped"; reason?: string } | { action: "error"; reason: string };

/**
 * Del aviso de Resend al correo reenviado. Idempotente: el envío lleva `Idempotency-Key` con el id del correo, así que
 * si Resend repite el webhook no llega dos veces. Si los adjuntos hacen fallar el envío (tipo no permitido, tamaño),
 * se reenvía sin ellos y con una nota.
 */
export async function handleInbound(event: InboundEvent, env: Env = process.env, f: Fetch = fetch): Promise<InboundResult> {
  if (event.type !== "email.received") return { action: "ignored", reason: event.type };
  const id = event.data?.email_id;
  if (!id || !/^[0-9a-zA-Z-]{8,64}$/.test(id)) return { action: "ignored", reason: "sin_id" };
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return { action: "error", reason: "sin_clave" };
  const auth = { authorization: `Bearer ${key}` };

  const got = await f(`${API}/emails/receiving/${id}?html_format=cid`, { headers: auth, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!got?.ok) return { action: "error", reason: `leer_${got?.status ?? "red"}` };
  const email = (await got.json()) as ReceivedEmail;

  let attachments: ReceivedAttachment[] = [];
  if (email.attachments?.length) {
    const list = await f(`${API}/emails/receiving/${id}/attachments`, { headers: auth, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (list?.ok) attachments = (((await list.json()) as { data?: ReceivedAttachment[] }).data ?? []).filter((a) => a?.download_url);
  }

  const plan = forwardPlan(email, attachments, env);
  if ("skip" in plan) return { action: "skipped", reason: plan.skip };

  const send = (body: Record<string, unknown>, suffix: string) =>
    f(`${API}/emails`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "idempotency-key": `inbound-${id}${suffix}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);

  const sent = await send(plan.body, "");
  if (sent?.ok) return { action: "forwarded" };
  // misma clave con otro cuerpo (los enlaces de los adjuntos cambian en cada lectura) o a la vez: ya se reenvió o se está reenviando
  if (sent?.status === 409) return { action: "forwarded", reason: "duplicado" };
  if (sent && (sent.status === 400 || sent.status === 422) && plan.body.attachments) {
    const n = (plan.body.attachments as unknown[]).length;
    const note = `\n\n[${n} adjunto(s) no se han podido reenviar: míralos en Resend → Emails → Receiving]`;
    const bare = { ...plan.body, attachments: undefined, text: `${plan.body.text}${note}`, html: `${plan.body.html}<p style="color:#a33">${esc(note.trim())}</p>` };
    const retry = await send(bare, "-sin-adjuntos");
    if (retry?.ok || retry?.status === 409) return { action: "forwarded", reason: "sin_adjuntos" };
    return { action: "error", reason: `enviar_${retry?.status ?? "red"}` };
  }
  return { action: "error", reason: `enviar_${sent?.status ?? "red"}` };
}
