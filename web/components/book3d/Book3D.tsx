"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand";
import type { Book3DData, Book3DHandle } from "@/lib/book3d/scene";

/** Qué se ve en cada paso: 0 cerrado, 1 portadilla, 2 dedicatoria, 3… páginas, último «Fin». */
function stepInfo(s: number, data: Book3DData): { label: string; text: string } {
  const P = data.pages.length;
  if (s === 0) return { label: "La portada", text: "" };
  if (s === 1) return { label: "Portadilla", text: "" };
  if (s === 2) return { label: "Dedicatoria", text: data.dedication ?? "" };
  if (s <= P + 2) return { label: `Página ${s - 2} de ${P}`, text: data.pages[s - 3]?.text ?? "" };
  return { label: "Fin", text: "" };
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function fontVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/**
 * El libro de tapa dura en 3D (lib/book3d/scene.ts). Mientras no carga, y si el navegador no puede con WebGL, se ve
 * `poster` (la portada en 2D, BookCover), del mismo sitio y tamaño: nada salta. Three se descarga solo cuando el visor
 * se acerca a la pantalla. Cerrado se puede girar; tocar lo abre; las páginas se pasan tocando, deslizando o con flechas.
 * En el móvil el texto de la página va debajo, porque el libro abierto sale pequeño.
 */
export function Book3D({ data, poster, hint = "Arrastra para girarlo · toca para abrirlo", testId = "book3d" }: { data: Book3DData; poster: ReactNode; hint?: string; testId?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<Book3DHandle | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [step, setStep] = useState(0);
  // el libro se rehace si cambian el texto o las imágenes (p. ej. una página repintada)
  const dataKey = JSON.stringify(data);

  useEffect(() => {
    const el = stage.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let cancelled = false;
    let introDone = false;
    let near: IntersectionObserver | null = null;
    let seen: IntersectionObserver | null = null;

    const start = async () => {
      if (!hasWebGL()) {
        setState("fallback");
        return;
      }
      setState("loading");
      try {
        const [{ createBook3D }] = await Promise.all([import("@/lib/book3d/scene"), document.fonts?.ready]);
        const fonts = {
          serif: fontVar("--font-serif", "Georgia, serif"),
          ui: fontVar("--font-ui", "system-ui, sans-serif"),
          hand: fontVar("--font-hand-ui", "cursive"),
        };
        const h = await createBook3D({
          canvas: cv,
          data: JSON.parse(dataKey) as Book3DData,
          fonts,
          reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          onStep: (n) => setStep(n),
        });
        if (cancelled) {
          h.dispose();
          return;
        }
        handle.current = h;
        setStep(0);
        setState("ready");
        // la media vuelta de presentación, cuando el libro está a la vista
        seen = new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting && !introDone) {
              introDone = true;
              h.intro();
            }
          },
          { threshold: 0.6 },
        );
        seen.observe(el);
      } catch (err) {
        console.warn("[book3d] sin visor 3D:", err);
        if (!cancelled) setState("fallback");
      }
    };

    near = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        near?.disconnect();
        void start();
      },
      { rootMargin: "300px" },
    );
    near.observe(el);

    return () => {
      cancelled = true;
      near?.disconnect();
      seen?.disconnect();
      handle.current?.dispose();
      handle.current = null;
    };
  }, [dataKey]);

  const ready = state === "ready";
  const steps = data.pages.length + 3;
  const info = stepInfo(step, data);

  return (
    <div className="grid gap-4" data-testid={testId} data-state={state}>
      <div ref={stage} className="relative aspect-[3/2] w-full max-w-full sm:aspect-[16/10]">
        <div aria-hidden={ready} className={`absolute inset-0 grid place-items-center transition-opacity duration-500 ${ready ? "pointer-events-none opacity-0" : "opacity-100"}`}>
          <div className="w-[64%] max-w-[420px]">{poster}</div>
        </div>
        <canvas
          ref={canvas}
          tabIndex={ready ? 0 : -1}
          aria-label={`Libro de tapa dura «${data.title}» en 3D. Usa las flechas para pasar las páginas.`}
          className={`absolute inset-0 block h-full w-full cursor-pointer touch-pan-y rounded-[14px] transition-opacity duration-500 outline-none focus-visible:shadow-[0_0_0_3px_var(--accent)] ${ready ? "opacity-100" : "opacity-0"}`}
        />
      </div>

      {state !== "fallback" && (
        <>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={!ready || step === 0}
              className="grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-edge bg-card transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              onClick={() => handle.current?.prev()}
            >
              <Icon.back />
            </button>
            <p className="m-0 min-w-[9em] text-center text-[15px] font-semibold tabular-nums" aria-live="polite" data-testid={`${testId}-step`}>
              {info.label}
            </p>
            <button
              type="button"
              aria-label={step === 0 ? "Abrir el libro" : step === steps ? "Cerrar el libro" : "Página siguiente"}
              disabled={!ready}
              className="grid h-12 w-12 place-items-center rounded-full bg-ink text-paper transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              onClick={() => handle.current?.next()}
            >
              <Icon.next />
            </button>
          </div>
          {info.text && <p className="story m-0 rounded-[18px] bg-card px-5 py-4 text-[16.5px] leading-[1.6] whitespace-pre-line text-ink sm:hidden">{info.text}</p>}
          {step === 0 && <p className="hand m-0 text-center text-[18px] text-ink-soft">{hint}</p>}
        </>
      )}
    </div>
  );
}
