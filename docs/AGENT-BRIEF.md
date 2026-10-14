# Brief para el agente de construcción — `cuentos` · Fase 1.5

Fecha: 8 oct 2026. Repo: `alvaro-zamorano/cuentos` (rama de trabajo `feat/fase-1-journey-clasico`, base `main`). Working tree en el contenedor: `/home/claude/repo-cuentos`.

Lee primero `PRD.md` (v0.2) y `README.md`. Este brief no sustituye al PRD: lo ejecuta.

## Qué hay ya (no lo rehagas)

- Journey Clásico completo y verificado (Next.js 16, Tailwind 4): `/` → `/crear` → `/libro?print=1`. Avatar SVG por rasgos, arco de cumpleaños (2 franjas, variantes mascota), 12 escenas vectoriales, PDF por print CSS.
- `assets/raw/` (ignorado por git): 50 PNG 1536×1024 generados con GPT-image por Álvaro siguiendo los prompts del plan:
  - 6 **anclas de estilo** (escena "cometa roja en el prado"): 3D suave, flat, gouache retro, papercraft, lápiz, acuarela. Nombres: `*ometa*`.
  - **Catálogos de rasgos** en cuadrícula, varios por categoría y estilo: 12 peinados (etiquetas en inglés), 8 tonos de piel, 6 ojos (E01–E06), 6 gafas, 8 conjuntos (O01–O08), 8 accesorios (A01–A08), 8 mascotas (P01–P08), 8 abuelos (B01–B08). El sufijo `-N` del nombre suele indicar la variante/estilo; verifícalo mirando las imágenes, no lo asumas.
- Supabase compartido con otros productos. Convención de Álvaro: tablas en `public` con prefijo de producto y RLS activado (`cc_*`, `gm_*`, `gestclar_*`…). Para nosotros: **`cuentos_*`**. No toques nada que no empiece por `cuentos_`.

## Objetivo de esta sesión

Dejar el repo listo para la edición ilustrada sin gastar un euro en generación, con Supabase como backend, y todo verificado.

### 1. Assets → catálogo usable (prioridad alta)

1. Mira las 50 imágenes (contact sheets con PIL para no abrir 50 archivos). Clasifica cada una: `{tipo, estilo, variante}`. Escribe `assets/manifest.json` con la clasificación y la ruta original.
2. Elige **un** juego completo por estilo (una imagen por categoría) priorizando coherencia visual con el ancla de ese estilo. Si una categoría no tiene variante en un estilo, anótalo como hueco en el manifest; no inventes.
3. Recorta cada cuadrícula en PNG individuales (fondo blanco → recorta por bounding box de contenido, ~400 px de alto, con margen) en `web/public/catalog/<estilo>/<categoria>/<id>.png`. Los ids tienen que coincidir con `web/lib/traits.ts`.
4. Amplía `web/lib/traits.ts` para cubrir los catálogos reales: 12 formas de pelo, 8 tonos de piel, 6 ojos, 6 gafas, 8 outfits, 8 accesorios (opcional), 8 mascotas, 8 abuelos. Mantén los ids actuales como subconjunto. **El avatar SVG (`components/Avatar.tsx`) debe soportar cada id nuevo** (añade formas de pelo, colores, gafas). Verifica renderizando una hoja de contacto de todos los avatares.
5. Añade a `lib/traits.ts` un `describeTraits()` en inglés también (`describeTraitsEn`) para los prompts de la edición ilustrada; los `scenePrompt` de `lib/story.ts` deben usarlo.
6. Define `assets/styles.json`: por estilo, `{id, label, anchorPath, promptStyle (el texto de estilo del Prompt 1), palette}`.

### 2. Supabase (prioridad alta)

Usa las herramientas MCP `mcp__supabase_Carche__*` (cárgalas con ToolSearch). Inspecciona antes de migrar. Crea con `apply_migration` (nombre `cuentos_<n>_<qué>`):

