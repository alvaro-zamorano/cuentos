# Brief 2 — `cuentos` · Fase 2 visible en dry-run, lead magnet, legal, calidad

Fecha: 8 oct 2026. Repo `alvaro-zamorano/cuentos`, rama `feat/fase-1-journey-clasico` (PR #1 abierto, draft). Working tree: `/home/claude/repo-cuentos`. Lee `PRD.md` §6–§7, `README.md` y `docs/AGENT-BRIEF.md` antes de empezar. No repitas lo ya hecho.

## Objetivo

Que el prototipo se vea **entero** sin gastar en generación: el padre puede llegar hasta un libro "ilustrado" en modo dry-run y descargarlo, y el producto tiene página de lead magnet, textos legales, tests y CI.

## A. Edición ilustrada en dry-run (prioridad 1)

Flujo post-"pago" (el pago aún no existe: en dry-run, el botón "Ilustrado" lleva a un paso "Pago simulado" claramente etiquetado como tal, activo solo si `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`).

1. **Estilo**: pantalla con las 6 anclas (`assets/styles.json`, imágenes de las anclas copiadas a `web/public/styles/<id>.jpg` a ≤1200 px). Selección → `draft.styleId`.
2. **Hoja de personaje**: pantalla "Así va a ser {nombre}" que muestra la hoja. En dry-run la hoja se compone en cliente a partir de los recortes del catálogo del estilo elegido (pelo, piel, ojos, gafas, outfit) en una cuadrícula tipo turnaround; si falta una categoría en ese estilo (ver `assets/manifest.json`, huecos), usa el recorte del estilo más parecido y márcalo con una etiqueta "provisional". Botones: Aprobar / Cambiar rasgos (vuelve al paso 1). La aprobación crea un job `sheet` en `/api/jobs` si hay Supabase, y si no, sigue en cliente.
3. **Progreso**: pantalla con 12 casillas que se van rellenando. En dry-run el adapter devuelve por página la imagen del ancla del estilo (recortada a 3:2) con el avatar del catálogo superpuesto en la zona de la escena; cada "página" tarda 300–800 ms simulados. Texto honesto en pantalla: "Vista previa de demostración: las ilustraciones finales se generan tras el pago".
4. **Preview ilustrado**: mismo componente de preview que el Clásico pero con la imagen de cada página; regenerar página (en dry-run cambia a otra variante determinista). Editar texto sigue funcionando.
5. **PDF ilustrado**: `/libro?edition=illustrated&print=1` usando las imágenes; misma plantilla A4; verifica con Playwright que salen 13 páginas.
6. Todo el estado del libro ilustrado persiste en `localStorage` (y en `cuentos_books.draft` cuando hay Supabase).

## B. Lead magnet y legal (prioridad 2)

- `/gratis`: landing corta del lead magnet con un cuento demo (avatar fijo, "Lucas", perro Toby, dinosaurios), botón "Descargar en PDF" que pide email + consentimiento (reutiliza el formulario de `/crear`) y abre `/libro?demo=1&print=1`. Sin PDF estático binario: se imprime desde la página.
- `/privacidad`, `/condiciones`, `/aviso-legal`: plantillas en castellano con los puntos del PRD §9 (datos del menor, declaración del comprador, borrado a 30 días, proveedores con DPA, consentimiento de marketing separado, exclusión del desistimiento para bienes personalizados art. 103.c TRLGDCU, IVA). Cabecera visible: "Borrador pendiente de revisión legal". Enlazadas desde el footer y desde el formulario de email.
- Footer común con enlaces legales.

## C. Calidad (prioridad 3)

- `web/tests/journey.spec.ts` con Playwright (npm, `@playwright/test`): recorre Clásico completo y el Ilustrado en dry-run. Mockea `/api/books` cuando no hay Supabase.
- `.github/workflows/ci.yml`: en cada PR, `npm ci`, `npm run build`, `npx playwright install --with-deps chromium`, `npm test`. Como no hay `package-lock.json` en el repo, genera uno y súbelo (es texto; sí entra por push_files aunque sea grande: divídelo en un lote propio).
- Microsoft Clarity: añade el snippet en `app/layout.tsx` leyendo `NEXT_PUBLIC_CLARITY_ID` (sin valor en el repo). Documenta en README.
- `npm run lint` sin errores (arregla los dos `set-state-in-effect` que quedaron).

## D. Entrega

- Commits en la rama, con las líneas de atribución del sistema. Nunca a `main`, nunca `--force`.
- Publica con `mcp__github__push_files` en lotes ≤40 archivos (carga los tools con ToolSearch `select:mcp__github__push_files,mcp__github__get_file_contents,mcp__github__update_pull_request`). Antes de cada lote, comprueba con `get_file_contents` que no pisas un archivo cambiado en remoto (la rama recibió un commit con 340 PNG desde fuera: no toques `web/public/catalog`).
- Binarios nuevos (las 6 anclas en `web/public/styles/`): no entran por push_files. Deja las anclas también en un `styles.zip` y envíalo con `SendUserFile`; en el informe di que hay que añadirlas desde la máquina de Álvaro. Haz que la app funcione aunque falten (fallback a un degradado con el nombre del estilo).
- Actualiza la descripción del PR #1 con `update_pull_request`: qué hay, qué se verificó, qué queda, terminada con la atribución del sistema.
- Informe final ≤400 palabras, sin adjetivos: hecho y verificado (comandos y salidas), decisiones, pendiente.

## Reglas

Nada de generación de pago. Ninguna clave real. No afirmes que algo funciona sin haberlo ejecutado y visto. No amplíes alcance (ni Stripe real, ni POD, ni más ocasiones).
