import { reviseSheet } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/** POST /api/libro/sheet { bookId, instruction } → nueva versión de la hoja y su portada (máximo 2 cambios). */
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readJson(req, 4_000);
  if (!body) return bad();
  return withContext("sheet", (store, adapter) => reviseSheet(store, body, adapter));
}
