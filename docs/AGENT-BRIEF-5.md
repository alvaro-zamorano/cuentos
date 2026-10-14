# Brief 5 — Motor de historia (B2 del PLAN)

Working tree `/home/claude/repo-cuentos` (rama `feat/fase-1-journey-clasico`). Lee antes `docs/PLAN.md` §2 (cambio de rumbo) y `web/lib/story.ts`, `web/lib/arcs/cumpleanos.ts`, `web/lib/types.ts`, `web/app/crear/page.tsx`, `web/lib/draftStore.ts`, `web/app/api/lead/route.ts` (patrón de ruta API), `web/lib/supabase/admin.ts`. No commits, no push: yo los hago. Ninguna clave real; no inventes ninguna. Sin dependencias nuevas.

## Objetivo

Que cada cuento sea distinto y hable del niño de verdad. Hoy el texto es el arco `cumpleanos` con el nombre sustituido. Al terminar este brief:

1. En `/crear`, paso 2 («Su mundo»), el adulto escribe **detalles reales** del niño (texto libre).
2. Al pasar al paso 3 («El libro»), el cuento de 12 páginas lo escribe un LLM sobre un esqueleto de beats fijo, con esos detalles, y se enseña completo y editable.
3. Sin clave de proveedor, todo funciona igual con un proveedor `mock` determinista (no inventa un LLM: compone a partir del arco y los detalles), de modo que la interfaz y los tests no dependen de gastar nada.
4. Con `STORY_PROVIDER=anthropic` o `openai` y su clave en el entorno del servidor, llama al proveedor real. La clave nunca llega al cliente ni se registra en logs.

## A. Datos

- `Draft` gana `details: string[]` (0–5 cadenas, cada una ≤ 140 caracteres) y `story?: { id: string; provider: string; model: string; pages: StoryPage[]; title: string; dedication: string; inputHash: string; createdAt: number }`. `normalizeDraft` rellena `details: []`.
- `StoryPage = { n: 1..12; scene: SceneId; expression: Expression; withCompanion: boolean; text: string; scenePrompt: string }` — `scene` es uno de los 12 `SceneId` existentes para que el Clásico (vectorial) siga pintando; `scenePrompt` va en inglés para la edición ilustrada (sin texto en la imagen, rasgos redeclarados: reutiliza `scenePromptFor`).
- `buildBook(draft)` usa `draft.story` si existe y su `inputHash` coincide con el hash actual de las entradas (nombre, edad, acompañante, detalle especial, `details`); si no, cae al arco como hoy. `textOverrides` sigue aplicándose encima.

## B. Esqueleto y reglas (`web/lib/story/spec.ts`)

- 12 beats del cumpleaños, cada uno con: `n`, `scene` sugerida (puede cambiar entre dos opciones si el beat lo admite), `expression`, `withCompanion`, qué tiene que pasar (una frase), y en qué beats deben entrar los detalles reales (al menos 3 de los 5 detalles repartidos entre los beats 3–11; ninguno en el 1 ni en el 12).
- Reglas de longitud por franja: `2-4` → 12–28 palabras por página, frases de ≤ 9 palabras; `5-8` → 35–65 palabras por página. Título ≤ 6 palabras. Dedicatoria ≤ 25 palabras.
- Reglas de contenido: tono feliz y cálido; sin miedo, muerte, enfermedad, castigos, ni comparaciones con otros niños; sin marcas; sin emojis; sin diminutivos empalagosos; nombres propios solo los dados (niño y acompañante); el acompañante mascota no habla; el detalle especial (`special`) aparece en el beat del deseo y del regalo; castellano de España, tratamiento natural.
- `promptFor(input)` devuelve `{ system, user }`: el system con reglas y formato; el user con los datos del niño, los detalles tal cual los escribió el adulto, el esqueleto y el formato de salida **JSON estricto** (`{ title, dedication, pages: [{ n, scene, expression, withCompanion, text, sceneBrief }] }`, donde `sceneBrief` es la escena en castellano, una frase, que luego se traduce al `scenePrompt` con `scenePromptFor`). Sin markdown en la respuesta.

## C. Validación (`web/lib/story/validate.ts`)

`validateStory(output, input): { ok: boolean; issues: string[] }`. Comprueba: 12 páginas, `n` 1..12 sin huecos, `scene` y `expression` válidos, longitudes por franja, sin emojis, sin palabras de la lista negra, nombres propios no permitidos (heurística: palabras en mayúscula que no sean inicio de frase ni estén en una lista blanca: nombre, acompañante, días, meses, «Hoy», «Hoy», etc.), que al menos 3 detalles aparezcan (coincidencia de alguna palabra significativa de ≥ 5 letras de cada detalle, sin tildes ni mayúsculas), que el detalle especial aparezca. Si `ok` es falso, el proveedor real reintenta **una vez** pasando `issues` en el prompt; si vuelve a fallar, se devuelve el arco de siempre (`fallback: true`) y se registra el motivo. El mock siempre debe pasar la validación.

## D. Proveedores (`web/lib/story/provider.ts`)

Interfaz `StoryProvider { name; generate(input, opts?: { issues?: string[] }): Promise<{ raw: string; model: string; usage?: { input: number; output: number }; costCents?: number }> }`.

