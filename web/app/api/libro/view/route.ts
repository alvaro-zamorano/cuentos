import { bookView } from "@/lib/book/service";
import { mailEnabled } from "@/lib/mail";
import { printMode } from "@/lib/print/gelato";
import { paymentMode } from "@/lib/stripe";
import { titular } from "@/lib/legal";
import { backgroundPaint, withContext } from "../_shared";

/** GET /api/libro/view?b=<bookId> → ficha, plan, pago y estado de las imágenes (URLs firmadas 1 h), y cómo se paga aquí. */
export async function GET(req: Request) {
  const b = new URL(req.url).searchParams.get("b");
  return withContext("view", async (store) => {
    const v = await bookView(store, b);
    if (!v.ok) return v;
    const print = printMode();
    // pasar a tapa dura solo si aquí hay imprenta (real o simulada) y forma de pagar
    const payment = paymentMode();
    return { ...v, upgrade: print !== "none" && payment !== "none" ? v.upgrade : null, payment, printMode: print, mail: mailEnabled(), background: backgroundPaint(), contact: titular().email ?? null };
  });
}
