"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/brand";

const noop = () => () => {};

/** El enlace para volver al libro desde cualquier dispositivo (también va por email si Resend está configurado). */
export function BookLink({ bookId, mail }: { bookId: string; mail?: boolean }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/crear?b=${bookId}`;
  return (
    <div className="grid gap-3 rounded-[22px] bg-paper-deep p-4 sm:p-5" data-testid="book-link">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-ink">
          <Icon.mail />
        </span>
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="block font-bold text-ink">Tu enlace para volver</span>
          Con este enlace vuelves a tu libro desde cualquier dispositivo durante 30 días.{mail ? " También te lo hemos mandado por email." : " Guárdalo."}
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-[18px] bg-card py-1.5 pr-1.5 pl-4">
        <code className="min-w-0 flex-1 text-[13px] break-all text-ink">{url}</code>
        <button
          type="button"
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper transition-transform active:scale-95"
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
