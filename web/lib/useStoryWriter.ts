"use client";

import { useEffect, useRef, useState } from "react";
import { getDraft, setDraft } from "./draftStore";
import { currentStory } from "./story";
import { storyInputHash } from "./story/hash";
import type { Draft, Story } from "./types";

/** «Escribirlo de otra manera»: máximo por sesión del navegador. */
export const MAX_REWRITES = 2;
const REWRITES_KEY = "cuentos:rewrites";
let memoryRewrites = 0;

function readRewrites(): number {
  try {
    return Number(window.sessionStorage.getItem(REWRITES_KEY)) || 0;
  } catch {
    return memoryRewrites;
  }
}

function storeRewrites(n: number) {
  memoryRewrites = n;
  try {
    window.sessionStorage.setItem(REWRITES_KEY, String(n));
  } catch {
    /* sin sessionStorage: queda en memoria */
  }
}

type StoryResponse = { ok: true; story: Story; fallback: boolean } | { ok: false };

/** Pide la historia a /api/story. Solo viajan las entradas: ni la historia previa ni los textos editados. */
async function requestStory(draft: Draft): Promise<StoryResponse> {
  try {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: { ...draft, story: undefined, illustration: undefined, textOverrides: {} } }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.story || !Array.isArray(json.story.pages)) return { ok: false };
    return { ok: true, story: json.story as Story, fallback: !!json.fallback };
  } catch {
    return { ok: false };
  }
}

/**
 * Estado del motor de historia en el paso 3 de /crear. Si no hay historia válida para las entradas actuales,
 * la pide al entrar; mientras tanto `writing` es true. Si la petición falla, el libro cae al arco base.
 */
export function useStoryWriter(draft: Draft, active: boolean) {
  const hash = storyInputHash(draft);
  const story = currentStory(draft);
  const [failedHash, setFailedHash] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteFailed, setRewriteFailed] = useState(false);
  const [rewrites, setRewrites] = useState(readRewrites);
  const inflight = useRef<string | null>(null);
  const needsStory = active && !story && failedHash !== hash;

  useEffect(() => {
    if (!needsStory || inflight.current === hash) return;
    inflight.current = hash;
    requestStory(getDraft()).then((res) => {
      if (inflight.current === hash) inflight.current = null;
      const current = storyInputHash(getDraft());
      if (current !== hash) return; // las entradas cambiaron mientras se escribía: el efecto vuelve a pedirla
      if (res.ok && res.story.inputHash === hash) setDraft((d) => (storyInputHash(d) === hash ? { ...d, story: res.story } : d));
      else setFailedHash(hash);
    });
  }, [needsStory, hash]);

  const rewrite = async () => {
    if (rewriting || rewrites >= MAX_REWRITES) return;
    const used = rewrites + 1;
    setRewrites(used);
    storeRewrites(used);
    setRewriting(true);
    setRewriteFailed(false);
    const base = getDraft();
    const seed = (base.storySeed ?? 0) + 1;
    const res = await requestStory({ ...base, storySeed: seed });
    setRewriting(false);
    const expected = storyInputHash({ ...getDraft(), storySeed: seed });
    if (res.ok && !res.fallback && res.story.inputHash === expected) {
      // versión nueva: los textos editados eran de la anterior
      setDraft((d) => ({ ...d, storySeed: seed, story: res.story, textOverrides: {} }));
    } else {
      setRewriteFailed(true);
    }
  };

  return {
    writing: needsStory || rewriting,
    /** El libro que se ve es el arco base porque el motor no pudo escribir una versión nueva. */
    isBase: !!story?.fallback || (!story && failedHash === hash),
    rewriteFailed,
    rewrite,
    rewritesLeft: Math.max(0, MAX_REWRITES - rewrites),
  };
}
