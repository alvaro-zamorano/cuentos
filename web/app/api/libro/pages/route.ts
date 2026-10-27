import { publicOrigin } from "@/lib/book/background";
import { alertPaidFailures, notifyBookReady, pendingPageJobs, requestPages } from "@/lib/book/service";
import { sendSupportNotice } from "@/lib/mail";
import { readyMail } from "@/lib/book/readyMail";
import { bad, paintLater, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/pages { bookId, page? } → encola las páginas que falten (o otra versión de `page`) y las pinta en
 * segundo plano. Requiere un pedido pagado (Stripe o el pago de prueba). La primera vez prepara la dirección de arte de
 * las 12 páginas (una llamada al LLM). Al terminar las 12, el email de «tu libro está listo» (una vez).
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  const origin = publicOrigin(req);
  return withContext("pages", async (store, adapter) => {
    const r = await requestPages(store, body, adapter, { dryRunPayment: false });
    if (r.ok) {
      paintLater("pages", store, adapter, () => pendingPageJobs(store, r.bookId), {
        t0,
        maxDurationS: maxDuration,
        then: async () => {
          const link = (id: string) => `${origin}/crear?b=${id}`;
          await notifyBookReady(store, r.bookId, link, readyMail);
          await alertPaidFailures(store, r.bookId, sendSupportNotice, link);
        },
      });
    }
    return r;
  });
}
