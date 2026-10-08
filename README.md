# cuentos — cuentos personalizados para imprimir

Estado: **Fase 1 construida y verificada** (journey Clásico completo, PDF casero) · **Fase 1.5** (8 oct 2026): catálogo de rasgos desde las 50 imágenes, Supabase como backend, esqueleto de la edición ilustrada sin coste · **Brief 2** (8 oct 2026): edición ilustrada visible en dry-run con pago simulado, lead magnet `/gratis`, páginas legales en borrador, tests Playwright y CI. Ver `PRD.md` §14.

## Qué hay

- `PRD.md` — PRD v0.2 con bloque distro confirmado, checklist DISTRO y plan por fases.
- `web/` — app Next.js 16 (App Router, Tailwind 4). Backend en Supabase vía rutas API; claves solo en `web/.env.local`.
- `docs/hermes-mision-assets.md` — tareas para el agente Hermes (anclas, rasgos, hojas, escenas, eval).
- `capturas/` — capturas del journey en móvil y un PDF de ejemplo generado por Playwright (ignorado por git).
- `assets/` — `manifest.json` (clasificación de las 50 imágenes de `assets/raw/`, ignorado por git), `styles.json` (6 estilos). Se regeneran con `python3 scripts/assets_build.py`, que también escribe los recortes en `web/public/catalog/<estilo>/<categoria>/<id>.png` y el seed SQL.
- `supabase/migrations/` — SQL aplicado en el proyecto compartido (tablas `cuentos_*`). Detalle en `docs/supabase.md`.
- `scripts/upscale.md` — paso de upscale ×3 pendiente (RF-13).

## Journey implementado

`/` landing → `/crear` (1 Quién · 2 Su mundo · 3 Leer · 4 Imprimir) → `/libro?print=1` (vista de impresión, 13 hojas A4 apaisadas, `window.print()` → «Guardar como PDF»).

- Avatar por rasgos (`lib/traits.ts`) renderizado como SVG determinista (`components/Avatar.tsx`).
- Arco de cumpleaños, 2 franjas de edad y variantes para mascota (`lib/arcs/cumpleanos.ts`); relleno por interpolación (`lib/story.ts`).
- 12 escenas vectoriales (`components/Scene.tsx`) = modo Clásico. El `scenePrompt` de cada página ya lleva los rasgos redeclarados para la edición ilustrada.
- Borrador en `localStorage` (`cuentos:draft:v1`). Sin registro.
- Catálogo de rasgos (`lib/traits.ts`): 12 peinados, 5 colores de pelo, 8 tonos de piel, 6 formas y 4 colores de ojos, 6 gafas, 8 prendas × 6 colores, 8 accesorios; acompañante con variante (5 mascotas perro/gato, 8 abuelos). `describeTraitsEn()` alimenta los `scenePrompt`.
- Captura de email en `/api/lead`: upsert en `cuentos_leads` (si hay Supabase) y reenvío opcional a `LEADS_WEBHOOK_URL`; la descarga nunca se bloquea.
- `/api/books` (POST) guarda el borrador y devuelve `public_id`; `/api/books/[public_id]` (GET) lo devuelve. El paso Imprimir muestra el enlace `/crear?b=<public_id>` y `/crear` lo carga.
- Edición ilustrada (sin ejecutar): `lib/generation/adapter.ts` (`dry-run` por defecto, `openai-images` construye `/v1/images/edits` con ancla + hoja), `/api/jobs` (solo libros pagados, protegido con `JOBS_API_SECRET`) y `web/scripts/worker.ts` para el Mac Mini (1 intento por job, tope de coste por libro, purga de libros caducados).

## Edición ilustrada en dry-run (brief 2)

Solo con `NEXT_PUBLIC_DRY_RUN_PAYMENT=1` (se lee en el build). Sin la variable, la tarjeta «Ilustrado» sigue en «Pronto» y `/ilustrado` dice que llega pronto.

`/crear` paso 4 → «Ilustrado · PDF» → `/ilustrado`:

