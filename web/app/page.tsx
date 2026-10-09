import Link from "next/link";
import { Scene } from "@/components/Scene";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { Avatar } from "@/components/Avatar";
import { DEFAULT_TRAITS } from "@/lib/traits";

const demoTraits = { ...DEFAULT_TRAITS, hair: { shape: "rizos" as const, color: "castano" as const }, outfit: "amarillo" as const };

export default function Landing() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-lg font-black tracking-tight">cuentos<span className="text-coral">.</span></span>
        <Link href="/crear" className="btn-primary px-5 py-2 text-sm">
          Crea su cuento
        </Link>
      </header>

      <section className="mx-auto grid max-w-5xl gap-8 px-5 pb-10 pt-6 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-3 inline-block rounded-full bg-sun/40 px-3 py-1 text-xs font-black uppercase tracking-wide text-ink-soft">
            Para una ocasión feliz
          </p>
          <h1 className="text-4xl font-black leading-[1.05] md:text-5xl">
            Un cuento que no existía hasta hoy. Con tu peque dentro.
          </h1>
          <p className="mt-4 text-lg text-ink-soft">
            Elige cómo es, elige quién le acompaña, y en un minuto tienes doce páginas listas para imprimir en casa. Sin
            fotos, sin registro, sin esperar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/crear" className="btn-primary">
              Empezar — es gratis
            </Link>
            <a href="#como" className="btn-ghost">
              Cómo funciona
            </a>
          </div>
          <p className="mt-3 text-sm text-ink-soft">Hoy: el cuento de cumpleaños. Pronto: Navidad, primera bici, hermanito nuevo…</p>
          <p className="mt-2 text-sm">
            <Link href="/gratis" className="font-bold underline">
              Descarga gratis un cuento de ejemplo en PDF
            </Link>
          </p>
        </div>
        <div className="card overflow-hidden p-0">
          <Scene style={DEFAULT_PAINTED_STYLE} scene="mesa-tarta" traits={demoTraits} expression="sorpresa" companion={{ kind: "perro", name: "Toby" }} special="dinosaurios" age={5} className="w-full" />
          <p className="px-5 py-4 font-story text-[17px] leading-snug">
            Y en la mesa estaba la tarta. Enorme, con mucha nata y exactamente 5 velas encendidas, una por cada año de Lucas.
          </p>
        </div>
      </section>

      <section id="como" className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="text-2xl font-black">Tres pantallas y a imprimir</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Step n={1} title="Quién">
            Su nombre, su edad y un avatar que se le parece: pelo, piel, ojos, gafas, jersey. Sin fotos.
          </Step>
          <Step n={2} title="Su mundo">
            Quién le acompaña (su perro, la abuela, su hermana…) y qué le vuelve loco: dinosaurios, chocolate, estrellas.
          </Step>
          <Step n={3} title="Imprimir">
            Lees las doce páginas, retocas lo que quieras y descargas el PDF. En casa, en A4, en cinco minutos.
          </Step>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="card grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-black">Luego, si quieres, ilustrado y en tapa dura</h2>
            <p className="mt-2 text-ink-soft">
              La versión gratuita es el cuento completo en nuestro estilo clásico. La edición ilustrada y la tapa dura llegan
              en las próximas semanas; si dejas tu email al descargar, te avisamos.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Avatar traits={demoTraits} expression="feliz" size={90} />
            <Avatar traits={{ ...demoTraits, hair: { shape: "trenzas", color: "negro" }, skin: "morena", outfit: "lila" }} expression="risa" size={90} />
            <Avatar traits={{ ...demoTraits, hair: { shape: "corto", color: "rubio" }, glasses: "redondas", outfit: "azul" }} expression="curioso" size={90} />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-5 py-10 text-sm text-ink-soft">
        <p>
          Mientras lo creas, el cuento se queda en tu navegador. No subimos fotos ni pedimos registro. Para descargar en PDF
          pedimos un email y guardamos el cuento 30 días para que puedas recuperarlo con un enlace; solo te escribimos si lo
          aceptas.
        </p>
      </footer>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-black text-white">{n}</div>
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-1 text-ink-soft">{children}</p>
    </div>
  );
}
