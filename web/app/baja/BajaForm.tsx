"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { postJson } from "@/lib/bookClient";

/** El botón de la baja: manda la llave del enlace a /api/baja y dice qué ha pasado. */
export function BajaForm() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "not_found" | "error">(token ? "idle" : "not_found");

  if (state === "done")
    return (
      <p className="text-[17px] text-ink-soft" data-testid="baja-hecha">
        Hecho. Ya no te mandaremos novedades. Si tienes un libro empezado, los emails de tu libro siguen llegando.
      </p>
    );
  if (state === "not_found")
    return (
      <p className="text-[17px] text-ink-soft" data-testid="baja-no-encontrada">
        Este enlace no es válido o está incompleto. Prueba a copiarlo entero desde el email, o escríbenos a hola@erasesuvez.com y te damos de baja nosotros.
      </p>
    );
  return (
    <div className="grid gap-4">
      <p className="text-[17px] text-ink-soft">Si te das de baja, dejaremos de mandarte avisos de nuevas ideas y ediciones.</p>
      <button
        type="button"
        className="btn-primary w-full sm:w-auto"
        disabled={state === "busy"}
        data-testid="baja-boton"
        onClick={async () => {
          setState("busy");
          const r = await postJson<{ ok?: boolean; error?: string }>("/api/baja", { t: token });
          setState(r.json.ok ? "done" : r.json.error === "not_found" ? "not_found" : "error");
        }}
      >
        {state === "busy" ? "Un momento…" : "Darme de baja"}
      </button>
      {state === "error" && (
        <p className="text-[15px] text-accent" role="alert">
          No hemos podido darte de baja ahora. Vuelve a intentarlo en un rato o escríbenos a hola@erasesuvez.com.
        </p>
      )}
    </div>
  );
}
