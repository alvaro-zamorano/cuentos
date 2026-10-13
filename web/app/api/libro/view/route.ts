import { bookView } from "@/lib/book/service";
import { withContext } from "../_shared";

/** GET /api/libro/view?b=<bookId> → ficha, plan, pago y estado de las imágenes (URLs firmadas 1 h). */
export async function GET(req: Request) {
  const b = new URL(req.url).searchParams.get("b");
  return withContext("view", (store) => bookView(store, b));
}
