"use client";

import { useState } from "react";
import Link from "next/link";
import type { BookView } from "@/lib/book/service";
import { errorMessage, postJson } from "@/lib/bookClient";
import { track } from "@/lib/analytics";
import { dayMonth, eur } from "@/lib/print/prices";
import { Icon, Sparkle } from "@/components/brand";
import { ShippingForm, type ShippingDraft } from "./ShippingForm";
import { ErrorNote } from "./ui";

/**
 * Libro pagado en PDF: pasar a tapa dura pagando solo la diferencia (24 oct, Álvaro). Pide la dirección y la misma
 * renuncia al desistimiento que el pago del paso 5. Tras pagar aparece el panel de «Mandar a imprimir», como en la tapa
 * dura comprada desde el principio.
 */
export function UpgradeCard({ view, onUpgraded }: { view: BookView; onUpgraded: () => void }) {
  const offer = view.upgrade!;
  const payment = view.payment ?? "none";
  const [open, setOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingDraft>({});
  const [waiver, setWaiver] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const price = eur(offer.cents);

  const pay = async () => {
    setBusy(true);
    setErr(null);
    setField(null);
    const body = { bookId: view.bookId, upgrade: true, waiver, shipping };
    if (payment === "stripe") {
      const r = await postJson<{ url?: string; field?: string }>("/api/libro/checkout", body);
      if (r.status === 200 && r.json.url) {
        track({ name: "pago_iniciado", props: { edicion: "mejora" } }, { beacon: true });
        window.location.assign(r.json.url);
        return;
      }
      setBusy(false);
      setField(r.json.field ?? null);
      setErr(errorMessage(r.json));
      return;
    }
    const r = await postJson<{ field?: string }>("/api/libro/pay", body);
    setBusy(false);
    if (r.status === 200) onUpgraded();
    else {
      setField(r.json.field ?? null);
      setErr(errorMessage(r.json));
    }
  };

  return (
    <section className="grid gap-4 rounded-[28px] bg-card p-6 shadow-[0_2px_0_#e6d8c1,0_24px_40px_-32px_rgba(35,32,54,0.5)] sm:p-8" data-testid="upgrade-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peach text-ink">
          <Icon.book size={22} />
        </span>
        <div className="grid gap-1">
          <h3 className="display text-[24px]">¿Lo quieres en tapa dura?</h3>
          <p className="text-ink-soft">
            Pagas solo la diferencia, <strong className="text-ink">{price}</strong>. Te lo enviamos a casa (Península y Baleares) y no lo imprimimos hasta que nos lo digas; desde entonces,
            suele llegar en una o dos semanas. Puedes pedirlo hasta el {dayMonth(offer.until)}.
          </p>
        </div>
      </div>

      {!open ? (
        <button className="btn-primary justify-self-start" onClick={() => setOpen(true)} data-testid="upgrade-open">
          <Sparkle size={14} color="currentColor" />
          Quiero la tapa dura
        </button>
      ) : (
        <div className="grid gap-4">
          <ShippingForm value={shipping} onChange={setShipping} field={field} />
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-paper p-4 text-[14px] leading-snug text-ink">
            <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" data-testid="upgrade-waiver" />
            <span>
              Quiero el libro impreso. Sé que, al ser un libro personalizado, no podré desistir de la compra (
              <Link href="/condiciones" target="_blank" className="underline underline-offset-2">
                condiciones
              </Link>
              ).
            </span>
          </label>
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary btn-lg" disabled={busy || !waiver} onClick={() => void pay()} data-testid="upgrade-pay">
              {busy ? (payment === "stripe" ? "Abriendo el pago…" : "Procesando…") : payment === "stripe" ? `Pagar ${price}` : `Pagar ${price} (pago de prueba)`}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
              Ahora no
            </button>
          </div>
          {payment === "stripe" && (
            <p className="flex items-start gap-2 text-[13px] text-mute">
              <Icon.lock size={14} className="mt-0.5 shrink-0" />
              Pago seguro con Stripe. Al terminar vuelves aquí para revisarlo y mandarlo a imprimir.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
