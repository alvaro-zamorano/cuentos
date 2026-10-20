import { choosePage } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/** POST /api/libro/page { bookId, jobId } → esa versión de la página es la que va al libro. */
export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  return withContext("page", (store) => choosePage(store, body));
}
