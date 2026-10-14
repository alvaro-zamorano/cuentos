# Brief 7 — Muestra tras el email y paywall (B3 del PLAN)

Working tree `/home/claude/repo-cuentos` (rama `feat/fase-1-journey-clasico`), código en `web/`. Lee antes `docs/PLAN.md` §2–3, `docs/STORY-ENGINE.md`, `web/app/crear/page.tsx` (paso 4, `EditionStep`), `web/app/ilustrado/page.tsx`, `web/lib/illustration.ts`, `web/components/IllustratedScene.tsx`, `web/components/CharacterSheet.tsx`, `web/app/api/jobs/route.ts`, `web/scripts/worker.ts`, `web/lib/generation/{adapter,budget,character,prompts}.ts`, `web/lib/supabase/types.ts` (`cuentos_books`, `cuentos_generation_jobs`, `cuentos_spend`), `web/lib/pricing.ts`, `web/lib/flags.ts`. No commits, no push. Ninguna clave real ni llamada de pago: todo se desarrolla y verifica con `GENERATION_PROVIDER=dry-run` y `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`. Sin dependencias nuevas. Registro adulto en la interfaz (sin diminutivos, emojis ni exclamaciones).

## Objetivo

Que el embudo sea: avatar → detalles → cuento completo (gratis) → **email** → **hoja de personaje + una página ilustrada real** → el resto bloqueado con el precio → pago → libro completo. Con el gasto antes del pago acotado por `budget.ts` (≈ 2 imágenes por lead) y sin generar nada dos veces.

## A. Paso 4 «Edición» (`/crear`)

- Dos tarjetas, no tres: **Clásico** (gratis: PDF para imprimir en casa, como hoy) e **Ilustrado** (14,90 €: «Tu hijo pintado en cada página»; tapa dura queda como línea secundaria «próximamente» dentro de la tarjeta del Ilustrado).
- Un solo formulario de email + declaración del tutor (el actual). Tras enviarlo, el lead existe (`/api/lead`) y se guarda el libro (`/api/books`, si hay service role).
- Botón del Ilustrado: «Ver cómo quedaría» (no «pagar»). Lleva a `/ilustrado` con el estilo por defecto (gouache); el estilo se puede cambiar después sin coste si todavía no se ha generado nada.

## B. `/ilustrado`: muestra, bloqueo, pago, libro

Estados (en `Draft.illustration`, persistido como hoy):

1. **Estilo**: selector como ahora (Disponible / Próximamente).
2. **Muestra** (nuevo, antes del pago): al entrar con email, se piden **dos imágenes**: la hoja de personaje y la página 9 (`mesa-tarta`, con acompañante si lo hay) con `scenePrompt` de la historia generada. Estado de espera sobrio («Pintando a {nombre}», sin porcentajes falsos; 3 líneas rotando). Al llegar: hoja a la izquierda, página 9 a la derecha a tamaño de lectura con su texto, y debajo **las otras 11 páginas bloqueadas**: tarjeta por página con su número, su texto completo (ya es gratis) y el hueco de la ilustración velado con un patrón de papel y el candado tipográfico sobrio «Se pinta al confirmar». CTA fija abajo: «Ilustrar el libro completo · 14,90 €». Secundario: «Otra versión de la hoja» (máximo 2, cada una cuenta en el presupuesto del lead; al agotarse, el botón desaparece y se explica en una línea).
3. **Pago**: el paso simulado actual («Pago de prueba — sin cargo») solo con `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`. Sin esa variable, el botón lleva a una pantalla «Pago disponible próximamente» con el email ya recogido (Stripe llega en B4). La declaración del tutor ya se marcó en el paso 4; no se vuelve a pedir.
4. **Libro**: tras el pago, se generan las 11 páginas restantes + portada (la página 9 y la hoja ya existen y **no se repiten**). Progreso por página como hoy; aprobación página a página con «Otra versión» (máximo 1 por página incluida; a partir de ahí, se deshabilita con explicación). Luego PDF como hoy.

## C. Generación sin worker externo (Vercel)

