import { approveSheet } from "@/lib/book/service";
import { bad, readJson, withContext } from "../_shared";

/** POST /api/libro/approve { bookId, sheetJobId } → la hoja elegida es la referencia de las páginas. */
export async function POST(req: Request) {
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  return withContext("approve", (store) => approveSheet(store, body));
}
