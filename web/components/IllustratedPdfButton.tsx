"use client";

import { useState } from "react";
import { downloadBookPdf } from "@/lib/pdfClient";
import type { Draft } from "@/lib/types";

/** Botón «Descargar PDF» de la edición ilustrada: PDF en servidor; si falla, enlace a la vista de impresión. */
export function IllustratedPdfButton({ draft }: { draft: Draft }) {
  const [state, setState] = useState<"idle" | "preparing" | "fallback">("idle");
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn-primary btn-sm"
        data-testid="illustrated-pdf"
        disabled={state === "preparing"}
        onClick={async () => {
          setState("preparing");
          const ok = await downloadBookPdf(draft, "illustrated");
          setState(ok ? "idle" : "fallback");
        }}
      >
        {state === "preparing" ? "Preparando el PDF…" : "Descargar PDF"}
      </button>
      {state === "fallback" && (
        <span className="text-sm text-ink" data-testid="pdf-fallback">
          No hemos podido prepararlo en el servidor.{" "}
          <a className="link" href="/libro?edition=illustrated&print=1" target="_blank">
            Ábrelo aquí
          </a>{" "}
          y elige «Guardar como PDF».
        </span>
      )}
    </span>
  );
}
