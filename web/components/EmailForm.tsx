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
    <form onSubmit={submit} className="grid gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        aria-label="Email"
        className="rounded-2xl border-2 border-line bg-cream px-4 py-3 font-bold outline-none focus:border-ink"
      />
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          Soy madre, padre o tutor del peque, o cuento con su autorización para crear este cuento. Acepto que el cuento se guarde 30
          días para poder recuperarlo con un enlace; después se borra. He leído la{" "}
          <Link href="/privacidad" target="_blank" className="underline">
            política de privacidad
          </Link>{" "}
          y las{" "}
          <Link href="/condiciones" target="_blank" className="underline">
            condiciones
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1" />
        <span>Quiero que me aviséis de nuevas ocasiones y ediciones (opcional, puedes darte de baja cuando quieras).</span>
      </label>
      <button type="submit" className="btn-primary" disabled={status === "sending"}>
        {submitLabel}
      </button>
      {status === "ok" && successMessage}
      {status === "ok" && children}
      {status === "error" && <p className="text-sm font-bold text-coral">No se ha podido guardar el email. Prueba otra vez.</p>}
    </form>
  );
}
