import { reviseSheet } from "@/lib/book/service";
import { bad, paintLater, readJson, withContext } from "../_shared";

/** POST /api/libro/sheet { bookId, instruction } → nueva versión de la hoja y su portada (máximo 2 cambios), pintadas en segundo plano. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await readJson(req, 4_000);
  if (!body) return bad();
  return withContext("sheet", async (store, adapter) => {
    const r = await reviseSheet(store, body, adapter);
    if (r.ok) paintLater("sheet", store, adapter, [r.sheetJobId, r.coverJobId], { t0, maxDurationS: maxDuration, concurrency: 1 });
    return r;
  });
}
