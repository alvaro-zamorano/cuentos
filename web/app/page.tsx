/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP 1400 px) */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BookCover, Blob, Hills, Icon, Moon, Sparkle } from "@/components/brand";
import { SampleFlipper } from "@/components/landing/SampleFlipper";
import { paymentMode } from "@/lib/stripe";
import { printMode } from "@/lib/print/gelato";
import { MUESTRA, muestraImage } from "@/lib/muestra";
import { PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "@/lib/pricing";
import { appOpen } from "@/lib/appOpen";
import { titular } from "@/lib/legal";

export const metadata: Metadata = {
  title: { absolute: "Cuento personalizado para niños, escrito e ilustrado con su historia · Érase su vez" },
  description:
    "Un cuento personalizado con tu hijo, tu nieta o tu sobrino de protagonista y la historia que tú quieras: su cumpleaños, un viaje a la Luna o el primer día de cole. Lo escribimos y lo ilustramos; lo lees gratis y te lo enviamos impreso en tapa dura.",
};

/**
 * Portadas hechas con el flujo de /crear a partir de las fichas de prueba (docs/ILUSTRACION.md, 13 oct).
 * `who`: la idea de la ficha, resumida (lib/plan/evalCases.ts). Son ejemplos: el texto no debe sugerir que son clientes.
 */
const COVERS = [
  { src: "/muestra/portada-navidad.webp", title: "Daniela y el ruido del tejado", name: "Daniela", who: "Daniela, 4 años: un ruido en el tejado en Nochebuena", tilt: -2 },
  { src: "/muestra/portada-cole.webp", title: "Hugo y la mochila de dinosaurio", name: "Hugo", who: "Hugo, 3 años: su primer día de cole, con su mochila de dinosaurio", tilt: 1.5 },
  { src: "/muestra/portada-cumpleanos.webp", title: "Lucía y las pistas de la abuela", name: "Lucía", who: "Lucía, 8 años: las pistas que esconde su abuela por su cumpleaños", tilt: -1 },
  { src: "/muestra/portada-nubes.webp", title: "Mateo y la torre que tocaba las nubes", name: "Mateo", who: "Mateo, 5 años: historia sorpresa (le encanta hacer torres)", tilt: 2 },
];

/** Ideas de arranque que llevan a /crear con la idea puesta (lib/plan/starters.ts). */
const STARTS = [
  { id: "cumpleanos", label: "Su cumpleaños", icon: Icon.cake },
  { id: "navidad", label: "Navidad", icon: Icon.tree },
  { id: "reyes", label: "Noche de Reyes", icon: Icon.star },
  { id: "cole", label: "Primer día de cole", icon: Icon.bag },
  { id: "hermanito", label: "Llega un hermanito", icon: Icon.heart },
  { id: "dientes", label: "Se le cae un diente", icon: Icon.tooth },
  { id: "luna", label: "Viaje a la Luna", icon: Icon.moon },
];

const STEPS = [
  { n: 1, title: "Nos cuentas la idea", body: "Con una frase basta. O eliges una para empezar: su cumpleaños, Navidad, un viaje a la Luna.", tint: "bg-peach" },
  { n: 2, title: "Ves cómo queda", body: "Te enseñamos cómo será en el libro y la portada. ¿Más rizos? ¿El perro más pequeño? Lo pides con palabras.", tint: "bg-sky" },
  { n: 3, title: "Tienes su libro", body: "Un libro de tapa dura con sus doce ilustraciones, en tu casa, y el PDF para leerlo ya. Si una ilustración no te convence, la repetimos.", tint: "bg-butter" },
];

const HOW = [
  { title: "La historia que tú quieras", body: "Cualquier historia que le contarías en voz alta: su cumpleaños, la llegada de su hermana o un dragón en el jardín.", tint: "bg-peach", icon: Icon.feather },
  { title: "Se le reconoce en cada página", body: "Sus gafas, su flequillo, su chubasquero de siempre: de la portada a la última página. Antes de ilustrar el libro, te enseñamos cómo será.", tint: "bg-sky", icon: Icon.people },
  { title: "Sin fotos", body: "Lo describes con sus rasgos: pelo, piel, ojos, gafas y lo que le hace único. Sale un personaje de cuento con esos rasgos, no un retrato.", tint: "bg-butter", icon: Icon.nocamera },
  { title: "Tú das el visto bueno", body: "Lees el cuento antes de ilustrarlo y revisas cada página antes de imprimir.", tint: "bg-sage", icon: Icon.approve },
];

const FAQ = [
  {
    q: "¿Quién escribe e ilustra el cuento?",
    a: "Una IA que hemos preparado para escribir e ilustrar cuentos infantiles en castellano. Tiene reglas propias: nada que asuste de verdad, ni marcas, ni personajes de películas o series. Cada ilustración pasa un control automático antes de que la veas, y tú lo lees y lo revisas todo antes de imprimir.",
  },
  {
    q: "¿Se le va a parecer?",
    a: "Se parece por los rasgos que eliges: el pelo, la piel, los ojos, las gafas y lo que le hace único, como unas pecas o su gorra. Es un personaje de cuento con esos rasgos, no un retrato. Antes de pagar ves cómo queda y, si algo no encaja, lo cambias con palabras.",
  },
  {
    q: "¿Puede salir su personaje favorito?",
    a: "Los personajes de películas, series o marcas no pueden salir. Si la idea lleva uno, lo cambiamos por uno inventado y te lo decimos. Si quiere ser un superhéroe, lo será, con su propio traje.",
  },
  {
    q: "¿Para qué edades es?",
    a: "De 1 a 10 años. El texto se adapta a la edad: frases muy cortas y con ritmo para los más pequeños, y más trama y diálogo a partir de los siete.",
  },
  {
    q: "¿Cuánto tarda?",
    a: "El cuento escrito, medio minuto. Los personajes y la portada, uno o dos minutos. Las doce ilustraciones, unos minutos más; puedes cerrar la página y volver con el enlace.",
  },
  {
    q: "¿Llega a tiempo para Navidad o Reyes?",
    a: "El libro impreso tarda una o dos semanas desde que lo mandas a imprimir. Si vas justo de tiempo, el PDF está listo en unos minutos y el libro llega después.",
  },
  {
    q: "¿Qué datos del niño pedís?",
    a: "Su nombre, su edad y cómo es, más lo que tú quieras contar en la historia. No pedimos fotos, apellidos ni fecha de nacimiento.",
  },
  {
    q: "¿Qué hacéis con esos datos?",
    a: "Para escribir el cuento, lo que nos cuentas pasa por nuestro servidor y por la IA que lo escribe. Guardamos el libro 30 días para que puedas volver a él con un enlace; después se borra. Tu email solo se usa para mandarte ese enlace y, si lo aceptas, novedades.",
  },
  {
    q: "¿Se puede devolver?",
    a: "Lees el cuento y ves la portada antes de pagar. Como cada libro se hace a medida, no admite devolución (art. 103.c TRLGDCU). Si el libro llega dañado o con un fallo de impresión, lo volvemos a imprimir; si el PDF no se abre, lo reponemos.",
  },
];

const CHECK = <Icon.check size={18} className="shrink-0 text-star" />;

export default function Landing() {
  // se fija al construir la página (estática): Stripe configurado → disponible
  const illustratedStatus = { stripe: null, "dry-run": "Disponible en prueba", none: "Muy pronto" }[paymentMode()];
  // tapa dura: hace falta el pago y la imprenta (o las dos simuladas en la preview)
  const pm = paymentMode();
  const pr = printMode();
  const hardcoverStatus = pm === "none" || pr === "none" ? "Muy pronto" : pm === "dry-run" || pr === "dry-run" ? "Disponible en prueba" : null;
  // con la app cerrada (lib/appOpen.ts, producción hasta que se abra): «Muy pronto» en vez de los botones a /crear
  const open = appOpen();
  const contact = titular().email ?? "hola@erasesuvez.com";
  return (
    <main className="flex-1">
      {/* Portada en noche */}
      <section className="relative overflow-hidden bg-night text-moon">
        <SiteHeader wide night>
          <nav aria-label="Principal" className="flex items-center gap-7">
            <div className="hidden items-center gap-7 text-[15px] font-medium text-[#d9deec] md:flex">
              <a href="#como" className="hover:text-moon">
                Cómo funciona
              </a>
              <a href="#muestra" className="hover:text-moon">
                Libro de muestra
              </a>
              <a href="#ediciones" className="hover:text-moon">
                Precios
              </a>
              <a href="#preguntas" className="hover:text-moon">
                Preguntas
              </a>
            </div>
            {open ? (
              <Link href="/crear" className="btn-primary btn-sm">
                Crear su cuento
              </Link>
            ) : (
              <a href="#pronto" className="btn-primary btn-sm">
                Muy pronto
              </a>
            )}
          </nav>
        </SiteHeader>
        <Sparkle className="twinkle absolute top-[14%] left-[5%]" size={22} />
        <Sparkle className="twinkle-slow absolute top-[38%] left-[48%] hidden md:block" size={12} color="var(--moon)" />
        <Sparkle className="twinkle absolute top-[16%] right-[8%]" size={14} color="var(--moon)" />
        <Moon className="absolute top-[12%] right-[30%] hidden opacity-90 lg:block" size={70} />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-36 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-14 md:pt-14 md:pb-44">
          <div className="grid gap-6">
            <span className="inline-flex items-center gap-2 justify-self-start rounded-full border border-star/40 bg-star/15 px-3.5 py-1.5 text-sm font-semibold text-star">
              <Sparkle size={12} />
              {open ? "Su cuento, esta misma noche" : "Muy pronto"}
            </span>
            <h1 className="display m-0 text-[44px] leading-[1.04] text-moon sm:text-[58px] lg:text-[74px]">
              Una frase tuya. <span className="text-star">Un libro suyo.</span>
            </h1>
            <p className="m-0 max-w-[36ch] text-lg leading-relaxed text-moon-soft sm:text-xl">Cuéntanos la idea en una frase. La convertimos en un cuento ilustrado de doce páginas, con tu hijo, tu nieta o tu sobrino de protagonista.</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {open ? (
                <>
                  <Link href="/crear" className="btn-primary btn-lg">
                    Crear su cuento <Icon.arrow size={20} />
                  </Link>
                  <a href="#muestra" className="btn-moon btn-lg">
                    Ver un libro de ejemplo
                  </a>
                </>
              ) : (
                <a href="#muestra" className="btn-primary btn-lg">
                  Ver un libro de ejemplo
                </a>
              )}
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[15px] text-[#b9c1da]">
              <li className="flex items-center gap-2">{CHECK}Sin subir fotos</li>
              <li className="flex items-center gap-2">{CHECK}El cuento y la portada, gratis</li>
              <li className="flex items-center gap-2">{CHECK}Tapa dura con envío a casa</li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[460px] pb-28 sm:pb-32">
            {/* el libro abierto detrás de la portada: ilustración a la izquierda y texto a la derecha */}
            <div aria-hidden className="absolute -top-4 -right-6 hidden w-[84%] rotate-[6deg] grid-cols-2 overflow-hidden rounded-[6px] bg-[#fbf6ec] shadow-[0_30px_60px_-30px_rgba(5,10,30,0.8)] sm:grid">
              <img src={muestraImage(3)} alt="" width={1400} height={939} className="block aspect-[4/3] w-full object-cover" />
              <p className="story m-0 self-center bg-gradient-to-r from-ink/10 to-transparent to-[12%] px-4 text-[10.5px] leading-relaxed text-[#3a3346]">Al atardecer, Vera se puso su traje de astronauta, el blanco con rayas amarillas. A Toby le tocó un casco de burbuja hecho a su medida.</p>
            </div>
            <div className="floaty relative mx-auto w-[92%] pt-0 sm:mx-0 sm:w-[86%] sm:pt-24">
              <BookCover name={MUESTRA.hero} title={MUESTRA.title} from="mamá y papá" src={muestraImage(0)} alt={`Portada de «${MUESTRA.title}»: Vera y su perro Toby vuelan en un cohete de cartón hacia la Luna`} />
            </div>
            <div className="absolute bottom-0 left-0 w-[72%] max-w-[290px] rotate-[2.5deg] rounded-[20px] bg-card px-4 pt-3.5 pb-4 text-ink shadow-[0_24px_50px_-22px_rgba(5,10,30,0.75)] sm:-left-4">
              <p className="hand m-0 mb-1 text-[19px] leading-tight text-accent">hecho con esta frase:</p>
              <p className="m-0 text-[14.5px] leading-snug">«{MUESTRA.idea}»</p>
            </div>
          </div>
        </div>
        <Hills className="absolute -bottom-px left-0 h-[70px] sm:h-[90px]" />
      </section>

      {/* Cómo se hace */}
      <section id="como" className="mx-auto max-w-6xl scroll-mt-6 px-4 pt-14 pb-20 sm:px-6 md:pt-20 md:pb-24">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="hand text-[22px] text-accent">así se hace</span>
          <h2 className="display m-0 max-w-[18ch] text-[36px] sm:text-[52px]">De una frase a un libro, en tres pasos.</h2>
        </div>
        <ol className="m-0 mt-12 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-7">
          {STEPS.map((s) => (
            <li key={s.n} className="reveal grid content-start gap-5">
              <div className={`grid h-[230px] place-items-center rounded-[28px] p-6 sm:h-[250px] ${s.tint}`}>{s.n === 1 ? <IdeaCard /> : s.n === 2 ? <SheetCard /> : <PagesCard />}</div>
              <div className="flex items-start gap-3.5">
                <span className="display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-[21px] text-white">{s.n}</span>
                <div>
                  <h3 className="display m-0 mt-0.5 mb-1.5 text-[24px] sm:text-[26px]">{s.title}</h3>
                  <p className="m-0 leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-center">
          {open && (
            <Link href="/crear" className="btn-primary btn-lg">
              Empezar su cuento
            </Link>
          )}
          <span className="text-[15px] text-ink-soft">Lees el cuento entero y ves su portada gratis. Pagas solo por las doce ilustraciones.</span>
        </div>
      </section>

      {/* Libro de muestra */}
      <section id="muestra" className="relative scroll-mt-6 overflow-hidden bg-paper-deep">
        <Blob className="pointer-events-none absolute -top-16 -right-32 h-[390px] w-[520px] opacity-80" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="max-w-[640px]">
            <span className="hand text-[22px] text-accent">el libro de muestra</span>
            <h2 className="display m-0 mt-1 mb-3 text-[36px] sm:text-[52px]">Hojea el libro de Vera.</h2>
            <p className="m-0 text-lg text-ink-soft">Una sola frase: «{MUESTRA.idea.replace(/\.$/, "")}». De ahí salieron las doce páginas y la portada.</p>
          </div>
          <div className="mt-6">
            <SampleFlipper />
          </div>
        </div>
      </section>

      {/* Otras portadas */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-10 sm:px-6 md:pt-24">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="hand text-[22px] text-accent">más ejemplos</span>
          <h2 className="display m-0 max-w-[20ch] text-[36px] sm:text-[52px]">Cada uno, su historia.</h2>
          <p className="m-0 mt-1 max-w-[52ch] text-lg text-ink-soft">Cuatro portadas más. Debajo de cada una, la idea de la que salió.</p>
        </div>
        <ul className="m-0 mt-12 grid list-none grid-cols-1 gap-x-10 gap-y-12 p-0 sm:grid-cols-2">
          {COVERS.map((c) => (
            <li key={c.src} className="reveal grid justify-items-center gap-3.5">
              <BookCover name={c.name} title={c.title} src={c.src} alt={`Portada de «${c.title}»`} tilt={c.tilt} className="w-full max-w-[420px] transition-transform duration-300 hover:-translate-y-1" />
              <span className="hand text-center text-[17px] text-ink-soft sm:text-[18px]">{c.who}</span>
            </li>
          ))}
        </ul>
        <div className="mt-16 grid justify-items-center gap-4">
          <p className="display m-0 text-[22px] sm:text-[24px]">{open ? "¿Por dónde empezamos?" : "Algunas ideas para empezar"}</p>
          <div className="flex max-w-[860px] flex-wrap justify-center gap-2.5">
            {STARTS.map((s) =>
              open ? (
                <Link key={s.id} href={`/crear?idea=${s.id}`} className="chip transition-transform hover:-translate-y-0.5">
                  <s.icon size={18} className="text-accent" />
                  {s.label}
                </Link>
              ) : (
                <span key={s.id} className="chip cursor-default">
                  <s.icon size={18} className="text-accent" />
                  {s.label}
                </span>
              ),
            )}
            {open && (
              <Link href="/crear" className="chip chip-on transition-transform hover:-translate-y-0.5">
                <Sparkle size={15} />
                Sorpréndeme
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Cómo lo hacemos */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 md:pb-24">
        <h2 className="display m-0 mb-8 text-center text-[30px] sm:text-[36px]">Lo que lo hace suyo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {HOW.map((h) => (
            <div key={h.title} className={`reveal grid content-start gap-3 rounded-[28px] px-6 pt-7 pb-8 ${h.tint}`}>
              <span className="grid h-13 w-13 place-items-center rounded-full bg-card">
                <h.icon size={26} />
              </span>
              <h3 className="display m-0 mt-1 text-[22px] sm:text-[23px]">{h.title}</h3>
              <p className="m-0 text-[16px] leading-relaxed text-[#3f384f]">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ediciones */}
      <section id="ediciones" className="scroll-mt-6 bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="grid justify-items-center gap-2 text-center">
            <span className="hand text-[22px] text-accent">ediciones</span>
            <h2 className="display m-0 max-w-[22ch] text-[34px] sm:text-[48px]">Empiezas gratis. Pagas solo por el libro.</h2>
          </div>
          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-3 md:gap-5">
            <div className="flex flex-col gap-5 rounded-[28px] bg-card px-7 py-8 shadow-[0_2px_0_#e6d8c1]">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink-soft">El cuento · PDF</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">Gratis</p>
              </div>
              <ul className="m-0 grid list-none gap-2.5 p-0 text-[16px]">
                {["El cuento completo, escrito para él o ella", "Cómo será en el libro y la portada ilustrada", "PDF en A4 apaisado: la portada ilustrada y las páginas solo con texto"].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Icon.check size={20} className="mt-0.5 shrink-0 text-accent" />
                    {x}
                  </li>
                ))}
              </ul>
              <Cta open={open} className="btn-ghost mt-auto w-full">
                Empezar gratis
              </Cta>
            </div>

            <div className="relative flex flex-col gap-5 rounded-[28px] bg-night px-7 py-8 text-moon shadow-[0_40px_70px_-40px_rgba(29,39,71,0.9)]">
              <span className="absolute -top-3.5 right-6 inline-flex items-center gap-1.5 rounded-full bg-star px-3.5 py-1.5 text-[13px] font-bold text-ink">
                <Sparkle size={12} color="var(--ink)" />
                Para regalar
              </span>
              <div>
                <p className="m-0 text-[15px] font-bold text-[#b9c1da]">Tapa dura · envío incluido</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">{PRICE_HARDCOVER}</p>
              </div>
              <ul className="m-0 grid list-none gap-2.5 p-0 text-[16px] text-[#e4e8f2]">
                {["Todo lo de la edición gratis", "Libro apaisado de tapa dura, con las doce ilustraciones a página completa", "Revisas cada página y no lo imprimimos hasta que nos lo digas", "Te lo enviamos a casa (Península y Baleares) y tienes el PDF al momento"].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Icon.check size={20} className="mt-0.5 shrink-0 text-star" />
                    {x}
                  </li>
                ))}
              </ul>
              {open && hardcoverStatus && <p className="m-0 text-sm text-moon-soft">{hardcoverStatus}</p>}
              <Cta open={open} className="btn-primary mt-auto w-full">
                Crear su cuento
              </Cta>
            </div>

            <div className="flex flex-col gap-5 rounded-[28px] bg-card px-7 py-8 shadow-[0_2px_0_#e6d8c1]">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink-soft">Ilustrado · PDF</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">{PRICE_ILLUSTRATED}</p>
              </div>
              <ul className="m-0 grid list-none gap-2.5 p-0 text-[16px]">
                {["Las doce páginas ilustradas con sus personajes", "Si una ilustración no te convence, la repetimos una vez", "PDF en A4 apaisado: imprímelo en casa o en una copistería"].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Icon.check size={20} className="mt-0.5 shrink-0 text-accent" />
                    {x}
                  </li>
                ))}
              </ul>
              {open && illustratedStatus && <p className="m-0 text-sm text-ink-soft">{illustratedStatus}</p>}
              <Cta open={open} className="btn-ghost mt-auto w-full">
                Crear su cuento
              </Cta>
            </div>
          </div>
          <p className="m-0 mt-5 text-center text-sm text-ink-soft">Precios con IVA incluido.</p>
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-6 px-4 pt-20 pb-16 sm:px-6 md:pt-24">
        <h2 className="display m-0 mb-8 text-center text-[34px] sm:text-[48px]">Preguntas</h2>
        <div className="grid gap-3">
          {FAQ.map((f, i) => (
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
        <p className="mt-6 text-center text-sm text-ink-soft">
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
      </section>

      {/* Cierre */}
      <section id="pronto" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
        <div className="relative grid justify-items-center gap-4 overflow-hidden rounded-[32px] bg-night px-6 py-14 text-center text-moon sm:rounded-[36px] sm:py-18">
          <Moon className="absolute top-6 right-6 sm:top-9 sm:right-auto sm:left-[8%]" size={52} />
          <Sparkle className="twinkle absolute top-[30%] right-[12%]" size={18} />
          <Sparkle className="twinkle-slow absolute bottom-[22%] left-[16%]" size={12} color="var(--moon)" />
          {open ? (
            <>
              <h2 className="display m-0 max-w-[18ch] text-[34px] sm:text-[58px]">
                ¿Qué historia le vas a contar <span className="text-star">esta noche?</span>
              </h2>
              <p className="m-0 max-w-[44ch] text-lg text-moon-soft">Una frase, su nombre y unos rasgos. Lo demás lo hacemos nosotros.</p>
              <Link href="/crear" className="btn-primary btn-lg mt-2">
                Crear su cuento
              </Link>
              <span className="hand text-[19px] text-star">el cuento escrito, gratis</span>
            </>
          ) : (
            <>
              <h2 className="display m-0 max-w-[18ch] text-[34px] sm:text-[58px]">
                Abrimos <span className="text-star">muy pronto.</span>
              </h2>
              <p className="m-0 max-w-[44ch] text-lg text-moon-soft">Estamos preparando los primeros libros. Si tienes alguna pregunta, escríbenos.</p>
              <a href={`mailto:${contact}`} className="btn-primary btn-lg mt-2" data-testid="pronto-contact">
                {contact}
              </a>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

/** Botón de una edición: a /crear con la app abierta; con ella cerrada, «Muy pronto» sin enlace. */
function Cta({ open, className, children }: { open: boolean; className: string; children: React.ReactNode }) {
  return open ? (
    <Link href="/crear" className={className}>
      {children}
    </Link>
  ) : (
    <span className={`${className} cursor-default opacity-60`} aria-disabled="true">
      Muy pronto
    </span>
  );
}

/** Paso 1 dibujado: la idea a medio escribir. */
function IdeaCard() {
  return (
    <div className="w-full max-w-[290px] -rotate-[1.5deg] rounded-[18px] bg-card p-4 shadow-[0_18px_36px_-22px_rgba(35,32,54,0.5)]">
      <p className="m-0 mb-2 text-[12px] font-bold tracking-[0.08em] text-mute uppercase">¿De qué va?</p>
      <p className="story m-0 text-[17px] leading-snug">
        Vera construye un cohete con una caja de cartón
        <span className="ml-0.5 inline-block h-[18px] w-0.5 translate-y-[3px] bg-accent" />
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft">Su cumpleaños</span>
        <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-paper">Viaje a la Luna</span>
        <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft">Navidad</span>
      </div>
    </div>
  );
}

/** Paso 2 dibujado: la hoja de personajes pegada con cinta. */
function SheetCard() {
  return (
    <div className="relative w-full max-w-[300px] rotate-[1.5deg] rounded-md bg-white p-2 shadow-[0_18px_36px_-22px_rgba(35,32,54,0.55)]">
      <img src="/muestra/hoja-vera.webp" alt="Así será Vera en el libro, con su perro Toby: varias poses y caras" width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full rounded-sm object-cover" />
      <span aria-hidden className="absolute -top-2.5 left-6 h-[22px] w-16 -rotate-6 bg-star/55" />
      <span aria-hidden className="absolute -top-2 right-7 h-[22px] w-14 rotate-[5deg] bg-star/55" />
    </div>
  );
}

/** Paso 3 dibujado: el libro abierto, con la ilustración a la izquierda y el texto a la derecha. */
function PagesCard() {
  return (
    <div className="grid w-full max-w-[330px] -rotate-2 grid-cols-2 overflow-hidden rounded-[5px] bg-[#fbf6ec] shadow-[3px_3px_0_#eaddc6,0_18px_36px_-18px_rgba(35,32,54,0.6)]">
      <img src={muestraImage(9)} alt="" width={1400} height={939} loading="lazy" className="block aspect-[4/3] h-full w-full object-cover" />
      <p className="story m-0 line-clamp-7 self-center bg-gradient-to-r from-ink/10 to-transparent to-[14%] px-3 text-[8.5px] leading-normal text-[#3a3346]">{MUESTRA.pages[8]}</p>
    </div>
  );
}
