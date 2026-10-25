/* eslint-disable @next/next/no-img-element -- la portada viene firmada de nuestro bucket y caduca en una hora */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Icon, Sparkle } from "@/components/brand";
import { ContactEmail } from "@/components/LegalPage";
import { SiteHeader } from "@/components/SiteHeader";
import { trackingView, type TrackingView } from "@/lib/book/print";
import { generationContext } from "@/lib/generation/server";
import { titular } from "@/lib/legal";
import { printDeps } from "@/lib/print/server";
import { etaLabel, TRACK_COPY, trackSteps } from "@/lib/print/tracking";
import { siteUrl } from "@/lib/site";

/** Página que bloquea hasta tener el pedido: así un id que no existe da 404 de verdad (cacheComponents está activo). */
export const instant = false;

export const metadata: Metadata = {
  title: "Seguimiento del pedido",
  robots: { index: false, follow: false },
};

/** Ejemplo para revisar la página en las previews: /seguimiento/ejemplo (en producción da 404). */
const EXAMPLE: TrackingView = {
  ok: true,
  title: "Olivia y su familia",
  status: "shipped",
  city: "Madrid",
  paidAt: "2026-10-24T14:40:46Z",
  sentAt: "2026-10-24T20:16:59Z",
  info: {
    method: "Envío estándar",
    etaFrom: "2026-10-29",
    etaTo: "2026-10-31",
    trackingCode: "PQ4B7C0012345670128001X",
    steps: { sent: "2026-10-24T20:16:59Z", in_production: "2026-10-26T08:12:00Z", shipped: "2026-10-28T15:40:00Z" },
  },
  trackingUrl: "https://example.com/seguimiento",
  coverUrl: null,
  simulated: false,
};

async function origin(): Promise<string> {
  const site = siteUrl();
  if (site) return site;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
}

async function load(id: string): Promise<TrackingView | null> {
  if (id === "ejemplo") return process.env.VERCEL_ENV === "production" ? null : EXAMPLE;
  const ctx = generationContext();
  if ("error" in ctx) return null;
  try {
    const v = await trackingView(ctx.store, id, printDeps(await origin()));
    return v.ok ? v : null;
  } catch (e) {
    console.error("[seguimiento]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return null;
  }
}

export default async function Seguimiento({ params }: PageProps<"/seguimiento/[id]">) {
  const { id } = await params;
  const v = await load(id);
  if (!v) notFound();
  const copy = TRACK_COPY[v.status];
  const eta = etaLabel(v.info.etaFrom, v.info.etaTo);
  const arrived = v.status === "delivered";
  const stopped = v.status === "returned" || v.status === "canceled";
  const steps = trackSteps(v.status, v.paidAt, v.sentAt, v.info);
  const email = titular().email;

  return (
    <main className="flex-1 bg-paper">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 pt-4 sm:px-6" data-testid="tracking" data-status={v.status}>
        {v.simulated && (
          <p className="notice" role="note">
            Imprenta simulada en esta prueba: no se imprime ni se envía nada.
          </p>
        )}

        <section className="grid gap-6 rounded-[28px] bg-card p-6 shadow-[0_2px_0_#e6d8c1,0_24px_40px_-32px_rgba(35,32,54,0.5)] sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:items-center sm:p-8">
          <div className="relative">
            {v.coverUrl ? (
              <img src={v.coverUrl} alt={`Portada de «${v.title}»`} className="block aspect-[4/3] w-full rounded-[14px] object-cover shadow-[0_18px_30px_-18px_rgba(35,32,54,0.55)]" />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center rounded-[14px] bg-night text-moon shadow-[0_18px_30px_-18px_rgba(35,32,54,0.55)]">
                <span className="grid justify-items-center gap-2 px-4 text-center">
                  <Sparkle size={18} />
                  <span className="font-display text-[20px] italic leading-tight">{v.title}</span>
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-mute">Tu pedido · libro de tapa dura</p>
            <h1 className="display text-[30px] leading-tight sm:text-[36px]">{v.title}</h1>
            <p className="mt-2 font-display text-[22px] text-accent-deep">{copy.title}</p>
            <p className="text-ink-soft">{copy.text}</p>
            {eta && !arrived && !stopped && (
              <p className="mt-2 rounded-[14px] bg-paper-deep px-4 py-3 text-ink" data-testid="tracking-eta">
                Llega <strong>{eta}</strong>
                {v.city ? <> a {v.city}</> : null}, según la imprenta.
              </p>
            )}
          </div>
        </section>

        {!stopped && (
          <section className="rounded-[28px] bg-card p-6 sm:p-8" aria-label="Cómo va el pedido">
            <ol className="grid gap-0">
              {steps.map((s, i) => (
                <li key={s.key} className="grid grid-cols-[28px_1fr] gap-x-4" data-step={s.key} data-state={s.state}>
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full ${
                        s.state === "done" ? "bg-sage text-sage-ink" : s.state === "current" ? "bg-accent text-white ring-4 ring-peach" : "border-2 border-line bg-card"
                      }`}
                    >
                      {s.state === "done" ? <Icon.check size={14} /> : s.state === "current" ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                    {i < steps.length - 1 && <span className={`w-[2px] flex-1 ${s.state === "done" ? "bg-sage" : "bg-line"}`} style={{ minHeight: 28 }} />}
                  </div>
                  <div className="pb-6">
                    <p className={`font-semibold ${s.state === "todo" ? "text-mute" : "text-ink"}`}>{s.label}</p>
                    {s.date && <p className="text-sm text-ink-soft">{s.date}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-4 rounded-[28px] bg-card p-6 sm:p-8" aria-label="Envío">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peach text-ink">
              <Icon.bag size={22} />
            </span>
            <div className="grid gap-1">
              <h2 className="display text-[22px]">El envío</h2>
              <p className="text-ink-soft">
                {v.city ? <>A {v.city}. </> : null}
                {v.info.method ? <>{v.info.method}.</> : <>Lo lleva el transportista de la imprenta.</>}
              </p>
            </div>
          </div>
          {v.info.trackingCode || v.trackingUrl ? (
            <div className="grid gap-3" data-testid="tracking-carrier">
              {v.info.trackingCode && (
                <p className="text-ink">
                  Número de seguimiento: <span className="font-mono text-[15px] tracking-wide break-all">{v.info.trackingCode}</span>
                </p>
              )}
              {v.trackingUrl && (
                <a className="btn-primary justify-self-start" href={v.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Seguir en el transportista
                  <Icon.arrow size={18} />
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">El número de seguimiento aparece aquí cuando el libro salga de la imprenta.</p>
          )}
        </section>

        <p className="px-2 text-sm text-ink-soft">
          ¿Algo no va bien? Escríbenos a <ContactEmail value={email} /> y lo miramos.
        </p>
      </div>
    </main>
  );
}
