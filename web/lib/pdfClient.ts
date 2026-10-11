"use client";

import type { Draft, Edition } from "./types";

/**
 * Pide el PDF al servidor (/api/pdf) y lo descarga. Devuelve false si el servidor no puede
 * (sin Chromium, tiempo agotado…): el que llama abre /libro?print=1 como alternativa.
 */
export async function downloadBookPdf(draft: Draft, edition: Edition, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, edition }),
      signal,
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/pdf")) return false;
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "cuento.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}
