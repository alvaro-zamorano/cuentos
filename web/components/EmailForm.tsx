"use client";

import Link from "next/link";
import { useState } from "react";
import type { Edition } from "@/lib/types";

/**
 * Formulario de email + consentimiento (lead magnet y avisos). Lo usan /crear y /gratis.
 * - `openUrl`: pestaña que se abre en el gesto del usuario (si no, los navegadores la bloquean).
 * - `onSaved`: se llama tras guardar el lead (p. ej. para guardar el libro y mostrar el enlace).
 */
export function EmailForm({
  edition,
  source,
  initialEmail = "",
  submitLabel,
  openUrl,
  successMessage,
  onSaved,
  children,
}: {
  edition: Edition;
  source: "cuentos-web" | "gratis";
  initialEmail?: string;
  submitLabel: string;
  openUrl?: string;
  successMessage?: React.ReactNode;
  onSaved?: (email: string) => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    const tab = openUrl ? window.open(openUrl, "_blank") : null;
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, marketing, edition, consent, source }),
      });
      if (!res.ok) throw new Error("bad");
      setStatus("ok");
    } catch {
      tab?.close();
      setStatus("error");
      return;
    }
    await onSaved?.(email);
  };

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <label className="grid gap-1">
        <span className="field-label">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          autoComplete="email"
          className="input"
        />
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <span>
          Declaro ser madre, padre o tutor legal del menor, o contar con su autorización. Acepto que el cuento se guarde 30 días para poder
          recuperarlo con un enlace; después se borra. He leído la{" "}
          <Link href="/privacidad" target="_blank" className="link">
            política de privacidad
          </Link>{" "}
          y las{" "}
          <Link href="/condiciones" target="_blank" className="link">
            condiciones
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <span>Quiero recibir avisos de nuevas ocasiones y ediciones. Opcional; puedes darte de baja cuando quieras.</span>
      </label>
      <button type="submit" className="btn-primary justify-self-start" disabled={status === "sending"}>
        {status === "sending" ? "Enviando…" : submitLabel}
      </button>
      {status === "ok" && successMessage}
      {status === "ok" && children}
      {status === "error" && <p className="text-sm text-[#8a2a1c]">No se ha podido guardar el email. Comprueba la conexión e inténtalo de nuevo.</p>}
    </form>
  );
}
