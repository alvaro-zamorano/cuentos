/**
 * Imprenta (B8, D7): API de Gelato sin SDK. Crea el pedido del libro de tapa dura con el PDF de imprenta, consulta su
 * estado y saca las medidas de la cubierta. Sin GELATO_API_KEY no hay imprenta real: fuera de producción se simula
 * (NEXT_PUBLIC_DRY_RUN_PAYMENT=1) y en producción la tapa dura no se ofrece. Sin `server-only` para los tests; solo
 * lo importan rutas de servidor.
 *
 * Fuera de producción los pedidos se crean como borrador (orderType "draft": Gelato no los imprime ni los cobra) salvo
 * que GELATO_ORDER_TYPE=order. Así una clave real en la preview no imprime libros por error.
 *
 * Docs: dashboard.gelato.com/docs (orders v4, products v3, webhooks). Comprobado el 18 oct 2026.
 */
import type { PrintStatus, Shipping } from "./types";
import { splitName } from "./shipping";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

export type PrintMode = "gelato" | "dry-run" | "none";

export function printMode(env: Env = process.env): PrintMode {
  if (env.GELATO_API_KEY?.trim()) return "gelato";
  if (env.NEXT_PUBLIC_DRY_RUN_PAYMENT === "1" && env.VERCEL_ENV !== "production") return "dry-run";
  return "none";
}

export function gelatoOrderType(env: Env = process.env): "order" | "draft" {
  if (env.VERCEL_ENV === "production") return "order";
  return env.GELATO_ORDER_TYPE?.trim() === "order" ? "order" : "draft";
}

/** Páginas interiores del libro impreso (portadilla, personajes, dedicatoria, 12 dobles, fin, colofón y cortesía). */
export const PRINT_INNER_PAGES = 30;

/**
 * pageCount que pide Gelato: las páginas interiores (entre 30 y 200 en sus fotolibros); las 4 caras de las tapas las
 * suma Gelato. Comprobado el 20 oct con su API: la de cubiertas devuelve pagesCount = pageCount + 4 para cualquier valor
 * (30 → 34, 34 → 38), y su ayuda dice que la cifra «solo incluye las páginas interiores». Su documentación de la API
 * dice lo contrario, pero su propio ejemplo (piden 34, responden 38) va en este sentido. GELATO_PAGE_COUNT lo cambia.
 */
export function gelatoPageCount(env: Env = process.env): number {
  const v = Number(env.GELATO_PAGE_COUNT);
  return Number.isInteger(v) && v > 0 ? v : PRINT_INNER_PAGES;
}

/**
 * Método de envío que se pide a Gelato (24 oct, Álvaro): económico fijo para salir. Sin `shipmentMethodUid`, Gelato
 * elige el más barato; lo mandamos explícito para que no dependa de eso. GELATO_SHIPMENT_METHOD lo cambia («express» o
 * un uid de su API de presupuestos); el exprés como extra de pago queda para la campaña de Navidad.
 */
export function gelatoShipmentMethod(env: Env = process.env): string {
  const v = env.GELATO_SHIPMENT_METHOD?.trim();
  return v && /^[a-z0-9_,:-]{2,80}$/i.test(v) ? v : "normal";
}

const ORDER_API = "https://order.gelatoapis.com/v4";
const PRODUCT_API = "https://product.gelatoapis.com/v3";

async function call<T>(url: string, init: RequestInit, env: Env, f: Fetch): Promise<{ ok: true; json: T } | { ok: false; status: number; message: string }> {
  const key = env.GELATO_API_KEY?.trim();
  if (!key) return { ok: false, status: 0, message: "sin_clave" };
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { "content-type": "application/json", "X-API-KEY": key, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(25_000) });
  } catch {
    return { ok: false, status: 0, message: "red" };
  }
  const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !json) return { ok: false, status: res.status, message: String((json as { message?: string } | null)?.message ?? "").slice(0, 300) };
  return { ok: true, json };
}

/* ------------------------------ producto ------------------------------ */

let productCache: string | null = null;

/**
 * El productUid del libro de tapa dura apaisado: GELATO_PRODUCT_UID, o se busca en el catálogo de fotolibros (una vez por
 * proceso). La búsqueda elige tapa dura apaisada sin «layflat», la más parecida a 280×210 mm; si no encuentra, null.
 */
export async function resolveProductUid(env: Env = process.env, f: Fetch = fetch): Promise<string | null> {
  const fixed = env.GELATO_PRODUCT_UID?.trim();
  if (fixed) return fixed;
  if (productCache) return productCache;
  const found = pickLandscapeHardcover(await findPhotobookProducts(env, f));
  if (found) productCache = found;
  return found;
}

