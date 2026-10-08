# cuentos — cuentos personalizados para imprimir

Estado: **Fase 1 construida y verificada** (journey Clásico completo, PDF casero) · **Fase 1.5** (8 oct 2026): catálogo de rasgos desde las 50 imágenes, Supabase como backend, esqueleto de la edición ilustrada sin coste. Ver `PRD.md` §14.

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

## Correr en local

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build && npx next start -p 3000
```

Variables: copia `web/.env.example` a `web/.env.local` y rellena en local (nunca en el repo). Sin `SUPABASE_SERVICE_ROLE_KEY` la app funciona: `/api/lead` responde ok sin persistir y `/api/books` responde 503 (no se muestra enlace).

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

## Siguiente

1. **Fase 0 (Hermes T1 reducido)**: 1 ancla de estilo + hoja + 12 escenas de cumpleaños a mano, tope 30 generaciones, 3 personas puntúan consistencia. Go/no-go del producto ilustrado.
2. Montar esas 12 escenas en la plantilla → `public/lead-magnet/cumpleanos.pdf` → **primera pieza pública** (reel con el cuento impreso en casa).
3. Desplegar `web/` en Vercel (rama + PR, nunca a main directo) con `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `JOBS_API_SECRET`; probar `/api/books` real.
4. Huecos del catálogo: peinados en 3D, papercraft y acuarela; conjuntos en acuarela (ver `assets/manifest.json` → `huecos`).
