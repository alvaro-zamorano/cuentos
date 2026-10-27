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
}

const KEY = "cuentos:crear:v2";
let current: CrearState | null = null;
const listeners = new Set<() => void>();

function fresh(): CrearState {
  return { v: 2, step: 1, ficha: emptyFicha() };
}

function read(): CrearState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Partial<CrearState>;
    if (s?.v !== 2) return fresh();
    const step = [1, 2, 3, 4, 5].includes(Number(s.step)) ? (Number(s.step) as Step) : 1;
    return { v: 2, step, ficha: normalizeFicha(s.ficha), record: s.record?.plan?.pages?.length === 12 ? s.record : undefined, bookId: s.bookId, email: s.email, quickAsked: s.quickAsked === true || undefined, paid: (!!s.bookId && s.paid === true) || undefined };
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
    localStorage.setItem(KEY, JSON.stringify(current));
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
