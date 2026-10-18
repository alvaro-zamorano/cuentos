import { after } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { completePrint, startPrint } from "@/lib/book/print";
import { printMode } from "@/lib/print/gelato";
import { printDeps } from "@/lib/print/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/print { bookId } → «Mandar a imprimir» (B8). Pasa el pedido a `sending` y responde; después, con
 * `after()`, maqueta el PDF de imprenta, lo sube y crea el pedido en Gelato. El paso 5 consulta /api/libro/view hasta ver
 * `sent` (o `failed`, y entonces se puede reintentar).
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  const limit = rateLimit(`print:${clientIp(req)}`, 10);
  if (!limit.ok) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const origin = publicOrigin(req);
  return withContext("print", async (store) => {
    const r = await startPrint(store, body.bookId, printMode());
    if (!r.ok) return r;
    after(async () => {
      try {
        await completePrint(store, r.orderId, printDeps(origin));
      } catch (e) {
        console.error("[libro/print] segundo plano", e instanceof Error ? e.message.slice(0, 200) : "error");
      }
    });
    return { ok: true as const, status: "sending" as const };
  });
}