- `mock`: determinista a partir de un hash de la entrada. Toma el arco `cumpleanos` como base y **teje los detalles**: en los beats 3–11 añade una o dos frases que usan los detalles (plantillas variadas elegidas por el hash, en el registro de la franja de edad). Devuelve el JSON del formato. Es lo que corre en preview, en tests y cuando no hay clave.
- `anthropic`: `fetch` a `https://api.anthropic.com/v1/messages` con `ANTHROPIC_API_KEY`, `STORY_MODEL` (por defecto `claude-sonnet-4-5`; que sea una variable, no lo fijes en código en más de un sitio), `max_tokens` 3000, temperatura 0.9. Extrae el JSON (tolerante a texto alrededor).
- `openai`: `fetch` a `https://api.openai.com/v1/chat/completions` con `OPENAI_API_KEY`, `STORY_MODEL` (por defecto `gpt-4.1-mini`), `response_format: { type: "json_object" }`.
- Selección: `STORY_PROVIDER` ∈ `mock | anthropic | openai`; si la clave del elegido no existe, se usa `mock` y se deja constancia en la respuesta (`provider: "mock"`). Coste estimado en céntimos a partir de `STORY_COST_CENTS_PER_1K_IN/OUT` si existen (si no, 0 y se marca `costEstimated: false`).
- Ninguna llamada de pago desde el cliente: solo desde la ruta API.

## E. Ruta API (`web/app/api/story/route.ts`)

`POST { draft }` → `{ story, provider, model, fallback, validation }`. Server-only. Límite: 1 petición por segundo por IP y 20 por hora por IP (memoria del proceso; suficiente para preview). Si `createAdminClient()` existe, guarda en `cuentos_stories` (la tabla la creo yo; escribe el código suponiendo columnas `id uuid`, `input_hash text`, `input jsonb`, `story jsonb`, `provider text`, `model text`, `usage jsonb`, `cost_cents int`, `fallback boolean`, `issues jsonb`, `created_at timestamptz`) y antes de generar busca por `input_hash` para no generar dos veces lo mismo; si no hay cliente admin, sigue sin guardar. No registres la clave ni el prompt completo en consola.

## F. Interfaz

- Paso 2 («Su mundo»), bloque nuevo **«Lo que solo tú sabes»** debajo del detalle especial: 5 campos de texto de una línea con placeholders distintos y en registro adulto, por ejemplo: «Lo que más le gusta ahora mismo», «Una frase que repite», «Un sitio al que le encanta ir», «Una manía o un ritual», «Su persona o animal favorito». Mínimo 2 rellenos para continuar; contador discreto «2 de 5»; límite 140 caracteres. Microcopy de una línea explicando por qué («Con esto el cuento habla de él, no de un niño cualquiera»). Sin emojis, sin exclamaciones.
- Paso 3: al entrar, si no hay `story` válida para las entradas actuales, llama a `/api/story` y muestra un estado de escritura sobrio (título «Escribiendo el cuento de {nombre}», 3 líneas de progreso que cambian cada ~1,5 s, sin porcentajes falsos). Al llegar, muestra las 12 páginas como hoy (texto editable). Botón «Escribirlo de otra manera» (máximo 2 veces por sesión; cambia una semilla que se añade al `inputHash`) y, si hubo `fallback`, una nota discreta «No hemos podido escribir una versión nueva; este es el cuento base». Si la petición falla (red), cae al arco sin romper el paso.
- La portada y la dedicatoria usan `story.title` y `story.dedication`.
- `/libro` y la edición ilustrada funcionan sin cambios porque leen `buildBook`.

## G. Verificación (obligatoria)

- Tests unitarios con `node --test` en `web/tests/unit/story.test.mjs` (o `.ts` ejecutado con `node --experimental-strip-types` si funciona con tu Node; si no, `.mjs` importando desde un build con `tsc`… elige lo que pase sin añadir dependencias): el mock pasa la validación para 6 entradas distintas (dos franjas de edad, con y sin acompañante, con 2 y con 5 detalles); el validador rechaza: página de más, emoji, nombre no permitido, longitud fuera de rango, detalles ausentes. Añade `"test:unit"` a `package.json` y que `npm test` no lo rompa.
- Playwright (`tests/journey.spec.ts`): `createClassic` rellena 2 detalles; comprueba que el texto de alguna página contiene una palabra de uno de los detalles; comprueba el estado de escritura y que «Escribirlo de otra manera» cambia el texto de alguna página. Los 8 tests actuales siguen en verde (actualiza textos si hace falta).
- `npm run lint`, `npx tsc --noEmit`, `NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build`, `npm test` contra `npx next start -p 3021` (en 3017 hay otro servidor; no lo toques).
- Capturas 390×844 de: paso 2 con los detalles, estado de escritura, paso 3 con un cuento del mock. Míralas (Read) y corrige lo que se vea mal. Guárdalas en `web/capturas/v5/`.

## H. Documentación e informe

- `docs/STORY-ENGINE.md` (≤ 1 página): flujo, variables de entorno (`STORY_PROVIDER`, `STORY_MODEL`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, costes), cómo cambiar de proveedor, qué valida, qué pasa si falla.
- Informe final ≤ 300 palabras, sin adjetivos: archivos creados/modificados, salidas de lint/tsc/build/tests, capturas revisadas, decisiones tomadas, pendiente.

## Reglas

Registro adulto en toda la interfaz (sin «peque», sin emojis, sin exclamaciones). No afirmes que algo funciona sin haberlo ejecutado y visto. No amplíes alcance (sin pago, sin imágenes, sin email).
