import { publicOrigin } from "@/lib/book/background";
import { reportPage } from "@/lib/book/service";
import { sendSupportNotice } from "@/lib/mail";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/report { bookId, page, note? } → «Sigue sin estar bien»: queda apuntado con la página y nos llega
 * un email para arreglarla a mano. Una vez por página.
 */
export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  // como mucho uno por segundo; REPORT_MIN_GAP_MS=0 lo quita en las pruebas, que avisan de dos páginas seguidas
  const limit = rateLimit(`report:${clientIp(req)}`, 10, envInt("REPORT_MIN_GAP_MS", 1000, 0));
  if (!limit.ok) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const origin = publicOrigin(req);
  return withContext("report", (store) => reportPage(store, body, (subject, text) => sendSupportNotice(subject, text), (id) => `${origin}/crear?b=${id}`));
}
