import { savePlan } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/** POST /api/libro/plan { bookId, plan } → guarda los textos editados (y páginas reescritas) del libro. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return bad();
  return withContext("plan", (store) => savePlan(store, body));
}
