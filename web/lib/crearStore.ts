"use client";

import { useSyncExternalStore } from "react";
import { emptyFicha, normalizeFicha } from "./plan/ficha";
import type { Ficha, PlanRecord } from "./plan/types";

/**
 * Estado del flujo nuevo de /crear (B2): ficha, cuento escrito y libro. localStorage como fuente, leído con
 * useSyncExternalStore. En el servidor vale null.
 */
export type Step = 1 | 2 | 3 | 4 | 5;

export interface CrearState {
  v: 2;
  step: Step;
  ficha: Ficha;
  record?: PlanRecord;
  /** public_id del libro en el servidor (tras el email). */
  bookId?: string;
  email?: string;
  /** Ya pasó por las tres preguntas rápidas (contestó o las saltó): no se repiten en este libro. */
  quickAsked?: boolean;
  /** El libro está pagado: los pasos 1 y 2 se cierran y en el 3 y el 4 solo se cambian los textos (I2). */
  paid?: boolean;
  /** Cuándo se guardó por última vez (ms). */
  savedAt?: number;
  /**
   * El padre ya ha dicho si es niño o niña (o que prefiere no decirlo). La ficha guarda «neutro» por defecto, pero el
   * paso 1 no lo marca: sin elegir, el cuento salía con concordancias raras (mirada de usuario de la auditoría).
   */
  genderChosen?: boolean;
}

const KEY = "cuentos:crear:v2";
/**
 * La ficha, el cuento y el email no se quedan en el navegador para siempre (menores de la auditoría 26 oct): en un equipo
 * compartido los vería el siguiente. A los 30 días sin tocarlo, como el libro en el servidor, se olvida.
 */
const LOCAL_TTL_MS = 30 * 24 * 3600 * 1000;
let current: CrearState | null = null;
const listeners = new Set<() => void>();

function fresh(): CrearState {
  return { v: 2, step: 1, ficha: emptyFicha() };
}

/** Lee lo guardado (exportado para los tests). */
export function read(): CrearState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Partial<CrearState>;
    if (s?.v !== 2) return fresh();
    if (typeof s.savedAt === "number" && Date.now() - s.savedAt > LOCAL_TTL_MS) {
      localStorage.removeItem(KEY);
      return fresh();
    }
    // lo de antes de la caducidad no lleva fecha: cuenta desde hoy, y se apunta ya (si no, sin tocarlo, no caducaría)
    if (typeof s.savedAt !== "number") localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
    const step = [1, 2, 3, 4, 5].includes(Number(s.step)) ? (Number(s.step) as Step) : 1;
    const record = s.record?.plan?.pages?.length === 12 ? s.record : undefined;
    // lo guardado antes de este cambio: si ya pasó del paso 1, eligió (o aceptó) el género
    const genderChosen = s.genderChosen === true || step > 1 || !!record || !!s.bookId || undefined;
    return { v: 2, step, ficha: normalizeFicha(s.ficha), record, bookId: s.bookId, email: s.email, quickAsked: s.quickAsked === true || undefined, paid: (!!s.bookId && s.paid === true) || undefined, savedAt: typeof s.savedAt === "number" ? s.savedAt : undefined, genderChosen };
  } catch {
    return fresh();
  }
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = read();
      emit();
    }
    // lo guardado aparte también se mira en las otras pestañas (revisión independiente)
    if (e.key === ASIDE_KEY || e.key === null) {
      asidesCurrent = undefined;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): CrearState {
  if (!current) current = read();
  return current;
}

export function getCrear(): CrearState {
  return getSnapshot();
}

export function setCrear(next: CrearState | ((s: CrearState) => CrearState)) {
  const prev = getSnapshot();
  current = typeof next === "function" ? next(prev) : next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...current, savedAt: Date.now() }));
  } catch {
    // sin almacenamiento: el estado vive solo en memoria
  }
  emit();
}

export function resetCrear() {
  setCrear(fresh());
}

export function useCrear(): CrearState | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Lo que había en el navegador cuando se abre el enlace de otro libro (mirada de usuario de la auditoría: abrir el enlace
 * del libro de Lucas sustituía sin aviso el cuento de Martina, aún sin email). Se guarda aparte, en una lista, y /crear
 * ofrece volver. Entra un cuento a medias y también un libro ya empezado: tiene su enlace, pero así no depende del email
 * (revisión independiente). Con un libro se vuelve por su enlace, para traerlo como esté en el servidor.
 */
