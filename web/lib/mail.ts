/**
 * Emails transaccionales con Resend (B5). Sin RESEND_API_KEY o sin MAIL_FROM no se envía nada y se devuelve
 * `{ sent: false }`: la app funciona igual (el enlace para volver se enseña en pantalla). Solo servidor.
 */
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
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f3ec;font-family:Georgia,serif;color:#1f1a17">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-style:italic;font-size:22px;margin:0 0 24px">cuentos</p>
<h1 style="font-size:26px;font-weight:500;margin:0 0 16px">${esc(title)}</h1>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5c534b">${body}</p>
<p style="margin:28px 0"><a href="${esc(link)}" style="background:#1f4d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-family:Helvetica,Arial,sans-serif;font-size:15px">${esc(cta)}</a></p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a7d6e">Guardamos el libro 30 días. Si no lo has pedido tú, ignora este mensaje.</p>
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

/** Cuando las 12 ilustraciones están pintadas tras el pago. */
export function sendBookReady(to: string, bookTitle: string, link: string): Promise<MailResult> {
  return send(
    to,
    `Tu libro está listo: «${bookTitle}»`,
    layout(bookTitle, "Las doce ilustraciones están terminadas. Revisa cada página, cambia lo que quieras y descarga el PDF para imprimirlo en casa.", link, "Ver mi libro"),
    `${bookTitle}\n\nLas doce ilustraciones están terminadas. Tu libro: ${link}`,
  );
}
