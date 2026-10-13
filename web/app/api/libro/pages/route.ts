import { requestPages } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/pages { bookId, page? } → encola las páginas que falten (o otra versión de `page`).
 * Requiere un pedido pagado (el pago de prueba de /api/libro/pay también lo crea).
 * La primera vez prepara la dirección de arte de las 12 páginas (una llamada al LLM).
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  return withContext("pages", (store, adapter) => requestPages(store, body, adapter, { dryRunPayment: false }));
}
