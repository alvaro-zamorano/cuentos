# Brief 6 — Adaptador de imagen, personaje canónico, Fase 0 y presupuesto (B1/B3 del PLAN)

Working tree `/home/claude/repo-cuentos` (rama `feat/fase-1-journey-clasico`), código en `web/`. Lee antes `docs/PLAN.md` §2–3, `web/lib/generation/adapter.ts`, `prompts.ts`, `styles.ts`, `styles.json`, `web/lib/traits.ts` (`describeTraitsEn`, `describeCompanionEn`), `web/app/api/jobs/route.ts`, `web/lib/supabase/types.ts` (tabla `cuentos_generation_jobs`), `web/scripts/pieces-build.mjs` (uso de sharp). No commits, no push. **Ninguna llamada de pago**: no hay claves y no debes inventarlas; todo se verifica con `dry-run` y tests de construcción de peticiones. Sin dependencias nuevas.

## Objetivo

Dejar listo todo lo que la Fase 0 necesita salvo la clave: cuando Álvaro ponga `GEMINI_API_KEY` (o `OPENAI_API_KEY`) en `web/.env.local`, un solo comando genera 1 hoja de personaje + 3 páginas de un mismo niño y deja una hoja de contacto para juzgar la consistencia y el coste real. Y que el servidor pueda acotar el gasto por lead y por día.

## A. Personaje canónico (`web/lib/generation/character.ts`)

- `characterBible(traits, age, name?)` → texto en inglés, fijo y ordenado (edad aparente, pelo con forma y color, piel, ojos, gafas, prenda con color, accesorio, proporciones de libro infantil, «always the same child»), construido con `describeTraitsEn`. Es la frase que se redeclara en **todas** las llamadas (hoja y páginas).
- `sheetPrompt` y `scenePrompt` de `prompts.ts` pasan a recibir el bible; mantén las firmas actuales compatibles (parámetro `traitsEn` = bible).
- Prompt de hoja: turnaround (frente, tres cuartos, perfil, espalda) + 6 expresiones, fondo blanco, sin texto. Prompt de página: escena + «el niño es exactamente el de la referencia» + estilo + composición apaisada con espacio para el texto a un lado + sin texto. Ya existen; revísalos con `characterBible` y con el estilo.

## B. Anclas de estilo en el repo

`styles.json` apunta a `assets/raw/…` (no está en el repo). Cambia `anchorPath` de los seis estilos a `web/public/styles/<id>.jpg` (existen). `refToBlob` resuelve rutas relativas contra la raíz del repo: comprueba que funciona desde `web/` (`CUENTOS_REPO_ROOT` o `resolve(process.cwd(), "..")`) y desde la raíz. El `promptStyle` de cada estilo: léelo y ajusta solo si es contradictorio con el ancla (mira la imagen con Read).

## C. Adaptador Gemini (`web/lib/generation/adapter.ts`)

- Nuevo `geminiImagesAdapter` (`name: "gemini-images"`): `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` con cabecera `x-goog-api-key`, `model` de `GEMINI_IMAGE_MODEL` (por defecto `gemini-2.5-flash-image`), `contents: [{ parts: [ { inline_data: { mime_type, data(base64) } }…, { text: prompt } ] }]`, `generationConfig: { responseModalities: ["IMAGE"] }` (si el modelo exige `["TEXT","IMAGE"]`, acepta ambas y filtra las partes con `inline_data`). Las referencias (ancla, hoja) van como `inline_data`. Respuesta: `candidates[0].content.parts[].inline_data.data` → PNG en bytes. Si no hay imagen, error con el texto de la respuesta recortado (sin la clave).
- `buildGeminiImageRequest(prompt, refs)` separada de `executeGemini` para poder testear sin red, igual que `buildOpenAIImageRequest`.
- `getAdapter` acepta `gemini-images`. `estimatedCostCents()` pasa a leer `GENERATION_COST_CENTS_PER_IMAGE` con valores por defecto por proveedor (gemini 4, openai 8) si no está definida; documenta que son estimaciones hasta medir.
- Tamaño de salida: para páginas, apaisado 3:2 (en Gemini se pide por prompt «landscape 3:2»; en OpenAI `1536x1024`); para la hoja, cuadrado.

