/**
 * Emails transaccionales con Resend (B5). Sin RESEND_API_KEY o sin MAIL_FROM no se envía nada y se devuelve
 * `{ sent: false }`: la app funciona igual (el enlace para volver se enseña en pantalla). Solo servidor.
 */
import { createHash } from "node:crypto";
import { dayMonth, eur } from "./print/prices";

export interface MailResult {
  sent: boolean;
  reason?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY?.trim() && !!env.MAIL_FROM?.trim();
}

/**
 * La clave de idempotencia de Resend: el mismo aviso de un mismo hecho (un pedido que sale, un libro que termina, un
 * evento de Stripe) dos veces en 24 horas sale una vez. Auditoría 26 oct, menores: dos segundos planos que acababan a la
 * vez mandaban «listo» dos veces, y los dos avisos de Gelato al salir el paquete, dos «va de camino».
 * La pone quien manda, a partir del hecho (revisión 27 oct): con el contenido como clave, un email que el padre vuelve a
 * pedir (sus cuentos) o dos recibos iguales de compras distintas no salían. Sin clave, Resend manda siempre.
 * Va con el destinatario: un aviso a dos buzones son dos envíos.
 */
export function mailKey(key: string, to: string): string {
  return createHash("sha256").update(`${key}\n${to.trim().toLowerCase()}`).digest("hex");
}

async function send(to: string, subject: string, html: string, text: string, key?: string): Promise<MailResult> {
  if (!mailEnabled()) return { sent: false, reason: "sin_configurar" };
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}` };
  if (key) headers["idempotency-key"] = mailKey(key, to);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: process.env.MAIL_FROM!.trim(), to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { sent: true };
    if (res.status === 409) {
      // el mismo email, ya mandado o mandándose: el que lo manda lo apunta; este no (si fallara, el siguiente reintento sale)
      const name = ((await res.json().catch(() => null)) as { name?: string } | null)?.name ?? "";
      return name === "concurrent_idempotent_requests" ? { sent: false, reason: "en_curso" } : { sent: true };
    }
    return { sent: false, reason: `resend_${res.status}` };
  } catch {
    return { sent: false, reason: "red" };
  }
}

/** Un fallo de envío que se arregla reintentando: red, Resend caído o saturado (no una dirección que rechaza). */
export function transientMailFailure(r: MailResult): boolean {
  return !r.sent && /^(red|error|resend_429|resend_5\d\d)$/.test(r.reason ?? "error");
}

/**
 * Ya no hay que volver a intentarlo: salió, o falló por algo que reintentar no arregla (una dirección rechazada, el correo
 * sin configurar). Con «en_curso» lo está mandando otro con la misma clave: lo decide ese.
 */
export function mailSettled(r: MailResult): boolean {
  return r.sent || (!transientMailFailure(r) && r.reason !== "en_curso");
}

function layout(title: string, body: string, link: string, cta: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#fbf5ea;font-family:Georgia,serif;color:#232036">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px"><span style="color:#f2b84b">&#10022;</span> Érase su vez</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">${esc(title)}</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d566c">${body}</p>
<p style="margin:28px 0"><a href="${esc(link)}" style="background:#c8492c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-family:Helvetica,Arial,sans-serif;font-size:15px">${esc(cta)}</a></p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6f6457">Guardamos el libro 30 días. Si este correo no era para ti, puedes borrarlo sin más.</p>
</div></body></html>`;
}

/** Lo que lleva el recibo de compra (I28). */
export interface Receipt {
  title: string;
  /** PDF, tapa dura o el paso de PDF a tapa dura. */
  kind: "illustrated" | "hardcover" | "upgrade";
  amountCents: number;
  paidAt: string;
  /** Dirección de envío en una línea (tapa dura). */
  address: string | null;
  /** Cuándo aceptó empezar ya y la renuncia al desistimiento (metadatos de la sesión de Stripe). */
  waiverAt: string | null;
  link: string;
  conditionsLink: string;
  /** Quién vende (holderLine) y el email de contacto. */
  seller: string;
  contact: string | null;
}

const RECEIPT_ITEM: Record<Receipt["kind"], string> = {
  illustrated: "Libro ilustrado: las 12 ilustraciones y el PDF para imprimir en A4 apaisado",
  hardcover: "Libro de tapa dura con envío a casa, y el PDF",
  upgrade: "Paso a tapa dura (la diferencia, con el envío a casa; el PDF ya lo tenías)",
};

const when = (iso: string, withTime: boolean) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Europe/Madrid" });

