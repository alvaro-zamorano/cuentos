/**
 * Emails transaccionales con Resend (B5). Sin RESEND_API_KEY o sin MAIL_FROM no se envía nada y se devuelve
 * `{ sent: false }`: la app funciona igual (el enlace para volver se enseña en pantalla). Solo servidor.
 */
import { dayMonth, eur } from "./print/prices";

export interface MailResult {
  sent: boolean;
  reason?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY?.trim() && !!env.MAIL_FROM?.trim();
}

async function send(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  if (!mailEnabled()) return { sent: false, reason: "sin_configurar" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}` },
      body: JSON.stringify({ from: process.env.MAIL_FROM!.trim(), to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `resend_${res.status}` };
  } catch {
    return { sent: false, reason: "red" };
  }
}

function layout(title: string, body: string, link: string, cta: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#fbf5ea;font-family:Georgia,serif;color:#232036">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px"><span style="color:#f2b84b">&#10022;</span> Érase su vez</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">${esc(title)}</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d566c">${body}</p>
<p style="margin:28px 0"><a href="${esc(link)}" style="background:#c8492c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-family:Helvetica,Arial,sans-serif;font-size:15px">${esc(cta)}</a></p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6f6457">Guardamos el libro 30 días. Si no lo has pedido tú, ignora este mensaje.</p>
</div></body></html>`;
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
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#fbf5ea;font-family:Georgia,serif;color:#232036">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px"><span style="color:#f2b84b">&#10022;</span> Érase su vez</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">Tus cuentos te esperan</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5d566c">Ya tienes ${books.length} cuentos con sus personajes dibujados. Elige el que más te guste y termínalo: en cuanto tengas uno, puedes empezar otro.</p>
<ul style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;padding-left:18px;margin:20px 0">${list}</ul>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6f6457">Guardamos cada libro 30 días. Si no lo has pedido tú, ignora este mensaje.</p>
</div></body></html>`;
  const text = `Tus cuentos te esperan\n\nYa tienes ${books.length} cuentos con sus personajes dibujados. Elige el que más te guste y termínalo:\n\n${books.map((b) => `${b.title}: ${b.link}`).join("\n")}\n\nGuardamos cada libro 30 días.`;
  return send(to, "Tus cuentos te esperan", html, text);
}

/** Cuando las 12 ilustraciones están pintadas tras el pago. Con la tapa dura, el libro espera a que el padre lo mande a imprimir. */
export function sendBookReady(
  to: string,
  bookTitle: string,
  link: string,
  edition: "hardcover" | "illustrated" = "illustrated",
  upgrade?: { cents: number; until: string } | null,
): Promise<MailResult> {
  const body =
    edition === "hardcover"
      ? "Las doce ilustraciones están terminadas. Revisa cada página y cambia lo que quieras. Cuando esté como lo quieres, pulsa «Mandar a imprimir»: no lo imprimimos hasta que nos lo digas."
      : "Las doce ilustraciones están terminadas. Revisa cada página, cambia lo que quieras y descarga el PDF para imprimirlo en casa.";
  // pagado en PDF y con imprenta: la oferta de pasar a tapa dura (lo decide la ruta)
  const extra = edition === "illustrated" && upgrade ? upgradeLine(upgrade) : "";
  const full = extra ? `${body} ${extra}` : body;
  return send(to, `Tu libro está listo: «${bookTitle}»`, layout(bookTitle, esc(full), link, edition === "hardcover" ? "Revisar y mandar a imprimir" : "Ver mi libro"), `${bookTitle}\n\n${full}\n\nTu libro: ${link}`);
}

/** «¿Lo quieres en tapa dura? …»: la mejora desde el PDF, con su precio y su fecha límite. */
export function upgradeLine({ cents, until }: { cents: number; until: string }): string {
  return `¿Lo quieres también en tapa dura? Desde tu libro pagas solo la diferencia, ${eur(cents)}, con el envío a casa incluido. Puedes pedirlo hasta el ${dayMonth(until)}.`;
}

/** Tapa dura pagada, ilustraciones hechas y sin mandar a imprimir (el cron diario, a los 2 y a los 7 días). */
export function sendPrintReminder(to: string, bookTitle: string, link: string): Promise<MailResult> {
  const body = "Tu libro está terminado, pero todavía no nos has dicho que lo imprimamos. Revísalo y pulsa «Mandar a imprimir» cuando esté listo. Hasta entonces no sale hacia la imprenta.";
  return send(to, `Falta un paso para imprimir «${bookTitle}»`, layout(bookTitle, body, link, "Revisar y mandar a imprimir"), `${bookTitle}\n\n${body}\n\n${link}`);
}

/** El pedido ya está en la imprenta. `link`: nuestra página de seguimiento. */
export function sendSentToPrint(to: string, bookTitle: string, link: string, address: string): Promise<MailResult> {
  const body = `Tu libro ya está en la imprenta. Lo imprimimos, lo encuadernamos en tapa dura y lo enviamos a ${esc(address)}. Suele llegar en una o dos semanas. En el enlace de abajo ves cómo va y te escribimos cuando salga.`;
  return send(to, `«${bookTitle}» ya está en la imprenta`, layout(bookTitle, body, link, "Ver cómo va mi pedido"), `${bookTitle}\n\nTu libro ya está en la imprenta. Lo enviamos a ${address}. Suele llegar en una o dos semanas.\n\nCómo va tu pedido: ${link}`);
}

/** El libro ha salido de la imprenta. `link`: nuestra página de seguimiento, con el número y el enlace del transportista. */
export function sendShipped(to: string, bookTitle: string, link: string): Promise<MailResult> {
  const body = "Tu libro ha salido de la imprenta y va de camino. En el enlace de abajo ves cuándo llega y el seguimiento del transportista.";
  return send(to, `«${bookTitle}» va de camino`, layout(bookTitle, body, link, "Seguir mi pedido"), `${bookTitle}\n\nTu libro va de camino. Seguimiento: ${link}`);
}

/**
 * Aviso interno (no va al cliente): «Sigue sin estar bien» en una página. Va a MAIL_FORWARD_TO, el buzón de Álvaro;
 * no a hola@, porque el reenvío del correo entrante descarta lo que sale de nuestra propia dirección.
 */
export async function sendSupportNotice(subject: string, text: string, env: Record<string, string | undefined> = process.env): Promise<MailResult> {
  const to = (env.MAIL_FORWARD_TO ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  if (!to.length) return { sent: false, reason: "sin_destino" };
  const html = `<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;white-space:pre-wrap">${esc(text)}</pre>`;
  const results = await Promise.all(to.map((t) => send(t, subject, html, text)));
  return results.every((r) => r.sent) ? { sent: true } : (results.find((r) => !r.sent) ?? { sent: false });
}
