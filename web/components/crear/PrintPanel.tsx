"use client";

import { useState } from "react";
import type { BookView } from "@/lib/book/service";
import { errorMessage, postJson } from "@/lib/bookClient";
import { shippingLine } from "@/lib/print/shipping";
import type { Shipping, ShippingSummary } from "@/lib/print/types";
import { Icon, Sparkle } from "@/components/brand";
import { ShippingForm, type ShippingDraft } from "./ShippingForm";
import { ErrorNote, Status } from "./ui";

/**
 * Tras pagar la tapa dura (B8): la dirección, «Mandar a imprimir» (solo cuando el padre lo dice; decisión de Álvaro del
 * 18 oct) y después el estado en la imprenta y el seguimiento.
 */
export function PrintPanel({ view, allDone, onSend, onShipping }: { view: BookView; allDone: boolean; onSend: () => Promise<string | null>; onShipping: (s: ShippingSummary) => void }) {
  const print = view.print!;
  const [editing, setEditing] = useState(!print.shipping);
  const [draft, setDraft] = useState<ShippingDraft>(print.shipping ?? {});
  const [field, setField] = useState<string | null>(null);
  // la dirección entera, para confirmar antes de imprimir
  const [confirm, setConfirm] = useState<Shipping | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const simulated = view.printMode === "dry-run";
  const open = print.status === "awaiting_approval" || print.status === "failed";

  const saveShipping = async () => {
    setBusy(true);
    setErr(null);
    setField(null);
    const r = await postJson<{ shipping?: ShippingSummary; field?: string }>("/api/libro/shipping", { bookId: view.bookId, shipping: draft });
    setBusy(false);
    if (r.status === 200 && r.json.shipping) {
      onShipping(r.json.shipping);
      setEditing(false);
    } else {
      setField(r.json.field ?? null);
      setErr(errorMessage(r.json));
    }
  };
  // la vista no trae la calle ni el teléfono (I16): se piden al pulsar «Cambiar» o «Mandar a imprimir» (revisión 27 oct)
  const fullAddress = async (): Promise<Shipping | null> => {
    setBusy(true);
    setErr(null);
    const r = await postJson<{ shipping?: Shipping }>("/api/libro/address", { bookId: view.bookId });
    setBusy(false);
    if (r.status === 200 && r.json.shipping) return r.json.shipping;
    setErr(errorMessage(r.json));
    return null;
  };
  const startEditing = async () => {
    const full = await fullAddress();
    if (!full) return;
    const { name, line1, line2, postcode, city, phone } = full;
    setDraft({ name, line1, line2: line2 ?? "", postcode, city, phone: phone ?? "" });
    setField(null);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditing(false);
    setField(null);
    setErr(null);
    setDraft({});
  };
  const askConfirm = async () => {
    const full = await fullAddress();
    if (full) setConfirm(full);
  };
  const send = async () => {
    setBusy(true);
    setErr(null);
    const e = await onSend();
    setBusy(false);
    setConfirm(null);
    if (e) setErr(e);
  };

  return (
    <section className="grid gap-4 rounded-[28px] bg-card p-6 shadow-[0_2px_0_#e6d8c1,0_24px_40px_-32px_rgba(35,32,54,0.5)] sm:p-8" data-testid="print-panel" data-status={print.status}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peach text-ink">
          <Icon.book size={22} />
        </span>
        <div className="grid gap-1">
          <h3 className="display text-[24px]">{TITLE[print.status]}</h3>
          <p className="text-ink-soft">{COPY[print.status]}</p>
        </div>
      </div>

      {print.status === "sending" && <Status testId="print-sending">Maquetando el libro y mandándolo a la imprenta. Tarda un minuto.</Status>}

      {print.shipping && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-paper px-4 py-3 text-[15px]" data-testid="print-address">
          <span>
            <strong>{print.shipping.name}</strong> · {print.shipping.postcode} {print.shipping.city}
            <span className="block text-[13px] text-mute">Por privacidad, aquí no enseñamos la calle ni el teléfono.</span>
          </span>
          {open && !confirm && (
            <button className="text-sm font-semibold text-accent-deep hover:underline" disabled={busy} onClick={() => void startEditing()} data-testid="ship-change">
              Cambiar
            </button>
          )}
        </div>
      )}
      {open && editing && (
        <div className="grid gap-3">
          <ShippingForm value={draft} onChange={setDraft} field={field} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busy} onClick={() => void saveShipping()} data-testid="ship-save">
              Guardar la dirección
            </button>
            {print.shipping && (
              <button className="btn-ghost" disabled={busy} onClick={cancelEditing} data-testid="ship-cancel">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {print.status === "failed" && <ErrorNote>No hemos podido mandarlo a la imprenta. Inténtalo otra vez; si se repite, escríbenos.</ErrorNote>}
      {err && <ErrorNote>{err}</ErrorNote>}

      {open && !editing && print.shipping && (
        <>
          {!confirm ? (
            <button className="btn-primary btn-lg w-full sm:w-auto sm:justify-self-start" disabled={!allDone || busy} onClick={() => void askConfirm()} data-testid="print-send">
              <Sparkle size={14} color="currentColor" />
              {print.status === "failed" ? "Volver a intentarlo" : "Mandar a imprimir"}
            </button>
          ) : (
            <div className="grid gap-3 rounded-2xl bg-butter/70 p-4" role="alertdialog" aria-label="Confirmar">
              <p className="text-[15px] text-ink">
                Lo enviaremos a <strong>{confirm.name}</strong>, {shippingLine(confirm)}. Después ya no se pueden cambiar los textos ni las ilustraciones. ¿Lo mandamos a imprimir?
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy} onClick={() => void send()} data-testid="print-confirm">
                  {busy ? "Mandando…" : "Sí, mandar a imprimir"}
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>
                  Todavía no
                </button>
              </div>
            </div>
          )}
          {!allDone && <p className="text-[13px] text-mute">Se puede mandar en cuanto estén las doce ilustraciones.</p>}
        </>
      )}

      {print.trackPath ? (
        <a className="btn-ghost justify-self-start" href={print.trackPath} data-testid="print-tracking">
          Seguir mi pedido
        </a>
      ) : (
        print.trackingUrl && (
          <a className="btn-ghost justify-self-start" href={print.trackingUrl} target="_blank" rel="noopener noreferrer" data-testid="print-tracking">
            Seguir el envío
          </a>
        )
      )}
      {simulated && !open && <p className="text-[13px] text-mute">Imprenta simulada en esta prueba: no se imprime ni se envía nada.</p>}
    </section>
  );
}

const TITLE: Record<NonNullable<BookView["print"]>["status"], string> = {
  awaiting_approval: "Tu libro de tapa dura",
  failed: "Tu libro de tapa dura",
  sending: "Camino de la imprenta",
  sent: "En la imprenta",
  in_production: "Imprimiéndose",
  shipped: "Va de camino",
  delivered: "Entregado",
  returned: "El envío ha vuelto",
  canceled: "Pedido cancelado",
};

const COPY: Record<NonNullable<BookView["print"]>["status"], string> = {
  awaiting_approval: "Revisa las páginas y cambia lo que quieras. Cuando esté como lo quieres, mándalo a imprimir: no lo imprimimos hasta que nos lo digas.",
  failed: "Revisa las páginas y cambia lo que quieras. Cuando esté como lo quieres, mándalo a imprimir.",
  sending: "Lo estamos preparando para la imprenta.",
  sent: "Lo imprimimos, lo encuadernamos y te lo enviamos. Suele llegar en una o dos semanas; te escribimos cuando salga.",
  in_production: "Lo están imprimiendo y encuadernando. Te escribimos con el seguimiento cuando salga.",
  shipped: "Ha salido de la imprenta. Con el seguimiento ves dónde está.",
  delivered: "Según el transportista, el libro ya ha llegado. Que lo disfrutéis.",
  returned: "El transportista no lo ha podido entregar. Escríbenos y lo resolvemos.",
  canceled: "El pedido de imprenta se ha cancelado. Escríbenos si no lo esperabas.",
};
