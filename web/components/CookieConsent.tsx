"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "cuentos:consent:analytics";
type Choice = "accepted" | "rejected";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

function loadClarity(id: string) {
  if (document.getElementById("ms-clarity")) return;
  const w = window as unknown as { clarity?: { (...args: unknown[]): void; q?: unknown[] } };
  w.clarity =
    w.clarity ||
    function (...args: unknown[]) {
      (w.clarity!.q = w.clarity!.q || []).push(args);
    };
  const s = document.createElement("script");
  s.id = "ms-clarity";
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(s);
}

/**
 * Consentimiento de analítica. Va en flujo normal (franja superior), no flotante: en el journey la barra de acciones
 * es fija abajo y un aviso flotante la taparía en móvil. Clarity (cookies de medición) solo se carga tras «Aceptar»; «Rechazar» tiene el mismo peso
 * visual y no carga nada. La elección se guarda en este navegador. Sin `clarityId` (build sin NEXT_PUBLIC_CLARITY_ID) no hay
 * nada que consentir y no se muestra.
 */
export function CookieConsent({ clarityId }: { clarityId: string | null }) {
  const [choice, setChoice] = useState<Choice | null | "unknown">("unknown");

  useEffect(() => {
    if (!clarityId) return;
    const c = readChoice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage tras montar (evita desajuste SSR)
    setChoice(c);
    if (c === "accepted") loadClarity(clarityId);
  }, [clarityId]);

  if (!clarityId || choice !== null) return null;

  const decide = (v: Choice) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* sin almacenamiento: la elección vale para esta visita */
    }
    setChoice(v);
    if (v === "accepted") loadClarity(clarityId);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookies de medición"
      data-testid="cookie-consent"
      className="no-print border-b border-line bg-card px-4 py-3 text-sm text-ink"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch] leading-snug">
          Usamos Microsoft Clarity para medir cómo se usa la web. Solo si lo aceptas. Más detalle en la{" "}
          <Link href="/privacidad" className="link">
            política de privacidad
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => decide("rejected")} data-testid="cookie-reject">
            Rechazar
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => decide("accepted")} data-testid="cookie-accept">
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