Hoy los jobs los procesa `scripts/worker.ts` (Mac Mini). Para que el producto funcione solo con Vercel:

- `POST /api/generate/sample` `{ bookId | email, styleId }` → comprueba `canSpend` (lead = email), crea los jobs `sheet` y `sample` (page 9) en `cuentos_generation_jobs` si no existen ya para ese `pagesKey`/`sheetKey`, y devuelve sus ids. No ejecuta nada.
- `POST /api/generate/run` `{ jobId }` → procesa **un** job: reclama (estado `running`, con bloqueo optimista por `updated_at`), llama al adaptador (`getAdapter()`), sube el PNG al bucket privado `cuentos` (`books/<bookId>/<kind>-<n>-<variante>.png`), guarda ruta y coste, `recordSpend`, estado `done`; en error, `failed` con mensaje recortado. `export const maxDuration = 60`. Con `dry-run`, el adaptador devuelve `data: null`: entonces el job se marca `done` con `placeholder` y la interfaz pinta la escena vectorial pintada (`Scene`/`CharacterSheet`) como hasta ahora, etiquetada discretamente «Vista previa sin ilustrar (modo de prueba)» solo cuando `provider === "dry-run"`.
- `GET /api/generate/status?bookId=` → lista de jobs con estado y, para los `done` con imagen, una URL firmada (10 min) de Storage.
- Cliente: `useGeneration(bookId)` lanza `run` para cada job pendiente **de uno en uno** (nunca en paralelo: controla el gasto y la duración) y consulta `status` cada 2 s hasta terminar. Si el usuario cierra y vuelve, retoma por `status`.
- `scripts/worker.ts` queda como alternativa (no lo borres); documenta en `docs/GENERATION.md` cuándo usar cada camino.
- Tras el pago, `POST /api/generate/book` crea los jobs de las páginas que faltan + portada (comprobando que el pedido existe en `cuentos_orders` o que `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`), marcados `paid: true` para saltar el tope por lead (el diario sigue).

## D. Datos

- `cuentos_books` ya tiene `email` y `draft` (jsonb; la historia generada va dentro de `draft.story`). `cuentos_generation_jobs` tiene `book_id, kind, page_n, style_id, prompt, references, status, attempts, candidates, chosen, cost_cents, error, created_at, updated_at`; `cuentos_spend` existe (ver `docs/sql/cuentos_spend.sql`). Si necesitas una columna nueva (p. ej. `paid boolean` en los jobs o `storage_path`), escribe el SQL en `docs/sql/<nombre>.sql`, asume que está aplicado y actualiza `lib/supabase/types.ts`.
- `Illustration` gana `sampleJobId?`, `sheetVersions: number`, `pageVersions: Record<number, number>`, `sampleKey?` (huella de rasgos + estilo + historia con la que se pintó la muestra; si cambia, la muestra se invalida y se avisa antes de volver a gastar).

## E. Verificación (obligatoria)

- Playwright (`tests/journey.spec.ts`): el test del Ilustrado se reescribe para el flujo nuevo: paso 4 → email → «Ver cómo quedaría» → espera → hoja + página 9 + 11 bloqueadas (`data-testid="locked-page"` ×11) → CTA con el precio → pago simulado → progreso → 12 páginas → PDF de 13 hojas. Comprueba que `GET /api/generate/status` devuelve los jobs esperados (`sheet`, `sample`, luego 11 `page` + `cover`) y que **ningún job se crea dos veces** al recargar la página. Los demás tests siguen en verde.
- Tests unitarios para la lógica de claves (`sampleKey`, invalidación) y para `canSpend` con los jobs de muestra.
- `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build`, `PORT=3021 npm test -- tests/journey.spec.ts` (el 3017 no es tuyo).
- Capturas 390×844 en `web/capturas/v7/`: paso 4, espera de la muestra, muestra con bloqueo y CTA, progreso tras el pago. Míralas y corrige.

## F. Informe (≤ 300 palabras, sin adjetivos)

Archivos, SQL pendiente de aplicar (si lo hay), salidas de lint/tsc/tests/build, capturas revisadas, decisiones, pendiente.
