/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP) */
import Link from "next/link";
import { Icon } from "@/components/brand";
import { MUESTRA, muestraImage } from "@/lib/muestra";
import { OCASIONES, ocasionPath } from "@/lib/ocasiones";
import { PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "@/lib/pricing";

/** Botón de empezar: a /crear con su idea si la app está abierta; con ella cerrada, «Muy pronto» sin enlace (lib/appOpen.ts). */
export function StartButton({ open, idea, label = "Crear su cuento", className = "btn-primary btn-lg" }: { open: boolean; idea?: string; label?: string; className?: string }) {
  if (!open) {
    return (
      <span className={`${className} cursor-default opacity-60`} aria-disabled="true">
        Muy pronto
      </span>
    );
  }
  return (
    <Link href={idea ? `/crear?idea=${encodeURIComponent(idea)}` : "/crear"} className={className}>
      {label} <Icon.arrow size={20} />
    </Link>
  );
}

/** Nota bajo el botón cuando la app está cerrada: abrimos pronto y el email de contacto. */
export function ClosedNote({ open, contact, className = "" }: { open: boolean; contact: string; className?: string }) {
  if (open) return null;
  return (
    <p className={`m-0 text-[15px] ${className}`}>
      Abrimos muy pronto. Si tienes alguna pregunta, escríbenos a{" "}
      <a href={`mailto:${contact}`} className="link">
        {contact}
      </a>
      .
    </p>
  );
}

const BOOK = [
  "Doce páginas ilustradas con su historia, y la portada",
  "Lees el cuento entero y ves su portada gratis antes de pagar",
  "Sin fotos: lo describes con sus rasgos y ves cómo queda",
  "Revisas cada página; no lo imprimimos hasta que nos lo digas",
  "Tapa dura con envío a casa (Península y Baleares) y el PDF para leerlo ya",
];

/** Qué es el libro y cuánto cuesta: lo mismo en todas las ocasiones. */
export function BookFacts({ open, idea }: { open: boolean; idea?: string }) {
  return (
    <div className="grid gap-6 rounded-[28px] bg-night px-6 py-8 text-moon sm:px-9 sm:py-10 md:grid-cols-[1.3fr_1fr] md:items-center">
      <div>
        <h2 className="display m-0 text-[28px] sm:text-[34px]">Cómo es el libro</h2>
        <ul className="m-0 mt-5 grid list-none gap-2.5 p-0 text-[16px] text-[#e4e8f2]">
          {BOOK.map((x) => (
            <li key={x} className="flex gap-2.5">
              <Icon.check size={20} className="mt-0.5 shrink-0 text-star" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 md:justify-items-start">
        <p className="m-0 text-[15px] font-bold text-[#b9c1da]">Tapa dura, con envío y el PDF</p>
        <p className="display m-0 text-[48px] leading-none">{PRICE_HARDCOVER}</p>
        <p className="m-0 text-[15px] text-moon-soft">O solo el PDF ilustrado, {PRICE_ILLUSTRATED}. Precios con IVA.</p>
        <StartButton open={open} idea={idea} className="btn-primary btn-lg mt-2" />
      </div>
    </div>
  );
}

/** Tres páginas del libro de muestra: cómo es por dentro. */
export function InsideBook() {
  const pages = [3, 7, 9];
  return (
    <div className="grid gap-5">
      <div className="max-w-[60ch]">
        <h2 className="display m-0 text-[28px] sm:text-[34px]">Así es por dentro</h2>
        <p className="m-0 mt-2 text-lg text-ink-soft">
          Tres páginas de «{MUESTRA.title}», nuestro libro de muestra. Salió de una sola frase.{" "}
          <Link href="/#muestra" className="link">
            Hojéalo entero
          </Link>
          .
        </p>
      </div>
      <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-3">
        {pages.map((n) => (
          <li key={n} className="overflow-hidden rounded-[14px] bg-[#fbf6ec] shadow-[0_2px_0_#e6d8c1]">
            <img src={muestraImage(n)} alt={`Página ${n} de «${MUESTRA.title}»`} width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full object-cover" />
            <p className="story m-0 line-clamp-4 px-4 pt-3 pb-4 text-[14px] leading-relaxed text-[#3a3346]">{MUESTRA.pages[n - 1].replace(/\n/g, " ")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Enlaces a las demás ocasiones. */
export function OtherOcasiones({ current }: { current?: string }) {
  return (
    <nav aria-label="Otras ocasiones" className="grid gap-4">
      <h2 className="display m-0 text-[24px] sm:text-[28px]">{current ? "Otras ocasiones" : "Para cada ocasión"}</h2>
      <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
        {OCASIONES.filter((o) => o.slug !== current).map((o) => (
          <li key={o.slug}>
            <Link href={ocasionPath(o.slug)} className="chip transition-transform hover:-translate-y-0.5">
              {o.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Preguntas en tarjetas plegables, como en la landing. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="grid gap-3">
      {items.map((f, i) => (
        <details key={f.q} className="group rounded-[20px] bg-card px-5 py-4 shadow-[0_2px_0_#eaddc6] sm:px-6 sm:py-5" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[18px] font-semibold sm:text-[20px] [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-deep text-ink transition-transform group-open:rotate-45 group-open:bg-peach">
              +
            </span>
          </summary>
          <p className="m-0 mt-3 max-w-[64ch] leading-relaxed text-ink-soft">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