1. **Pago simulado**: aviso «PAGO SIMULADO», casilla de declaración del comprador (tutor + sin desistimiento, art. 103.c TRLGDCU), botón «Simular pago (0 €)». No pide datos de pago.
2. **Estilo**: las 6 anclas de `public/styles/<id>.jpg` (1200×800). Si faltan los JPG, degradado con la paleta y el nombre del estilo (`components/StyleImage.tsx`).
3. **Hoja de personaje** «Así va a ser {nombre}»: cuadrícula con los recortes del catálogo del estilo (cuerpo de frente y girado, pelo, piel, ojos, gafas, ropa). Huecos del manifest (pelo en 3D, papercraft y acuarela; ropa en acuarela) → recorte del estilo más parecido (`lib/catalog.ts` → `SIMILAR_STYLES`) con etiqueta «provisional». Aprobar crea, si hay Supabase, un job `sheet` ya `done` en dry-run (`POST /api/jobs` con `dry_run: true`, coste 0, nunca `pending`: el worker no lo recoge). Cambiar rasgos → `/crear?paso=1`; si los rasgos o el estilo cambian, la hoja vuelve a pedir aprobación.
4. **Progreso**: 12 casillas; cada página tarda 300–800 ms simulados. Texto: «Vista previa de demostración: las ilustraciones finales se generan tras el pago».
5. **Preview**: el mismo componente que el Clásico (`components/BookPreview.tsx`) con la página ilustrada; «Otra versión» pasa a la variante siguiente (6, deterministas); el texto se sigue editando.
6. **PDF**: `/libro?edition=illustrated&print=1`, misma plantilla A4 (13 hojas). Si la edición ilustrada no está terminada, no imprime.

Composición dry-run (`lib/illustration.ts`, `components/IllustratedScene.tsx`): ancla recortada a 3:2 con zoom y espejo deterministas; el recorte de cuerpo entero del catálogo tapa al niño del ancla (cajas medidas en `ANCHOR_BOXES`) y el abuelo/a tapa a la abuela; mascota o hermano/a van en el suelo. El fondo blanco de los recortes se quita en el navegador (`lib/cutout.ts`). Es una maqueta: no representa la calidad de la generación real.

Estado: `draft.styleId` y `draft.illustration` en `localStorage` (store en `lib/draftStore.ts`) y, si el libro ya tiene `public_id`, también en `cuentos_books.draft` vía `POST /api/books`.

## Lead magnet y legal

- `/gratis`: cuento demo fijo (Lucas, 5 años, perro Toby, dinosaurios), email + consentimiento (mismo formulario que `/crear`, `components/EmailForm.tsx`, `source: "gratis"`) → abre `/libro?demo=1&print=1`. Sin PDF binario: se imprime desde la página.
- `/privacidad`, `/condiciones`, `/aviso-legal`: plantillas con cabecera «Borrador pendiente de revisión legal» y huecos marcados entre corchetes (titular, NIF, proveedores…). Enlazadas desde el footer común y desde el formulario de email.

## Tests y CI

```bash
cd web
NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build
npm test            # Playwright: arranca next start en :3017 y recorre Clásico, Ilustrado dry-run, /gratis y legales
```

Los tests simulan `/api/books` y `/api/jobs` en el navegador (sin Supabase) y funcionan con o sin las anclas JPG. `.github/workflows/ci.yml` ejecuta en cada PR `npm ci`, `npm run lint`, `npm run build`, `npx playwright install --with-deps chromium` y `npm test`. **El workflow no está en la rama**: la integración de GitHub del agente no tiene permiso `workflows` (403 al crear el árbol); va en `cuentos-brief2-binarios.zip` para añadirlo desde local. `web/package-lock.json` está en el repo (sin campos `resolved` ni `integrity`: versiones fijadas, hashes no; `npm ci` verificado con él. Para añadir los hashes, `npm install` en local y commit del lockfile).

## Analítica

Microsoft Clarity se carga desde `app/layout.tsx` solo si existe `NEXT_PUBLIC_CLARITY_ID` en el entorno del build (Vercel → Environment Variables). El valor no va en el repo. Pendiente: banner de cookies antes de activarlo en producción (ver `/privacidad`).