const ASIDE_KEY = "cuentos:crear:v2:aparte";
/** Como mucho, cuántos se guardan aparte; al pasarse, se va el más antiguo. */
export const ASIDE_MAX = 5;

/** ¿Hay trabajo que se perdería? Un cuento sin libro en el servidor con algo escrito. */
export function unsavedWork(s: CrearState): boolean {
  return !s.bookId && (!!s.record || !!s.ficha.idea.trim() || !!s.ficha.hero.name.trim());
}

/** ¿Merece guardarse aparte? Un cuento a medias o un libro empezado. */
export function worthKeeping(s: CrearState): boolean {
  return unsavedWork(s) || !!s.bookId;
}

/** ¿Es el mismo cuento? Un libro, por su id; uno a medias, por lo escrito. */
export function sameDraft(a: CrearState, b: CrearState): boolean {
  if (a.bookId || b.bookId) return a.bookId === b.bookId;
  return JSON.stringify(a.ficha) === JSON.stringify(b.ficha) && JSON.stringify(a.record?.plan ?? null) === JSON.stringify(b.record?.plan ?? null);
}

function normalizeAside(x: unknown): CrearState | null {
  const s = x as Partial<CrearState> | null;
  if (!s || s.v !== 2 || typeof s.savedAt !== "number" || Date.now() - s.savedAt > LOCAL_TTL_MS) return null;
  const step = [1, 2, 3, 4, 5].includes(Number(s.step)) ? (Number(s.step) as Step) : 1;
  const record = s.record?.plan?.pages?.length === 12 ? s.record : undefined;
  const bookId = typeof s.bookId === "string" && /^[a-z0-9]{8,16}$/.test(s.bookId) ? s.bookId : undefined;
  const out: CrearState = { v: 2, step, ficha: normalizeFicha(s.ficha), record, bookId, email: s.email, quickAsked: s.quickAsked === true || undefined, paid: (!!bookId && s.paid === true) || undefined, savedAt: s.savedAt, genderChosen: s.genderChosen === true || step > 1 || undefined };
  return worthKeeping(out) ? out : null;
}

/** Lo guardado aparte, del más nuevo al más antiguo (sin lo caducado: 30 días, como el principal). */
export function readAsides(): CrearState[] {
  try {
    const raw = localStorage.getItem(ASIDE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const all = Array.isArray(parsed) ? parsed : [parsed];
    const list = all.map(normalizeAside).filter((x): x is CrearState => !!x);
    if (list.length !== all.length) writeAsides(list);
    return list;
  } catch {
    return [];
  }
}

function writeAsides(list: CrearState[]): void {
  try {
    if (list.length) localStorage.setItem(ASIDE_KEY, JSON.stringify(list));
    else localStorage.removeItem(ASIDE_KEY);
  } catch {
    // sin almacenamiento: no se puede guardar aparte
  }
}

/** Lo guardado aparte, leído una vez y luego al cambiar (undefined: sin leer todavía). */
let asidesCurrent: CrearState[] | undefined;

function changedAsides(list: CrearState[]) {
  writeAsides(list);
  asidesCurrent = undefined;
  emit();
}

/** Guarda aparte (el primero de la lista; si ya estaba, sube). */
export function addAside(s: CrearState): void {
  if (!worthKeeping(s)) return;
  const list = readAsides().filter((x) => !sameDraft(x, s));
  changedAsides([{ ...s, savedAt: Date.now() }, ...list].slice(0, ASIDE_MAX));
}

export function removeAside(s: CrearState): void {
  changedAsides(readAsides().filter((x) => !sameDraft(x, s)));
}

function getAsidesSnapshot(): CrearState[] {
  if (asidesCurrent === undefined) asidesCurrent = readAsides();
  return asidesCurrent;
}

const NO_ASIDES: CrearState[] = [];

/** Lo guardado aparte, para pintarlo (nada en el servidor). */
export function useAsides(): CrearState[] {
  return useSyncExternalStore(subscribe, getAsidesSnapshot, () => NO_ASIDES);
}
