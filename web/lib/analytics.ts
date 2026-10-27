/**
 * Medición de uso con PostHog Cloud EU (NEXT_PUBLIC_POSTHOG_KEY), solo tras «Aceptar» en el aviso de cookies
 * (components/CookieConsent.tsx). Es la única herramienta de medición: Clarity se quitó el 21 oct (Álvaro).
 *
 * Reglas (docs/ESTADO.md, 21 oct):
 *   - El SDK no se descarga ni se inicia sin consentimiento: nada de cookies ni de eventos antes de «Aceptar».
 *   - Sin grabaciones de sesión (Álvaro, 21 oct): apagadas aquí, aunque se activen en el panel de PostHog.
 *   - Nunca se identifica a nadie (sin identify, sin email). Los eventos son anónimos.
 *   - Ningún evento lleva datos del niño ni del cuento: solo el paso, la edición y tiempos.
 *   - El parámetro `b` de /crear?b=… abre un libro, y el `t` de /baja?t=… da de baja de las novedades: se enmascaran en
 *     todas las URL que salen.
 *   - Sin clics automáticos en ningún sitio (autocapture, rabietas, clics muertos): su texto puede ser el nombre del
 *     niño o el enlace del libro. Tampoco heatmaps, excepciones, web vitals ni extensiones descargadas: todo apagado
 *     aquí, porque si no lo decide el panel de PostHog (25 oct).
 *   - El consentimiento se puede retirar desde el pie («Cookies»): se para PostHog y se borra lo que guardó.
 */
import type { BeforeSendFn, PostHog } from "posthog-js";

/**
 * v2 (25 oct): la clave anterior era la del aviso de Clarity. Quien aceptó aquel aviso no aceptó PostHog, así que se
 * vuelve a preguntar. La elección caduca a los 24 meses (recomendación de la AEPD).
 */
export const CONSENT_KEY = "cuentos:consent:analytics:v2";
const OLD_CONSENT_KEY = "cuentos:consent:analytics";
export const CONSENT_MAX_AGE_MS = 730 * 24 * 3600 * 1000;
export type Consent = "accepted" | "rejected";

/** Si el navegador no deja guardar, la elección vale para esta visita. */
let memoryChoice: Consent | null = null;

/** Lee un valor guardado («accepted|2026-10-25T…»). Exportada para los tests. */
export function parseConsent(raw: string | null, now = Date.now()): Consent | null {
  if (!raw) return null;
  const [v, at] = raw.split("|");
  if (v !== "accepted" && v !== "rejected") return null;
  const t = Date.parse(at ?? "");
  if (!Number.isFinite(t) || now - t > CONSENT_MAX_AGE_MS) return null;
  return v;
}

export function readConsent(): Consent | null {
  try {
    if (localStorage.getItem(OLD_CONSENT_KEY) !== null) localStorage.removeItem(OLD_CONSENT_KEY);
    return parseConsent(localStorage.getItem(CONSENT_KEY)) ?? memoryChoice;
  } catch {
    return memoryChoice;
  }
}

export function saveConsent(v: Consent) {
  memoryChoice = v;
  try {
    localStorage.setItem(CONSENT_KEY, `${v}|${new Date().toISOString()}`);
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

/**
 * Parámetros de URL que nunca deben salir: `b` abre un libro guardado sin más contraseña y `t` es la llave de baja de las
 * novedades (/baja?t=…).
 */
const SECRET_PARAMS = ["b", "t"];

/** Rutas con una llave dentro: `/seguimiento/<id del pedido>` abre el pedido (título, portada y población). */
const SECRET_PATH = /\/seguimiento\/[^/?#\s]+/g;

/** Quita los parámetros y las rutas secretas de una URL (absoluta o relativa). Exportada para los tests. */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const path = value.replace(SECRET_PATH, "/seguimiento/:id");
  if (!path.includes("?")) return path;
  try {
    const u = new URL(path, "https://x.invalid");
    let changed = false;
    for (const p of SECRET_PARAMS) {
      if (u.searchParams.has(p)) {
        u.searchParams.set(p, "<MASKED>");
        changed = true;
      }
    }
    if (!changed) return path;
    return path.startsWith("http") ? u.toString().replace(/%3Aid/g, ":id") : `${u.pathname.replace(/%3Aid/g, ":id")}${u.search}${u.hash}`;
  } catch {
    return path;
  }
}

/**
 * Toda propiedad que acabe en «url», «referrer» o «pathname» (auditoría 26 oct, I22). Antes eran seis nombres fijos, y
 * el `b` salía en `$session_entry_referrer` y el id del pedido en `$pathname`.
 */
const isUrlProp = (key: string) => /(url|referrer|pathname)$/i.test(key);

/** Propiedades que solo traen los eventos de clic (texto y enlaces de la página). */
const ELEMENT_PROPS = ["$elements", "$elements_chain", "$el_text", "$element_selectors"];

/**
 * Última barrera antes de enviar: ningún evento con elementos de la página (clics automáticos, rabietas, clics
 * muertos, heatmaps), aunque el panel de PostHog los encienda, y sin `b` ni `t` en ninguna URL.
 */
export const beforeSend: BeforeSendFn = (event) => {
  if (!event) return event;
  const props = event.properties ?? {};
  if (event.event === "$autocapture" || event.event === "$rageclick" || event.event === "$dead_click" || event.event === "$$heatmap") return null;
  if (ELEMENT_PROPS.some((k) => k in props)) return null;
  for (const bag of [props, event.$set, event.$set_once, props.$set, props.$set_once]) {
    if (!bag || typeof bag !== "object") continue;
    const b = bag as Record<string, unknown>;
    for (const k of Object.keys(b)) if (isUrlProp(k)) b[k] = scrubUrl(b[k]);
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
      // todo lo que no sean páginas vistas y los eventos propios, apagado aquí (el panel no lo puede encender)
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_surveys: true,
      disable_session_recording: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      // sin flags: su petición no pasa por before_send y llevaba el referrer con el `b` (I22)
      advanced_disable_flags: true,
      before_send: beforeSend,
    });
    posthog.register({ entorno: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local" });
    client = posthog;
    for (const [name, props, beacon] of pending.splice(0)) posthog.capture(name, props, beacon ? { transport: "sendBeacon" } : undefined);
  });
  return loading;
}

/** Borra lo que PostHog guarda en este navegador (cookies y claves `ph_`/`__ph`). */
export function clearPostHogStorage() {
  try {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (!name.startsWith("ph_") && !name.startsWith("__ph")) continue;
      const host = location.hostname;
      const root = host.split(".").slice(-2).join(".");
      for (const domain of ["", `; domain=${host}`, `; domain=.${root}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  } catch {
    /* sin cookies */
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ph_") || k.startsWith("__ph")) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("ph_") || k.startsWith("__ph")) sessionStorage.removeItem(k);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Retirar el consentimiento: PostHog deja de enviar al momento, se borra lo que guardó y, si ya estaba cargado, se
 * recarga la página para que el SDK no siga en memoria (sin consentimiento ya no se vuelve a cargar).
 */
export function withdrawConsent() {
  saveConsent("rejected");
  pending.length = 0;
  const wasLoaded = !!client;
  if (client) client.opt_out_capturing();
  clearPostHogStorage();
  if (wasLoaded) location.reload();
}

/** Abre el aviso de cookies otra vez (enlace «Cookies» del pie). */
export const OPEN_CONSENT_EVENT = "cuentos:abrir-cookies";

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