## D. Guion de la Fase 0 (`web/scripts/fase0.mjs`)

`node scripts/fase0.mjs [--provider gemini-images|openai-images|dry-run] [--style gouache] [--child '{"name":"Vera","age":6,"traits":{…}}'] [--out capturas/fase0]`

1. Lee `web/.env.local` si existe (parser simple de `KEY=valor`, sin imprimir valores) y lo mezcla en `process.env` sin sobrescribir lo ya definido.
2. **Tope duro: 6 imágenes por ejecución** (1 hoja + 3 páginas + 2 de reserva que no se usan salvo `--candidates`); si una combinación de opciones superase 6, aborta antes de llamar.
3. Hoja de personaje → guarda `sheet.png`. Páginas: tres escenas fijas con prompts de escena en inglés escritos en el guion (tarta con velas en la mesa con la abuela; parque con columpios corriendo con el perro; dormitorio de noche, luz de lámpara) usando `scenePrompt` + bible → `page-1..3.png`.
4. Hoja de contacto con sharp: `contact.png` (hoja a la izquierda, tres páginas a la derecha, 2400 px de ancho) y `report.json` con proveedor, modelo, prompts, tiempos, coste estimado y, si la API devuelve uso, el real.
5. Con `dry-run` no llama a nada: escribe los prompts y las peticiones construidas (sin claves) en `report.json` y termina. **Esto es lo único que ejecutas tú.**
6. Si falta la clave del proveedor pedido, termina con un mensaje claro que diga qué variable falta, sin imprimir ninguna otra variable.

## E. Presupuesto (`web/lib/generation/budget.ts` + migración)

- Tabla nueva `cuentos_spend` (escribe el SQL en `docs/sql/cuentos_spend.sql`; la aplico yo): `id uuid`, `lead_id text` (email o id de libro), `kind text` (`story|sheet|sample|page`), `provider text`, `model text`, `cost_cents int`, `created_at timestamptz`; índices por `lead_id` y por `created_at`. RLS activada sin políticas (solo service role).
- `budget.ts`: `canSpend(db, { leadId, cents })` → `{ ok, reason? }` comprobando `LEAD_CAP_CENTS` (por defecto 10) por lead y `DAILY_CAP_CENTS` (por defecto 500) por día UTC; `recordSpend(db, …)`. Si no hay cliente admin, `canSpend` devuelve `ok: false, reason: "sin presupuesto configurado"` (nunca se gasta a ciegas). Tipos de la tabla añadidos a `lib/supabase/types.ts`.
- Conecta `/api/jobs` (si hoy crea jobs de hoja/página): antes de crear un job con coste, `canSpend`; al completarse, `recordSpend`. Si `/api/jobs` no ejecuta generación en servidor (lo hace el worker), deja el gancho preparado y documéntalo.

## F. Verificación (obligatoria)

- Tests unitarios (`node --import tsx --test`, mismo patrón que `tests/unit/story.test.ts`) en `tests/unit/generation.test.ts`: `characterBible` estable para los mismos rasgos y distinto para rasgos distintos; `buildGeminiImageRequest` y `buildOpenAIImageRequest` construyen cuerpo/cabeceras esperados sin tocar la red; rechazan > 3 referencias; `canSpend` con un cliente falso (inyectado) respeta los dos topes.
- `node scripts/fase0.mjs --provider dry-run` genera `capturas/fase0/dry-run/report.json` con los 4 prompts; míralo.
- `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build`. Playwright no hace falta salvo que toques interfaz (no deberías).
- `.env.example` con las variables nuevas y un comentario de una línea cada una.

## G. Informe (≤ 250 palabras, sin adjetivos)

Archivos, salidas de lint/tsc/tests/build, qué hace exactamente `fase0.mjs` cuando haya clave y qué comando debe ejecutar Álvaro (o yo) para la Fase 0, decisiones, pendiente.

## Reglas

Ninguna clave real. Ninguna llamada a un proveedor de pago. No afirmes que algo funciona sin haberlo ejecutado. No amplíes alcance (sin interfaz, sin pago).