/** Las líneas del recibo, en orden (texto plano; el HTML las escapa). Exportado para los tests. */
export function receiptLines(r: Receipt): { facts: [string, string][]; notes: string[] } {
  const facts: [string, string][] = [
    ["Libro", `«${r.title}»`],
    ["Pedido", RECEIPT_ITEM[r.kind]],
    ["Total pagado", `${eur(r.amountCents)}, IVA incluido`],
    ["Fecha", when(r.paidAt, false)],
  ];
  if (r.address) facts.push(["Envío a", r.address]);
  const notes: string[] = [];
  if (r.kind !== "illustrated")
    notes.push("La tapa dura no se imprime hasta que la mandes a imprimir desde tu libro. Desde entonces suele llegar en una o dos semanas, y te avisamos por email cuando salga.");
  if (r.waiverAt)
    notes.push(
      `Antes de pagar nos pediste que empezáramos a pintar el libro en cuanto pagaras, y aceptaste que, al ser un libro personalizado, no puedes desistir de la compra. Lo aceptaste el ${when(r.waiverAt, true)} (hora de Madrid).`,
    );
  notes.push(`Condiciones de compra: ${r.conditionsLink}`);
  notes.push(`Vende: ${r.seller}.${r.contact ? ` Para cualquier cosa, escríbenos a ${r.contact}.` : ""}`);
  return { facts, notes };
}