/**
 * Medidas en mm que lleva el productUid de Gelato, tal cual («…_pf_210x280-mm-8x11-inch_…» o «…_pf_8x11-inch-210x280-mm_…»).
 * Gelato escribe siempre la medida corta primero y marca la orientación al final: «_hor» apaisado, «_ver» vertical
 * (catálogo real, consultado el 20 oct con /api/health?deep=1).
 */
export function uidSizeMm(uid: string): { w: number; h: number } | null {
  const pf = uid.split("_pf_")[1];
  const m = pf ? /(\d+)x(\d+)-mm/.exec(pf) : null;
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** Orientación del producto: «_hor» o «_ver» al final (o antes de «_custom»); sin marca, por las medidas. */
export function uidLandscape(uid: string): boolean {
  if (/_hor(_|$)/.test(uid)) return true;
  if (/_ver(_|$)/.test(uid)) return false;
  const s = uidSizeMm(uid);
  return !!s && s.w > s.h;
}

/** Ancho y alto de la página apaisada (el lado largo es el ancho), o null si no es apaisado. */
export function landscapeSizeMm(uid: string): { w: number; h: number } | null {
  const s = uidSizeMm(uid);
  if (!s || s.w === s.h || !uidLandscape(uid)) return null;
  return { w: Math.max(s.w, s.h), h: Math.min(s.w, s.h) };
}

/** Tapa dura apaisada, sin «layflat» ni formatos «custom». */
export function isLandscapeHardcover(uid: string): boolean {
  return /^photobooks-hardcover_/.test(uid) && !/layflat|_custom/.test(uid) && !!landscapeSizeMm(uid);
}

/**
 * De una lista de productUid, la tapa dura apaisada más cercana a 280×210 mm (D5 bis, 18 oct). A igual medida, la que
 * Gelato nombra en milímetros primero (la variante europea; la otra empieza por pulgadas).
 */
export function pickLandscapeHardcover(uids: string[]): string | null {
  const dist = (u: string) => {
    const s = landscapeSizeMm(u)!;
    return Math.abs(s.w - DEFAULT_PRINT_SIZE.trimWidth) + Math.abs(s.h - DEFAULT_PRINT_SIZE.trimHeight);
  };
  const mmFirst = (u: string) => (/_pf_\d+x\d+-mm/.test(u) ? 0 : 1);
  return uids.filter(isLandscapeHardcover).sort((a, b) => dist(a) - dist(b) || mmFirst(a) - mmFirst(b))[0] ?? null;
}

/** productUid de los fotolibros del catálogo (para elegir el libro apaisado; también lo usa /api/dev). */
export async function findPhotobookProducts(env: Env = process.env, f: Fetch = fetch): Promise<string[]> {
  const cats = await call<{ data?: { catalogUid?: string }[] }>(`${PRODUCT_API}/catalogs`, { method: "GET" }, env, f);
  if (!cats.ok) return [];
  const uids = (cats.json.data ?? []).map((c) => c.catalogUid ?? "").filter((u) => /photo-?book/i.test(u));
  const out: string[] = [];
  for (const cat of uids) {
    for (let offset = 0; offset < 1000; offset += 100) {
      const r = await call<{ products?: { productUid?: string }[] }>(`${PRODUCT_API}/catalogs/${encodeURIComponent(cat)}/products:search`, { method: "POST", body: JSON.stringify({ limit: 100, offset }) }, env, f);
      if (!r.ok) break;
      const page = (r.json.products ?? []).map((p) => p.productUid ?? "").filter(Boolean);
      out.push(...page);
      if (page.length < 100) break;
    }
  }
  return out;
}

/* ------------------------------ medidas ------------------------------ */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Cubierta de tapa dura en mm: el pliego entero (con lo que se dobla) y dónde caen trasera, lomo y portada. */
export interface CoverGeometry {
  width: number;
  height: number;
  back: Rect;
  spine: Rect;
  front: Rect;
  source: "gelato" | "estimada";
}

/** Tamaño de la página interior (sin sangre), en mm. */
export interface PrintSize {
  trimWidth: number;
  trimHeight: number;
  bleed: number;
}

export const BLEED_MM = 4; // Gelato pide 4 mm de sangre en todos los lados

/**
 * Libro apaisado (D5 bis, 18 oct): 280×210 mm mientras la API no diga otra cosa. La medida buena la da productSize()
 * con el producto elegido; esta solo sirve para la simulación y la cubierta estimada.
 */
export const DEFAULT_PRINT_SIZE: PrintSize = { trimWidth: 280, trimHeight: 210, bleed: BLEED_MM };

/**
 * Cubierta estimada (sin clave, o si la API falla): 15 mm de solapa que se dobla, 7 mm de bisagra a cada
 * lado del lomo y 6 mm de lomo. La real la da la API de cubiertas de Gelato según el número de páginas.
 */
export function estimatedCover(size: PrintSize = DEFAULT_PRINT_SIZE): CoverGeometry {
  const wrap = 15;
  const joint = 7;
  const spine = 6;
  const back: Rect = { left: wrap, top: wrap, width: size.trimWidth, height: size.trimHeight };
  const spineRect: Rect = { left: wrap + size.trimWidth + joint, top: wrap, width: spine, height: size.trimHeight };
  const front: Rect = { left: spineRect.left + spine + joint, top: wrap, width: size.trimWidth, height: size.trimHeight };
  return { width: front.left + front.width + wrap, height: size.trimHeight + 2 * wrap, back, spine: spineRect, front, source: "estimada" };
}

const isRect = (v: unknown): v is Rect => !!v && typeof v === "object" && ["width", "height"].every((k) => typeof (v as Record<string, unknown>)[k] === "number");

/** Lee la respuesta de /cover-dimensions: el pliego es la unión de todas las áreas. */
export function coverFromApi(json: Record<string, unknown>): CoverGeometry | null {
  const rect = (k: string): Rect | null => {
    const v = json[k];
    if (!isRect(v)) return null;
    const r = v as Rect;
    return { left: Number(r.left ?? 0), top: Number(r.top ?? 0), width: r.width, height: r.height };
  };
  const front = rect("contentFrontSize");
  const back = rect("contentBackSize");
  const spine = rect("spineSize");
  if (!front || !back || !spine) return null;
  const all = Object.keys(json).map(rect).filter((r): r is Rect => !!r);
  const width = Math.max(...all.map((r) => r.left + r.width));
  const height = Math.max(...all.map((r) => r.top + r.height));
  if (!(width > 0 && height > 0)) return null;
  return { width, height, back, spine, front, source: "gelato" };
}

export async function coverGeometry(productUid: string, pageCount: number, env: Env = process.env, f: Fetch = fetch): Promise<CoverGeometry | null> {
  const r = await call<Record<string, unknown>>(`${PRODUCT_API}/products/${encodeURIComponent(productUid)}/cover-dimensions?pageCount=${pageCount}`, { method: "GET" }, env, f);
  return r.ok ? coverFromApi(r.json) : null;
}

/** Medidas de la página interior del producto (dimensions Width/Height en mm); null si no las da. */
export async function productSize(productUid: string, env: Env = process.env, f: Fetch = fetch): Promise<PrintSize | null> {
  const r = await call<{ dimensions?: Record<string, { value?: number; measureUnit?: string }> }>(`${PRODUCT_API}/products/${encodeURIComponent(productUid)}`, { method: "GET" }, env, f);
  if (!r.ok) return null;
  const d = r.json.dimensions ?? {};
  const w = d.Width ?? d.width;
  const h = d.Height ?? d.height;
  if (!w?.value || !h?.value || (w.measureUnit && w.measureUnit !== "mm")) return null;
  // Gelato puede dar las medidas del apaisado con el lado corto primero, como en el productUid: el ancho es el largo
  const [tw, th] = uidLandscape(productUid) ? [Math.max(w.value, h.value), Math.min(w.value, h.value)] : [w.value, h.value];
  return { trimWidth: tw, trimHeight: th, bleed: BLEED_MM };
}

/* ------------------------------ pedidos ------------------------------ */

export interface GelatoOrderInput {
  /** cuentos_orders.id: vuelve en los avisos de Gelato. */
  orderReferenceId: string;
  /** El id público del libro. */
  customerReferenceId: string;
  productUid: string;
  pageCount: number;
  fileUrl: string;
  shipping: Shipping;
  email: string;
  orderType: "order" | "draft";
  shipmentMethodUid?: string;
}

/** Cuerpo de POST /v4/orders (exportado para los tests). */
export function gelatoOrderBody(i: GelatoOrderInput): Record<string, unknown> {
  const { firstName, lastName } = splitName(i.shipping.name);
  return {
    orderType: i.orderType,
    orderReferenceId: i.orderReferenceId,
    customerReferenceId: i.customerReferenceId,
    currency: "EUR",
    items: [{ itemReferenceId: `${i.orderReferenceId}-1`, productUid: i.productUid, pageCount: i.pageCount, files: [{ type: "default", url: i.fileUrl }], quantity: 1 }],
    shippingAddress: {
      firstName,
      lastName,
      addressLine1: i.shipping.line1,
      ...(i.shipping.line2 ? { addressLine2: i.shipping.line2 } : {}),
      city: i.shipping.city,
      postCode: i.shipping.postcode,
      ...(i.shipping.province ? { state: i.shipping.province } : {}),
      country: i.shipping.country,
      email: i.email,
      ...(i.shipping.phone ? { phone: i.shipping.phone } : {}),
    },
    ...(i.shipmentMethodUid ? { shipmentMethodUid: i.shipmentMethodUid } : {}),
    metadata: [{ key: "book", value: i.customerReferenceId }],
  };
}

export interface GelatoOrder {
  id: string;
  status: string;
  orderReferenceId: string | null;
  trackingUrl: string | null;
  /** Número de seguimiento del transportista. */
  trackingCode: string | null;
  /** Nombre del método de envío que da Gelato (lo más parecido al transportista que da su API). */
  method: string | null;
  /** Entrega estimada, AAAA-MM-DD. */
  etaFrom: string | null;
  etaTo: string | null;
}

interface RawOrder {
  id?: string;
  orderReferenceId?: string;
  fulfillmentStatus?: string;
  shipment?: {
    shipmentMethodName?: string;
    minDeliveryDate?: string;
    maxDeliveryDate?: string;
    packages?: { trackingUrl?: string; trackingCode?: string }[];
  } | null;
  items?: { fulfillments?: { trackingUrl?: string }[] }[];
}

const day = (s: unknown): string | null => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const short = (s: unknown, max: number): string | null => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);

