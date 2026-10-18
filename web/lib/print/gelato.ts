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
 * pageCount que pide Gelato: «todas las páginas, también la cubierta delantera y la trasera». Cada tapa cuenta como dos
 * (exterior e interior), como en el ejemplo de su API de cubiertas (30 interiores → 34). GELATO_PAGE_COUNT lo cambia si
 * la muestra dice otra cosa.
 */
export function gelatoPageCount(env: Env = process.env): number {
  const v = Number(env.GELATO_PAGE_COUNT);
  return Number.isInteger(v) && v > 0 ? v : PRINT_INNER_PAGES + 4;
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
 * El productUid del libro de tapa dura de 20×20: GELATO_PRODUCT_UID, o se busca en el catálogo de fotolibros (una vez por
 * proceso). La búsqueda elige tapa dura, 200×200 mm u 8×8", mate; si no encuentra, null.
 */
export async function resolveProductUid(env: Env = process.env, f: Fetch = fetch): Promise<string | null> {
  const fixed = env.GELATO_PRODUCT_UID?.trim();
  if (fixed) return fixed;
  if (productCache) return productCache;
  const found = (await findPhotobookProducts(env, f)).find(isSquareHardcover) ?? null;
  if (found) productCache = found;
  return found;
}

export function isSquareHardcover(uid: string): boolean {
  return /hardcover/.test(uid) && /(200x200-mm|8x8-inch)/.test(uid) && !/layflat/.test(uid);
}

/** productUid de los fotolibros del catálogo (para elegir el de 20×20; también lo usa /api/dev). */
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
 * Cubierta estimada para un 20×20 (sin clave, o si la API falla): 15 mm de solapa que se dobla, 7 mm de bisagra a cada
 * lado del lomo y 6 mm de lomo. La real la da la API de cubiertas de Gelato según el número de páginas.
 */
export function estimatedCover(size: PrintSize = { trimWidth: 200, trimHeight: 200, bleed: BLEED_MM }): CoverGeometry {
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
  return { trimWidth: w.value, trimHeight: h.value, bleed: BLEED_MM };
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
}

interface RawOrder {
  id?: string;
  orderReferenceId?: string;
  fulfillmentStatus?: string;
  shipment?: { packages?: { trackingUrl?: string; trackingCode?: string }[] } | null;
  items?: { fulfillments?: { trackingUrl?: string }[] }[];
}

export function parseOrder(o: RawOrder): GelatoOrder | null {
  if (!o?.id) return null;
  const tracking = o.shipment?.packages?.find((p) => p.trackingUrl)?.trackingUrl ?? o.items?.flatMap((i) => i.fulfillments ?? []).find((x) => x.trackingUrl)?.trackingUrl ?? null;
  return { id: o.id, status: o.fulfillmentStatus ?? "created", orderReferenceId: o.orderReferenceId ?? null, trackingUrl: tracking && /^https:\/\//.test(tracking) ? tracking : null };
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
