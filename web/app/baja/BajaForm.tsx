"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { postJson } from "@/lib/bookClient";

type State = "idle" | "busy" | "done" | "not_found" | "error";

/**
 * El botón de la baja: manda la llave del enlace a /api/baja y dice qué ha pasado. La respuesta sale en una región viva
 * y se lleva el foco, para que la oiga quien usa un lector de pantalla.
 */
export function BajaForm() {
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<State>(token ? "idle" : "not_found");
  const [answered, setAnswered] = useState(false);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answered) result.current?.focus();
  }, [answered, state]);

  const asking = state === "idle" || state === "busy" || state === "error";
  return (
    <div className="grid gap-4">
      {asking && (
        <>
          <p className="text-[17px] text-ink-soft">Si te das de baja, dejaremos de mandarte avisos de nuevas ideas y ediciones.</p>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            disabled={state === "busy"}
            data-testid="baja-boton"
            onClick={async () => {
              setState("busy");
              setAnswered(false);
              const r = await postJson<{ ok?: boolean; error?: string }>("/api/baja", { t: token });
              setState(r.json.ok ? "done" : r.json.error === "not_found" ? "not_found" : "error");
              setAnswered(true);
            }}
          >
            {state === "busy" ? "Un momento…" : "Darme de baja"}
          </button>
        </>
      )}
      <div ref={result} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {state === "done" && (
          <p className="text-[17px] text-ink-soft" data-testid="baja-hecha">
            Hecho. Ya no te mandaremos novedades. Si tienes un libro empezado, los emails de tu libro siguen llegando.
          </p>
        )}
        {state === "not_found" && (
          <p className="text-[17px] text-ink-soft" data-testid="baja-no-encontrada">
            Este enlace no es válido o está incompleto. Prueba a copiarlo entero desde el email, o escríbenos a hola@erasesuvez.com y te damos de baja nosotros.
          </p>
        )}
        {state === "error" && (
          <p className="text-[15px] text-accent">No hemos podido darte de baja ahora. Vuelve a intentarlo en un rato o escríbenos a hola@erasesuvez.com.</p>
        )}
      </div>
    </div>
  );
}
