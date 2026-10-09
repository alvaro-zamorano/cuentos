import type { Metadata } from "next";
import Link from "next/link";
import { BookCover, BookSheet } from "@/components/BookSheet";
import { Scene } from "@/components/Scene";
import { SiteHeader } from "@/components/SiteHeader";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { DEMO_DRAFT } from "@/lib/demo";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { PRICE_CLASSIC, PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "@/lib/pricing";
import { buildBook } from "@/lib/story";

export const metadata: Metadata = {
  title: { absolute: "Cuento personalizado para niños, un regalo de cumpleaños para imprimir · cuentos" },
  description:
    "Cuento personalizado con tu hijo o tu hija como protagonista: su nombre, cómo es y quién le acompaña. Un regalo de cumpleaños escrito e ilustrado para él, en PDF para imprimir en casa o en tapa dura.",
};

const book = buildBook(DEMO_DRAFT);
const SAMPLE = book.pages[8]; // la tarta

const STEPS = [
  { n: 1, title: "Quién", body: "Su nombre, su edad y cómo es: pelo, piel, ojos, gafas y ropa. Sin fotos." },
  { n: 2, title: "Su mundo", body: "Quién le acompaña —su perro, la abuela, una hermana— y lo que más le gusta. Todo entra en la historia." },
  { n: 3, title: "El libro", body: "Lees las doce páginas, cambias lo que quieras y eliges la edición." },
];

const EDITIONS = [
  {
    name: "Clásico · PDF",
    price: PRICE_CLASSIC,
    body: "Las doce páginas ilustradas en gouache, en A4 para imprimir en casa.",
    status: "Disponible",
  },
  {
    name: "Ilustrado · PDF",
    price: PRICE_ILLUSTRATED,
    body: "Eliges el estilo de ilustración, revisas la hoja de personaje y puedes pedir otra versión de cada página.",
    status: DRY_RUN_PAYMENT ? "Disponible en prueba" : "Próximamente",
  },
  {
    name: "Tapa dura",
    price: PRICE_HARDCOVER,
    body: "El libro ilustrado, impreso y encuadernado, enviado a tu casa.",
    status: "Próximamente",
  },
];

const HOW = [
  { title: "Un avatar, no una foto", body: "Describes a tu hijo o a tu hija con rasgos. No pedimos fotografías ni usamos reconocimiento facial." },
  { title: "Una historia a su medida", body: "El texto se adapta a su edad, a quién le acompaña y a lo que más le gusta. Puedes reescribir cualquier página." },
  { title: "El mismo personaje de principio a fin", body: "Una hoja de personaje fija sus rasgos antes de pintar, para que se le reconozca en las doce páginas." },
  { title: "En casa o encuadernado", body: "El PDF se imprime en A4 en cinco minutos. La tapa dura llegará encuadernada a tu puerta." },
];

const FAQ = [
  {
    q: "¿Qué datos del menor pedís?",
    a: "Su nombre, su edad y los rasgos del avatar. No pedimos fotos, apellidos ni fecha de nacimiento.",
  },
  {
    q: "¿Qué hacéis con esos datos?",
    a: "Mientras creas el cuento, todo se queda en tu navegador. Si descargas el PDF, guardamos el cuento 30 días para que puedas recuperarlo con un enlace; después se borra. Tu email solo se usa para avisos si lo aceptas.",
  },
  {
    q: "¿Se puede devolver?",
    a: "Un libro personalizado se hace a medida y no admite desistimiento (art. 103.c TRLGDCU). Si el PDF no se abre o la tapa dura llega dañada, lo reponemos.",
  },
];

export default function Landing() {
  return (
    <main className="flex-1">
      <SiteHeader wide>
        <Link href="/crear" className="btn-primary btn-sm">
          Crear el libro
        </Link>
      </SiteHeader>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-[5fr_6fr] md:items-center md:gap-14 md:pb-24 md:pt-14">
        <div>
          <h1 className="display text-[44px] md:text-[64px]" style={{ fontVariationSettings: '"opsz" 144' }}>
            Un libro escrito y pintado para un solo lector.
          </h1>
          <p className="mt-6 max-w-[36ch] text-lg leading-relaxed text-ink-soft">
            Elige cómo es. Elige quién le acompaña. Nosotros escribimos y pintamos el resto.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href="/crear" className="btn-primary">
              Crear el libro
            </Link>
            <Link href="/gratis" className="link text-[15px]">
              Ver un cuento de muestra
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-soft">Se imprime en casa en cinco minutos. Pronto, también en tapa dura.</p>
        </div>
        <figure className="-mx-4 sm:mx-0">
          <div className="bg-paper-deep px-4 py-6 sm:rounded-[8px] sm:px-8 sm:py-10">
            <BookCover
              title={book.title}
              dedication={book.dedication}
              traits={DEMO_DRAFT.hero.traits}
              styleId={DEFAULT_PAINTED_STYLE}
              titleAs="p"
              className="!aspect-[297/210] !h-auto !w-full shadow-[0_1px_2px_rgba(31,26,23,0.1),0_12px_32px_-12px_rgba(31,26,23,0.25)]"
            />
          </div>
          <figcaption className="mt-3 px-4 text-sm text-ink-soft sm:px-0">Portada del cuento de Lucas, 5 años.</figcaption>
        </figure>
      </section>

      {/* Tres pasos */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Cómo se hace</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-12">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[2.5rem_1fr] gap-x-2 md:block">
                <span className="display text-[40px] leading-none text-ink-soft/70 italic" aria-hidden>
                  {s.n}
                </span>
                <div className="md:mt-4">
                  <h3 className="font-display text-xl font-medium">{s.title}</h3>
                  <p className="mt-2 max-w-[38ch] leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/crear" className="btn-primary mt-12">
            Empezar
          </Link>
        </div>
      </section>

      {/* Muestra */}
      <section className="border-t border-line bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Una doble página</h2>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-soft">
            Así se imprime cada hoja: la ilustración a la izquierda y el texto enfrente, en A4 apaisado. Página {SAMPLE.n} de «{book.title}».
          </p>
          <div className="-mx-4 mt-10 sm:mx-0">
            <BookSheet
              n={SAMPLE.n}
              text={SAMPLE.text}
              className="!aspect-[297/210] !h-auto !w-full shadow-[0_1px_2px_rgba(31,26,23,0.1),0_16px_40px_-16px_rgba(31,26,23,0.3)]"
              image={
                <Scene
                  style={DEFAULT_PAINTED_STYLE}
                  scene={SAMPLE.scene}
                  traits={DEMO_DRAFT.hero.traits}
                  expression={SAMPLE.expression}
                  companion={SAMPLE.withCompanion ? DEMO_DRAFT.companion : undefined}
                  special={DEMO_DRAFT.special}
                  age={DEMO_DRAFT.hero.age}
                  className="block w-full"
                />
              }
            />
          </div>
        </div>
      </section>

      {/* Ediciones */}
      <section className="border-t border-line" id="ediciones">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Ediciones</h2>
          <ul className="mt-10 border-t border-ink/80">
            {EDITIONS.map((e) => (
              <li key={e.name} className="grid gap-x-8 gap-y-2 border-b border-line py-6 md:grid-cols-[14rem_1fr_10rem] md:items-baseline">
                <div className="flex items-baseline justify-between gap-4 md:block">
                  <h3 className="font-display text-xl font-medium">{e.name}</h3>
                  <span className="font-display text-lg md:hidden">{e.price}</span>
                </div>
                <div>
                  <p className="max-w-[56ch] leading-relaxed text-ink-soft">{e.body}</p>
                  <p className="mt-1 text-sm text-ink-soft/80">{e.status}</p>
                </div>
                <span className="hidden text-right font-display text-xl md:block">{e.price}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">Precios con IVA incluido.</p>
        </div>
      </section>

      {/* Cómo lo hacemos */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Cómo lo hacemos</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {HOW.map((h) => (
              <div key={h.title} className="border-t border-line pt-5">
                <dt className="font-display text-xl font-medium">{h.title}</dt>
                <dd className="mt-2 max-w-[52ch] leading-relaxed text-ink-soft">{h.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Preguntas */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Preguntas</h2>
          <div className="mt-8 border-t border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[64ch] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            Más detalle en la{" "}
            <Link href="/privacidad" className="link">
              política de privacidad
            </Link>{" "}
            y las{" "}
            <Link href="/condiciones" className="link">
              condiciones
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
