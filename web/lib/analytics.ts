/**
 * Medición de uso con PostHog Cloud EU (NEXT_PUBLIC_POSTHOG_KEY), solo tras «Aceptar» en el aviso de cookies
 * (components/CookieConsent.tsx). Es la única herramienta de medición: Clarity se quitó el 21 oct (Álvaro).
 *
 * Reglas (docs/ESTADO.md, 21 oct):
 *   - El SDK no se descarga ni se inicia sin consentimiento: nada de cookies ni de eventos antes de «Aceptar».
 *   - Sin grabaciones de sesión (Álvaro, 21 oct): apagadas aquí, aunque se activen en el panel de PostHog.
 *   - Nunca se identifica a nadie (sin identify, sin email). Los eventos son anónimos.
 *   - Ningún evento lleva datos del niño ni del cuento: solo el paso, la edición y tiempos.
 *   - El parámetro `b` de /crear?b=… abre un libro: se enmascara en todas las URL que salen.
 *   - En /crear no se mandan clics automáticos: su texto puede ser el cuento.
 */
import type { BeforeSendFn, PostHog } from "posthog-js";

export const CONSENT_KEY = "cuentos:consent:analytics";
export type Consent = "accepted" | "rejected";

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(v: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* sin almacenamiento: la elección vale para esta visita */
  }
}

/** Identificador de proyecto de PostHog (público por diseño: viaja en el navegador). */
export function posthogKeyOk(key: string | undefined): key is string {
  return !!key && /^phc_[A-Za-z0-9_-]{16,80}$/.test(key);
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
export const POSTHOG_ENABLED = posthogKeyOk(POSTHOG_KEY);

/** Parámetros de URL que nunca deben salir: `b` abre un libro guardado sin más contraseña. */
const SECRET_PARAMS = ["b"];

/** Quita los parámetros secretos de una URL (absoluta o relativa). Exportada para los tests. */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value.includes("?")) return value;
  try {
    const u = new URL(value, "https://x.invalid");
    let changed = false;
    for (const p of SECRET_PARAMS) {
      if (u.searchParams.has(p)) {
        u.searchParams.set(p, "<MASKED>");
        changed = true;
      }
    }
    if (!changed) return value;
    return value.startsWith("http") ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return value;
  }
}

const URL_PROPS = ["$current_url", "$referrer", "$initial_referrer", "$initial_current_url", "$session_entry_url", "$prev_pageview_url"];

/** Última barrera antes de enviar: sin clics automáticos en /crear y sin `b` en ninguna URL. */
export const beforeSend: BeforeSendFn = (event) => {
  if (!event) return event;
  const props = event.properties ?? {};
  const path = typeof props.$pathname === "string" ? props.$pathname : "";
  if (event.event === "$autocapture" && (path === "/crear" || path.startsWith("/crear/"))) return null;
  for (const bag of [props, event.$set, event.$set_once, props.$set, props.$set_once]) {
    if (!bag || typeof bag !== "object") continue;
    const b = bag as Record<string, unknown>;
    for (const k of URL_PROPS) if (k in b) b[k] = scrubUrl(b[k]);
  }
  return event;
};

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
const pending: [string, Record<string, unknown>, boolean][] = [];

/** Descarga e inicia PostHog. Solo con consentimiento; se puede llamar varias veces. */
export function startPostHog(): Promise<void> {
  if (!POSTHOG_ENABLED || readConsent() !== "accepted") return Promise.resolve();
  if (loading) return loading;
  loading = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY!, {
      api_host: "https://eu.i.posthog.com",
      ui_host: "https://eu.posthog.com",
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      mask_personal_data_properties: true,
      custom_personal_data_properties: SECRET_PARAMS,
      disable_surveys: true,
      disable_session_recording: true,
      before_send: beforeSend,
    });
    posthog.register({ entorno: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local" });
    client = posthog;
    for (const [name, props, beacon] of pending.splice(0)) posthog.capture(name, props, beacon ? { transport: "sendBeacon" } : undefined);
  });
  return loading;
}

/**
 * Eventos del embudo. Nombres en castellano y propiedades sin datos personales (nada del niño, del cuento ni del email).
 * Este tipo es el catálogo: si añades uno, va aquí.
 */
export type AnalyticsEvent =
  | { name: "crear_paso"; props: { paso: number } }
  | { name: "cuento_escrito"; props: { segundos: number } }
  | { name: "cuento_error"; props: { estado: number } }
  | { name: "libro_empezado"; props?: undefined }
  | { name: "personajes_aprobados"; props?: undefined }
  | { name: "pago_iniciado"; props: { edicion: string } }
  | { name: "pago_confirmado"; props: { edicion: string } };

/** Manda un evento si hay consentimiento. `beacon` para justo antes de salir de la página (Stripe). */
export function track(e: AnalyticsEvent, opts: { beacon?: boolean } = {}) {
  if (!POSTHOG_ENABLED || typeof window === "undefined" || readConsent() !== "accepted") return;
  const props = (e.props ?? {}) as Record<string, unknown>;
  if (client) {
    client.capture(e.name, props, opts.beacon ? { transport: "sendBeacon" } : undefined);
    return;
  }
  pending.push([e.name, props, !!opts.beacon]);
  void startPostHog();
}