export function parseOrder(o: RawOrder): GelatoOrder | null {
  if (!o?.id) return null;
  const pkg = o.shipment?.packages?.find((p) => p.trackingUrl || p.trackingCode);
  const tracking = pkg?.trackingUrl ?? o.items?.flatMap((i) => i.fulfillments ?? []).find((x) => x.trackingUrl)?.trackingUrl ?? null;
  const code = short(pkg?.trackingCode, 60);
  return {
    id: o.id,
    status: o.fulfillmentStatus ?? "created",
    orderReferenceId: o.orderReferenceId ?? null,
    trackingUrl: tracking && /^https:\/\//.test(tracking) ? tracking : null,
    trackingCode: code && /^[A-Za-z0-9 _./-]+$/.test(code) ? code : null,
    method: short(o.shipment?.shipmentMethodName, 80),
    etaFrom: day(o.shipment?.minDeliveryDate),
    etaTo: day(o.shipment?.maxDeliveryDate),
  };
}

export async function createGelatoOrder(i: GelatoOrderInput, env: Env = process.env, f: Fetch = fetch): Promise<GelatoOrder | { error: string }> {
  const r = await call<RawOrder>(`${ORDER_API}/orders`, { method: "POST", body: JSON.stringify(gelatoOrderBody(i)) }, env, f);
  if (!r.ok) return { error: `gelato_${r.status}${r.message ? `: ${r.message}` : ""}` };
  return parseOrder(r.json) ?? { error: "gelato_respuesta" };
}

export async function getGelatoOrder(id: string, env: Env = process.env, f: Fetch = fetch): Promise<GelatoOrder | null> {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  const r = await call<RawOrder>(`${ORDER_API}/orders/${encodeURIComponent(id)}`, { method: "GET" }, env, f);
  return r.ok ? parseOrder(r.json) : null;
}

/** Estado de Gelato → el nuestro. Los intermedios (created, uploading, passed, printed…) cuentan como «en la imprenta». */
export function mapGelatoStatus(s: string): PrintStatus {
  switch (s) {
    case "in_production":
    case "printed":
      return "in_production";
    case "shipped":
    case "in_transit":
      return "shipped";
    case "delivered":
      return "delivered";
    case "returned":
      return "returned";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "sent";
  }
}

/** Orden de los estados para no ir hacia atrás si los avisos llegan desordenados. */
const RANK: Record<PrintStatus, number> = { awaiting_approval: 0, sending: 1, failed: 2, sent: 3, in_production: 4, shipped: 5, delivered: 6, returned: 7, canceled: 7 };

export function advances(from: PrintStatus | null, to: PrintStatus): boolean {
  if (!from) return true;
  if (to === "failed" || to === "canceled" || to === "returned") return from !== to;
  return RANK[to] > RANK[from];
}
