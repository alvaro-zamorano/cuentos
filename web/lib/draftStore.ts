"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_DRAFT, loadDraft, saveDraft } from "./story";
import { randomTraits } from "./traits";
import type { Draft } from "./types";

/**
 * Borrador compartido por /crear, /ilustrado y /libro: localStorage como fuente,
 * leído con useSyncExternalStore (sin setState dentro de efectos). En el servidor vale null.
 */
const KEY = "cuentos:draft:v1";
let current: Draft | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function read(): Draft {
  return loadDraft() ?? { ...DEFAULT_DRAFT, hero: { ...DEFAULT_DRAFT.hero, traits: randomTraits() } };
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

function getSnapshot(): Draft {
  if (!current) current = read();
  return current;
}

const getServerSnapshot = () => null;

/** Lectura síncrona fuera de React (bucles asíncronos). */
export function getDraft(): Draft {
  return getSnapshot();
}

export function setDraft(next: Draft | ((d: Draft) => Draft)) {
  const prev = getSnapshot();
  current = typeof next === "function" ? next(prev) : next;
  saveDraft(current);
  emit();
}

/** Borrador actual (null durante el render del servidor y la hidratación). */
export function useDraft(): Draft | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
