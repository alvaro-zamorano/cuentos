"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPEN_CONSENT_EVENT, readConsent, saveConsent, startPostHog, withdrawConsent, type Consent } from "@/lib/analytics";

/**
 * Consentimiento de analítica. Va en flujo normal (franja superior), no flotante: en el journey la barra de acciones
 * es fija abajo y un aviso flotante la taparía en móvil. PostHog (lib/analytics.ts) solo se carga tras «Aceptar»;
 * «Rechazar» tiene el mismo peso visual y no carga nada. La elección se guarda en este navegador y se puede cambiar
 * cuando se quiera desde «Cookies» en el pie (OPEN_CONSENT_EVENT). Sin NEXT_PUBLIC_POSTHOG_KEY en el build no hay nada
 * que consentir y no se muestra.
 */
export function CookieConsent({ enabled }: { enabled: boolean }) {
  const [choice, setChoice] = useState<Consent | null | "unknown">("unknown");
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const c = readConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage tras montar (evita desajuste SSR)
    setChoice(c);
    if (c === "accepted") void startPostHog();
    const open = () => {
      setChoice(readConsent());
      setReopened(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, [enabled]);

  if (!enabled || choice === "unknown" || (choice !== null && !reopened)) return null;

  const decide = (v: Consent) => {
    const before = readConsent();
    setReopened(false);
    setChoice(v);
    if (v === "accepted") {
      saveConsent(v);
      void startPostHog();
    } else if (before === "accepted") {
      withdrawConsent();
    } else {
      saveConsent(v);
    }
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
          Usamos PostHog para medir cómo se usa la web y mejorarla. Solo si lo aceptas, y puedes cambiarlo cuando quieras desde «Cookies», al pie de la
          página.{choice ? ` Ahora: ${choice === "accepted" ? "aceptadas" : "rechazadas"}.` : ""} Más detalle en la{" "}
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

/** Enlace del pie que vuelve a abrir el aviso para cambiar la elección. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      data-testid="cookie-settings"
      onClick={() => {
        window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      Cookies
    </button>
  );
}