## Correr en local

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build && npx next start -p 3000
```

Variables: copia `web/.env.example` a `web/.env.local` y rellena en local (nunca en el repo). `NEXT_PUBLIC_DRY_RUN_PAYMENT=1` activa la demo de la edición ilustrada; `NEXT_PUBLIC_CLARITY_ID` activa Clarity. Sin `SUPABASE_SERVICE_ROLE_KEY` la app funciona: `/api/lead` responde ok sin persistir y `/api/books` responde 503 (no se muestra enlace).

Worker y comprobaciones (desde `web/`):

```bash
npx tsx scripts/check-adapter.ts          # dry-run + petición openai construida sin enviar
npx tsx scripts/worker.ts --once          # una pasada del worker (requiere Supabase en .env.local)
npx tsx scripts/avatar-sheet.tsx > avatares.html   # hoja de contacto de todos los rasgos SVG
```

## Verificación hecha (8 oct 2026)

- `npm run build` limpio (TypeScript incluido).
- Journey recorrido con Playwright en viewport móvil 390×844: nombre, edad, rasgos, acompañante con nombre, detalle especial, edición de texto en página 1 (persistida), email + consentimiento, apertura de `/libro?print=1`.
- PDF generado por Chromium con `@page A4 landscape`: 13 páginas de 841.9×595 pt. Sin errores de consola.

## Verificación Fase 1.5 (8 oct 2026)

- `npm run build` limpio. `npm run lint`: 2 errores `react-hooks/set-state-in-effect` en `app/crear` y `app/libro` que ya estaban en el commit anterior.
- 340 recortes revisados en hojas de contacto por estilo; hoja de contacto de los avatares SVG revisada (todos los ids renderizan).
- Journey en Playwright 390×844: nombre, edad, 8 rasgos nuevos, abuela con variante y nombre, detalle, edición de texto, email + consentimiento, enlace de recuperación, `/libro` (13 hojas, PDF 841.9×595 pt), recuperación en navegador limpio con `/crear?b=`. `/api/books` simulado en esa prueba porque el contenedor no tiene la service role; el esquema se probó con SQL directo (insert de libro, lead y job).
- Borrador guardado con el formato anterior carga sin errores.

## Verificación brief 2 (8 oct 2026)

- `npm run lint`: 0 errores (los dos `set-state-in-effect` resueltos con un store sobre `useSyncExternalStore`).
- `NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build` limpio; `npm test`: 5/5 en verde, con y sin `public/styles/*.jpg`.
- Copia limpia del repo: `npm ci` + lint + build + test, como en CI.
- PDF ilustrado generado con Chromium: 13 páginas de 841.9×595 pt.
- Capturas revisadas de las 6 anclas con abuela y con perro; build sin la variable de demo: «Ilustrado» sigue en «Pronto».

## Siguiente

1. **Fase 0 (Hermes T1 reducido)**: 1 ancla de estilo + hoja + 12 escenas de cumpleaños a mano, tope 30 generaciones, 3 personas puntúan consistencia. Go/no-go del producto ilustrado.
2. Montar esas 12 escenas en la plantilla → `public/lead-magnet/cumpleanos.pdf` → **primera pieza pública** (reel con el cuento impreso en casa).
3. Desplegar `web/` en Vercel (rama + PR, nunca a main directo) con `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `JOBS_API_SECRET`; probar `/api/books` real.
4. Huecos del catálogo: peinados en 3D, papercraft y acuarela; conjuntos en acuarela (ver `assets/manifest.json` → `huecos`). Mientras tanto la hoja usa recortes «provisionales» de otro estilo.
5. Subir desde la máquina de Álvaro `web/public/styles/*.jpg` (6 anclas, ~0,9 MB) y `.github/workflows/ci.yml` (están en `cuentos-brief2-binarios.zip`): no entran por la API que usa el agente.
6. Revisión legal de las tres páginas y relleno de los huecos entre corchetes; banner de cookies antes de activar Clarity.
