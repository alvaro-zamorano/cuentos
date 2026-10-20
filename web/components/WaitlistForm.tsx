"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./brand";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; email: string } | { kind: "error"; message: string };

const ERRORS: Record<string, string> = {
  email: "Revisa el email: parece que le falta algo.",
  consent: "Marca la casilla para que podamos escribirte.",
  rate: "Demasiados intentos seguidos. Prueba dentro de un rato.",
};

/** Formulario de la lista de espera (POST /api/lista). */
export function WaitlistForm({ idea }: { idea?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return setState({ kind: "error", message: ERRORS.consent });
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, idea, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) return setState({ kind: "done", email: email.trim() });
      setState({ kind: "error", message: ERRORS[data.error ?? ""] ?? "No hemos podido guardarlo. Prueba otra vez en un momento." });
    } catch {
      setState({ kind: "error", message: "No hay conexión. Prueba otra vez en un momento." });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="grid gap-2 rounded-[24px] bg-sage px-6 py-6" role="status" data-testid="waitlist-done">
        <p className="display m-0 flex items-center gap-2 text-[24px]">
          <Icon.check size={24} className="text-accent" />
          Apuntado
        </p>
        <p className="m-0 leading-relaxed text-[#3f384f]">Te escribiremos a {state.email} el día que abramos. Puedes darte de baja desde ese mismo email.</p>
      </div>
    );
  }

  const sending = state.kind === "sending";
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-[24px] bg-card px-5 py-6 shadow-[0_2px_0_#e6d8c1] sm:px-7" noValidate>
      <label className="grid gap-2">
        <span className="font-semibold">Tu email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@ejemplo.com"
          className="input text-lg"
        />
      </label>
      {/* trampa para bots: fuera de la vista y del orden de tabulación */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
      <label className="flex items-start gap-3 text-[15px] leading-relaxed">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" />
        <span>
          Quiero que me aviséis cuando abráis y recibir alguna novedad de Érase su vez. Me puedo dar de baja cuando quiera.{" "}
          <Link href="/privacidad" className="link">
            Privacidad
          </Link>
        </span>
      </label>
      {state.kind === "error" && (
        <p className="m-0 text-[15px] font-semibold text-danger" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn-primary btn-lg justify-self-start" disabled={sending}>
        {sending ? "Guardando…" : "Avísame cuando abra"}
      </button>
    </form>
  );
}
