import { shippingOf } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/address { bookId } → la dirección entera de la tapa dura, para «Cambiar» y para confirmar antes de
 * imprimir (revisión 27 oct). La vista solo trae el resumen (I16).
 */
export async function POST(req: Request) {
  const body = await readJson(req, 1_000);
  if (!body) return bad();
  return withContext("address", (store) => shippingOf(store, body));
}
