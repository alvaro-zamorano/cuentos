"use client";

import { useState, type ReactNode } from "react";
import { errorMessage, postJson } from "@/lib/bookClient";
import { ErrorNote } from "./ui";

/**
 * Enlace del PDF con estado (auditoría 26 oct, I10): mientras se prepara dice «Preparando el PDF…» y no se puede volver a
 * pulsar; si falla, lo explica aquí en vez de abrir una pestaña con un error. Sin JavaScript, o con Ctrl/⌘ para abrirlo
 * aparte, es el enlace directo de siempre (que también explica el error en castellano).
 */
export function PdfLink({ bookId, kind, className, testId, children }: { bookId: string; kind: "full" | "free"; className: string; testId?: string; children: (busy: boolean) => ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <a
        className={className}
        href={`/api/libro/pdf?b=${bookId}&kind=${kind}`}
        data-testid={testId}
        aria-busy={busy}
        aria-disabled={busy}
        onClick={async (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setErr(null);
          const r = await postJson<{ url?: string }>("/api/libro/pdf", { bookId, kind });
          if (r.status === 200 && r.json.url) {
            window.location.assign(r.json.url);
            // la descarga no cambia de página: el botón vuelve a estar listo
            setTimeout(() => setBusy(false), 2500);
            return;
          }
          setErr(errorMessage(r.json, "No hemos podido preparar el PDF. Inténtalo de nuevo en un momento."));
          setBusy(false);
        }}
      >
        {children(busy)}
      </a>
      {err && (
        <div role="alert" className="w-full" data-testid="pdf-error">
          <ErrorNote>{err}</ErrorNote>
        </div>
      )}
    </>
  );
}
