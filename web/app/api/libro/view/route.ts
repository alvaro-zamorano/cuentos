import { bookView } from "@/lib/book/service";
import { mailEnabled } from "@/lib/mail";
import { paymentMode } from "@/lib/stripe";
import { backgroundPaint, withContext } from "../_shared";

/** GET /api/libro/view?b=<bookId> → ficha, plan, pago y estado de las imágenes (URLs firmadas 1 h), y cómo se paga aquí. */
export async function GET(req: Request) {
  const b = new URL(req.url).searchParams.get("b");
  return withContext("view", async (store) => {
    const v = await bookView(store, b);
    return v.ok ? { ...v, payment: paymentMode(), mail: mailEnabled(), background: backgroundPaint() } : v;
  });
}
