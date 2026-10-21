"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readConsent, saveConsent, startPostHog, type Consent } from "@/lib/analytics";

function loadClarity(id: string) {
  if (document.getElementById("ms-clarity")) return;
  const w = window as unknown as { clarity?: { (...args: unknown[]): void; q?: unknown[] } };
  w.clarity =
    w.clarity ||
    function (...args: unknown[]) {
      (w.clarity!.q = w.clarity!.q || []).push(args);
    };
  // señal de consentimiento que Clarity exige en el EEE desde el 31 oct 2025: medición sí (la ha aceptado), publicidad no
  w.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
  const s = document.createElement("script");
  s.id = "ms-clarity";
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(s);
}

function loadAll(clarityId: string | null) {
  if (clarityId) loadClarity(clarityId);
  void startPostHog();
}

/**
 * Consentimiento de analítica. Va en flujo normal (franja superior), no flotante: en el journey la barra de acciones
 * es fija abajo y un aviso flotante la taparía en móvil. Clarity y PostHog (lib/analytics.ts) solo se cargan tras
 * «Aceptar»; «Rechazar» tiene el mismo peso visual y no carga nada. La elección se guarda en este navegador. Sin
 * ninguna de las dos configurada en el build no hay nada que consentir y no se muestra.
 */
export function CookieConsent({ clarityId, posthog }: { clarityId: string | null; posthog: boolean }) {
  const [choice, setChoice] = useState<Consent | null | "unknown">("unknown");
  const any = !!clarityId || posthog;

  useEffect(() => {
    if (!any) return;
    const c = readConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage tras montar (evita desajuste SSR)
    setChoice(c);
    if (c === "accepted") loadAll(clarityId);
  }, [any, clarityId]);

  if (!any || choice !== null) return null;

  const decide = (v: Consent) => {
    saveConsent(v);
    setChoice(v);
    if (v === "accepted") loadAll(clarityId);
  };

  const tools = [clarityId && "Microsoft Clarity", posthog && "PostHog"].filter(Boolean).join(" y ");

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
          Usamos {tools} para medir cómo se usa la web y mejorarla. Solo si lo aceptas. Más detalle en la{" "}
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