/** Recibo de compra (I28): lo manda el webhook de Stripe cuando registra el pago, una vez por sesión. `key`: la sesión. */
export function sendOrderConfirmed(to: string, r: Receipt, key?: string): Promise<MailResult> {
  const { facts, notes } = receiptLines(r);
  const rows = facts
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6f6457;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#232036">${esc(v)}</td></tr>`)
    .join("");
  // los enlaces de las notas (las condiciones), clicables
  const linkify = (t: string) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#c8492c">${u}</a>`);
  const paras = notes.map((n) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#5d566c;margin:0 0 12px">${linkify(n)}</p>`).join("");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#fbf5ea;font-family:Georgia,serif;color:#232036">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px"><span style="color:#f2b84b">&#10022;</span> Érase su vez</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">Pedido confirmado</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d566c">Hemos recibido tu pago. Gracias. Este es tu recibo: guárdalo.</p>
<table style="font-family:Helvetica,Arial,sans-serif;font-size:14px;border-collapse:collapse;margin:16px 0 20px">${rows}</table>
<p style="margin:0 0 28px"><a href="${esc(r.link)}" style="background:#c8492c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-family:Helvetica,Arial,sans-serif;font-size:15px">Ver mi libro</a></p>
${paras}
</div></body></html>`;
  const text = ["Pedido confirmado", "Hemos recibido tu pago. Gracias. Este es tu recibo: guárdalo.", facts.map(([k, v]) => `${k}: ${v}`).join("\n"), `Tu libro: ${r.link}`, ...notes].join("\n\n");
  return send(to, `Pedido confirmado: «${r.title}»`, html, text, key);
}

/** Tras el email del paso 4: el enlace para volver al libro. */
export function sendBookLink(to: string, bookTitle: string, link: string): Promise<MailResult> {
  return send(
    to,
    `Tu cuento: «${bookTitle}»`,
    layout(bookTitle, "Ya tenemos tu cuento escrito y estamos dibujando a los personajes y la portada. Con este enlace vuelves a él cuando quieras, desde cualquier dispositivo.", link, "Abrir mi cuento"),
    `${bookTitle}\n\nCon este enlace vuelves a tu cuento cuando quieras: ${link}\n\nLo guardamos 30 días.`,
  );
}

/**
 * El buzón ya tiene sus cuentos con dibujos gratis del periodo (26 oct): en vez de dibujar otro, le mandamos los que
 * tiene empezados para que elija cuál terminar. Nunca se enseñan en pantalla (el email no está verificado).
 */
export function sendYourBooks(to: string, books: { title: string; link: string }[]): Promise<MailResult> {
  const list = books.map((b) => `<li style="margin:0 0 10px"><a href="${esc(b.link)}" style="color:#c8492c;font-weight:bold">${esc(b.title)}</a></li>`).join("");
  // cada libro va al email guardado en él (auditoría 26 oct, menores): a una dirección le puede tocar uno solo
  const one = books.length === 1;
  const intro = one ? "Ya tienes un cuento con sus personajes dibujados. Termínalo" : `Ya tienes ${books.length} cuentos con sus personajes dibujados. Elige el que más te guste y termínalo`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#fbf5ea;font-family:Georgia,serif;color:#232036">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px"><span style="color:#f2b84b">&#10022;</span> Érase su vez</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">Tus cuentos te esperan</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d566c">${intro}. Cuando compres uno, puedes empezar otros tres.</p>
<ul style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;padding-left:18px;margin:20px 0">${list}</ul>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6f6457">Guardamos cada libro 30 días. Si este correo no era para ti, puedes borrarlo sin más.</p>
</div></body></html>`;
  const text = `Tus cuentos te esperan\n\n${intro}:\n\n${books.map((b) => `${b.title}: ${b.link}`).join("\n")}\n\nCuando compres uno, puedes empezar otros tres. Guardamos cada libro 30 días.`;
  return send(to, "Tus cuentos te esperan", html, text);
}

/**
 * Cuando las 12 ilustraciones están pintadas tras el pago. Con la tapa dura, el libro espera a que el padre lo mande a
 * imprimir. `key`: el libro (sale una vez por libro).
 */
export function sendBookReady(
  to: string,
  bookTitle: string,
  link: string,
  edition: "hardcover" | "illustrated" = "illustrated",
  upgrade?: { cents: number; until: string } | null,
  key?: string,
): Promise<MailResult> {
  const body =
    edition === "hardcover"
      ? "Las doce ilustraciones están terminadas. Revisa cada página y cambia lo que quieras. Cuando esté como lo quieres, pulsa «Mandar a imprimir»: no lo imprimimos hasta que nos lo digas."
      : "Las doce ilustraciones están terminadas. Revisa cada página, cambia lo que quieras y descarga el PDF para imprimirlo en casa.";
  // pagado en PDF y con imprenta: la oferta de pasar a tapa dura (lo decide la ruta)
  const extra = edition === "illustrated" && upgrade ? upgradeLine(upgrade) : "";
  const full = extra ? `${body} ${extra}` : body;
  return send(
    to,
    `Tu libro está listo: «${bookTitle}»`,
    layout(bookTitle, esc(full), link, edition === "hardcover" ? "Revisar y mandar a imprimir" : "Ver mi libro"),
    `${bookTitle}\n\n${full}\n\nTu libro: ${link}`,
    key,
  );
}

/** «¿Lo quieres en tapa dura? …»: la mejora desde el PDF, con su precio y su fecha límite. */
export function upgradeLine({ cents, until }: { cents: number; until: string }): string {
  return `¿Lo quieres también en tapa dura? Desde tu libro pagas solo la diferencia, ${eur(cents)}, con el envío a casa incluido. Puedes pedirlo hasta el ${dayMonth(until)}.`;
}

/** Tapa dura pagada, ilustraciones hechas y sin mandar a imprimir (el cron diario, a los 2 y a los 7 días). */
export function sendPrintReminder(to: string, bookTitle: string, link: string, key?: string): Promise<MailResult> {
  const body = "Tu libro está terminado, pero todavía no nos has dicho que lo imprimamos. Revísalo y pulsa «Mandar a imprimir» cuando esté listo. Hasta entonces no sale hacia la imprenta.";
  return send(to, `Falta un paso para imprimir «${bookTitle}»`, layout(bookTitle, body, link, "Revisar y mandar a imprimir"), `${bookTitle}\n\n${body}\n\n${link}`, key);
}

/** El pedido ya está en la imprenta. `link`: nuestra página de seguimiento. `key`: el pedido en la imprenta. */
export function sendSentToPrint(to: string, bookTitle: string, link: string, address: string, key?: string): Promise<MailResult> {
  const body = `Tu libro ya está en la imprenta. Lo imprimimos, lo encuadernamos en tapa dura y lo enviamos a ${esc(address)}. Suele llegar en una o dos semanas. En el enlace de abajo ves cómo va y te escribimos cuando salga.`;
  return send(to, `«${bookTitle}» ya está en la imprenta`, layout(bookTitle, body, link, "Ver cómo va mi pedido"), `${bookTitle}\n\nTu libro ya está en la imprenta. Lo enviamos a ${address}. Suele llegar en una o dos semanas.\n\nCómo va tu pedido: ${link}`, key);
}

/**
 * El libro ha salido de la imprenta. `link`: nuestra página de seguimiento, con el número y el enlace del transportista.
 * `key`: el pedido en la imprenta.
 */
export function sendShipped(to: string, bookTitle: string, link: string, key?: string): Promise<MailResult> {
  const body = "Tu libro ha salido de la imprenta y va de camino. En el enlace de abajo ves cuándo llega y el seguimiento del transportista.";
  return send(to, `«${bookTitle}» va de camino`, layout(bookTitle, body, link, "Seguir mi pedido"), `${bookTitle}\n\nTu libro va de camino. Seguimiento: ${link}`, key);
}

/**
 * Aviso interno (no va al cliente): «Sigue sin estar bien» en una página. Va a MAIL_FORWARD_TO, el buzón de Álvaro;
 * no a hola@, porque el reenvío del correo entrante descarta lo que sale de nuestra propia dirección.
 * `key`: el hecho que avisa, cuando se puede repetir (un evento de Stripe que vuelve), para que no salga dos veces.
 */
export async function sendSupportNotice(
  subject: string,
  text: string,
  { key, env = process.env }: { key?: string; env?: Record<string, string | undefined> } = {},
): Promise<MailResult> {
  const to = (env.MAIL_FORWARD_TO ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  if (!to.length) return { sent: false, reason: "sin_destino" };
  const html = `<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`;
  const results = await Promise.all(to.map((t) => send(t, subject, html, text, key)));
  return results.every((r) => r.sent) ? { sent: true } : (results.find((r) => !r.sent) ?? { sent: false });
}
