import { updateShipping } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/** POST /api/libro/shipping { bookId, shipping } → cambia la dirección de la tapa dura pagada mientras no haya ido a la imprenta. */
export async function POST(req: Request) {
  const body = await readJson(req, 4_000);
  if (!body) return bad();
  return withContext("shipping", (store) => updateShipping(store, body));
}