- `cuentos_leads` (id, email, marketing bool, edition, source, created_at; unique email+edition).
- `cuentos_books` (id uuid, public_id text unique corto, draft jsonb, edition, status, email, created_at, updated_at, expires_at = created_at + 30 días).
- `cuentos_orders` (id, book_id fk, edition, amount_cents, currency, stripe_session_id, status, created_at).
- `cuentos_generation_jobs` (id, book_id fk, kind 'sheet'|'scene', page_n, prompt, references jsonb, status, candidates jsonb, chosen text, cost_cents, error, created_at, updated_at).
- `cuentos_assets` (id, kind, style_id, category, trait_id, path, created_at) con el contenido de `assets/manifest.json` + recortes.
- RLS activado en todas; sin políticas públicas de lectura salvo `cuentos_assets`. Todo acceso desde la app va por rutas API con service role (variable `SUPABASE_SERVICE_ROLE_KEY`, nunca en cliente ni en el repo).
- Bucket de Storage `cuentos` privado (si el MCP no permite crearlo, deja el SQL/instrucción en `docs/supabase.md`).
- Genera tipos TS (`generate_typescript_types`) a `web/lib/supabase/types.ts`.

Cablea la app:
- `/api/lead` → upsert en `cuentos_leads` (mantén el webhook opcional).
- `/api/books` POST → guarda el draft y devuelve `public_id`; GET `/api/books/[public_id]` → lo devuelve. En el paso Imprimir, "enviarte el enlace por si lo pierdes" pasa a ser real: la respuesta incluye `/crear?b=<public_id>` y `/crear` lo carga si viene en la URL.
- Cliente Supabase solo en servidor (`web/lib/supabase/server.ts`). `.env.example` con `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LEADS_WEBHOOK_URL`. **Nunca escribas valores reales**: Álvaro los pone en local.

### 3. Esqueleto de la edición ilustrada (sin gastar)

- `web/lib/generation/adapter.ts`: interfaz `generateSheet(traitsEn, style)` y `generateScene(sheetRef, style, scenePrompt)`; implementación `openai-images` que construye la llamada (modelo de imágenes de OpenAI, edits con referencias) y una implementación `dry-run` que devuelve rutas placeholder. Selección por `GENERATION_PROVIDER`. **No ejecutes ninguna llamada de pago.**
- `/api/jobs` POST (crea `cuentos_generation_jobs` para una hoja o para las 12 escenas de un libro pagado) y `scripts/worker.ts` (poll de jobs `pending`, ejecuta el adapter, guarda candidatos, marca `done`/`error`, tope de intentos = 1, tope de coste por libro leído de env). Pensado para correr en el Mac Mini.
- Upscale: deja `scripts/upscale.md` con el paso ×3 pendiente (Real-ESRGAN) y el cálculo de px objetivo (RF-13).

### 4. Verificación y entrega (obligatorio)

- `npm run build` limpio. Journey recorrido con Playwright (hay un script de referencia en el historial: nombre, edad, rasgos, acompañante, detalle, edición de texto, email, `/libro`). Captura una hoja de contacto de los avatares nuevos y mírala.
- No afirmes nada que no hayas ejecutado y visto.
- Commits en la rama `feat/fase-1-journey-clasico`, mensajes en castellano, con las líneas de atribución que el sistema indica. **Nunca a `main`. Nunca `--force`.**
- `git push` desde el contenedor está denegado (403). Publica así:
  1. Texto (ts, tsx, md, json, css, sql…): `mcp__github__push_files` a la rama `feat/fase-1-journey-clasico` en lotes de ≤40 archivos (crea la rama antes con `mcp__github__create_branch` desde `main`). Excluye `package-lock.json` y binarios.
  2. Abre un PR hacia `main` con `mcp__github__create_pull_request` (draft), descripción en castellano con qué se verificó y qué queda, terminada con la atribución indicada por el sistema.
  3. Binarios (recortes PNG): empaqueta el working tree completo sin `node_modules`, `.next` ni `assets/raw` en `cuentos-repo.zip` y envíalo con `SendUserFile`; en tu informe final di que Álvaro debe descomprimirlo sobre su clon y hacer `git add web/public/catalog` + push desde su máquina.
- Informe final (≤400 palabras): qué está hecho y verificado, huecos del manifest (estilos sin alguna categoría), decisiones tomadas, qué queda. Sin adjetivos.

## Reglas

- Claves: nunca pedirlas, leerlas, imprimirlas ni commitearlas.
- Generación de pago: ninguna en esta sesión.
- Si algo bloquea (MCP sin permiso, herramienta ausente), documenta el bloqueo y sigue con el resto.
- No amplíes alcance: ni Stripe, ni POD, ni más ocasiones, ni LLM para texto.
