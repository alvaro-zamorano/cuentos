"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** El enlace para volver al libro desde cualquier dispositivo (también va por email si Resend está configurado). */
export function BookLink({ bookId, mail }: { bookId: string; mail?: boolean }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/crear?b=${bookId}`;
  return (
    <div className="grid gap-2 rounded-[6px] border border-line px-4 py-3 text-sm" data-testid="book-link">
      <p className="text-ink-soft">
        Con este enlace vuelves a tu libro desde cualquier dispositivo durante 30 días.{mail ? " También te lo hemos mandado por email." : " Guárdalo."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 break-all text-ink">{url}</code>
        <button
          type="button"
          className="text-accent underline-offset-2 hover:underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
