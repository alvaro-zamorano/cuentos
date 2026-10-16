# ÍNDICE MAESTRO — cuentos

Actualizado: 2026-10-14 · Owner: Álvaro · Fase: B1–B5 hechos (a B5 le faltan las claves), B6 en parte (estilo y copy unidos), B7 pendiente

Mapa para empezar cualquier hilo. Lee esto y `ESTADO.md`; el resto, solo si la tarea lo pide. Los documentos que mandan están en el repo (`docs/`). El Project «Cuentos niños» guarda una copia (`claude/…`); quien cambie uno, actualiza el otro.

## 1. Resumen

- **Qué es:** libros infantiles personalizados, escritos e ilustrados con IA. El padre cuenta la historia con una frase y elige cómo es el niño. Gratis: el cuento, la hoja de personajes, la portada y un PDF casero. De pago: el libro ilustrado (12 páginas, PDF A4) por 14,90 €. La tapa dura vendrá después.
- **Coste:** ≈ 0,10 $ por lead (hoja + portada) y ≈ 1 $ por libro vendido.
- **Repo:** `alvaro-zamorano/cuentos`. Rama de trabajo `feat/fase-1-journey-clasico`; PR #1 hacia `main`, sin unir. El código está en `web/` (Next.js 16).
- **Preview (siempre la última de la rama):** https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app
  - Pública: la protección de despliegues está desactivada.
  - El flujo nuevo está en `/crear`; un libro guardado se abre con `/crear?b=<id>`.
- **Producción:** sale de `main`, que todavía no tiene el flujo nuevo.

## 2. Mapa de documentos

Estado: vigente · histórico (sigue siendo cierto, pero de una etapa anterior) · superado (no leer salvo arqueología).

### Project «Cuentos niños» (`claude/`, copias del repo)

- `00-INDICE.md` — este mapa · vigente
- `00-ESTADO.md` — foco, log de decisiones, hallazgos, preguntas abiertas y próxima sesión · vigente
- `PLAN.md` — decisiones D1–D6, producto (ficha, embudo, reglas de generación), bloques B0–B7, abiertos E#, lista de Álvaro · vigente
- `PAGO.md` — B5: Stripe, Resend, pintar en segundo plano, pasos exactos para las claves · vigente
- `ILUSTRACION.md` — B3–B4: hoja, portada, páginas, control de calidad, PDF; prueba real y costes medidos · vigente
- `PLANIFICADOR.md` — B1: de la ficha al plan del libro; evaluación con 10 fichas · vigente
- `MUESTRA-LUNA.md` — el libro de muestra «Vera y Toby viajan a la Luna» · vigente
- `ESTILO.md` — estilo «La hora del cuento»: referencias, colores, tipografía (Lora + Figtree + Patrick Hand), cambios por paso e implementación · **aprobado e implementado**; unido a la rama de trabajo el 14 oct (PR #2)
- `PROVEEDORES.md` — contratos de encargo, transferencias y papel de cada proveedor, con fuentes (16 oct); respalda `/privacidad` · vigente
- `FASE0.md` — calibración inicial con Nano Banana, la base de D1–D6 · histórico
- `ASSETS.md` — fondos y poses para el compositor de piezas · **superado por D1** (pendiente de retirar del Project)

### Solo en el repo

- `PRD.md` — PRD v0.2: visión, público, precios, legal (§9). Anterior a D1–D6; donde choque, manda `PLAN.md` · histórico
- `README.md` — portada del repo; apunta aquí
- `CLAUDE.md` — instrucciones para hilos de Claude Code en el repo · vigente
- `docs/supabase.md` — proyecto de Supabase, tablas `cuentos_*`, bucket, convención · vigente
- `supabase/migrations/*.sql`, `docs/sql/*.sql` — esquema de la base · vigente
- `docs/GENERATION.md`, `docs/STORY-ENGINE.md`, `docs/PDF.md` — imágenes, motor de historia y PDF del flujo antiguo (Clásico) · histórico
- `docs/AGENT-BRIEF*.md`, `docs/hermes-mision-assets.md` — encargos a agentes del 8–9 oct · histórico

## 3. Masters (qué documento manda en cada tema)

| Tema | Master | Copias o derivados |
|---|---|---|
| Decisiones de producto D1–D6, bloques, abiertos E#, lista de Álvaro | `PLAN.md` | — |
| Log de decisiones, foco, próxima sesión | `ESTADO.md` | PLAN §8 apunta aquí |
| Costes por lead y por libro | `ILUSTRACION.md` (Coste medido) | PLAN, PAGO |
| Pago, emails, segundo plano, variables de B5 | `PAGO.md` | — |
| Todas las variables de entorno | `web/.env.example` | PAGO, PLAN §7 |
| Esquema de la base | `supabase/migrations/` + `docs/sql/` | `docs/supabase.md` |
| Texto del libro de muestra | `web/lib/muestra.ts` | `MUESTRA-LUNA.md` |
| Reglas de trabajo con Álvaro | `PLAN.md` §6 | `CLAUDE.md` |
| Proveedores y sus contratos | `PROVEEDORES.md` | `/privacidad` §7 |

## 4. Bloques

El detalle está en `PLAN.md` §5. Resumen:

- **B0–B4:** hechos.
- **B5:** código hecho y probado; faltan las claves de Stripe y Resend.
- **B6:** landing hecha; falta el Reel.
- **B7:** legales, dominio, prueba con tres personas y unir a `main`.

## 5. Mapa del código (`web/`)

| Qué | Dónde |
|---|---|
| Estilo (tokens, capas, movimiento) | `app/globals.css`, `app/layout.tsx` (fuentes), `components/brand.tsx` (estrella, luna, colina, iconos, `BookCover`), `docs/ESTILO.md` |
| Landing | `app/page.tsx`, `components/landing/SampleFlipper.tsx` (+ `lib/muestra.ts`, `public/muestra/`, miniaturas en `public/muestra/mini/`) |
| Flujo `/crear` (5 pasos) | `app/crear/page.tsx` (cabecera, progreso, «así va su libro», `?b=` y `?idea=`), `components/crear/Step{Idea,Hero,Story,Cast,Book}.tsx`, `BookImage`, `BookLink`, `ui.tsx` (avisos, cinta), `lib/crearStore.ts`, `lib/bookClient.ts` |
| Miniaturas del paso 2 | `components/crear/Tiles.tsx` (las repinta con `lib/recolor.ts`), `lib/crearPicks.ts` (opciones y textos), `public/crear/` (salen de `public/catalog/gouache` con `scripts/crear-thumbs.mjs`) |
| Ficha y plan del libro (B1) | `lib/plan/` (ficha, starters, moderation, rules, prompt, validate, planner, mock, evalCases), `app/api/plan/`, `lib/llm.ts` |
| Dirección de arte y control de calidad | `lib/plan/art.ts`, `lib/plan/qc.ts` |
| Libro: hoja, portada, pago, páginas, vista | `lib/book/service.ts`, rutas `app/api/libro/*` |
| Pintar imágenes (jobs, presupuesto, Gemini) | `lib/generation/{service,adapter,budget,store,postprocess}.ts`, `app/api/generate/run` |
| Segundo plano | `lib/book/background.ts` + `paintLater` en `app/api/libro/_shared.ts` |
| Stripe y Resend | `lib/stripe.ts` (también la renuncia al desistimiento: `waiverAccepted`, metadatos `withdrawal_waiver_*`), `lib/mail.ts`, `app/api/libro/checkout`, `app/api/stripe/webhook` |
| PDF | `lib/pdf/book2.ts` (maqueta), `lib/pdf/text.ts`, `lib/pdf/render.ts` (Chromium), `app/api/libro/pdf` |
| Borrado a 30 días | `lib/purge.ts` (libros, planes, leads sin novedades y emails del gasto), `app/api/cron/purge`, `vercel.json` |
| Legales | `app/{privacidad,condiciones,aviso-legal}`, `components/LegalPage.tsx`, `lib/legal.ts` (titular desde `LEGAL_*`); proveedores en `docs/PROVEEDORES.md` |
| Buscadores | `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts` (solo producción con `SITE_URL`) |
| Salud y pruebas | `app/api/health`; `app/api/dev` (fuera de producción; en Vercel solo con `DEV_TOKEN`, `lib/devAccess.ts`; fuerza Gemini y cuesta dinero) |
| Tests | `tests/unit/*.test.ts` (87), `tests/crear.spec.ts` + `tests/journey.spec.ts` (8 Playwright), `.github/workflows/ci.yml` |
| Flujo antiguo (fuera del embudo por D1; redirige a `/crear` desde el 16 oct, `next.config.ts`) | `app/{clasico,ilustrado,libro,gratis}`, `lib/{story,pieces,arcs,…}`, `app/api/{story,jobs,books,pdf,generate/book,generate/sample}` |

## 6. Cómo trabajar

**Accesos**

- **GitHub:** app de Claude instalada en el repo. Siempre rama + PR; nada directo a `main`.
- **Vercel:** team `wcoach24s-projects`, proyecto `prj_Ldda556jlY1RnT8HmMtgOfDZpnuU`.
  - Claude puede ver despliegues y logs, pero **no crear variables** (403). Las variables las pone Álvaro en Settings → Environment Variables.
- **Supabase:** proyecto compartido con otros productos de Álvaro (`bcicjjkgjgajxbrwmeyf`).
  - Tablas `cuentos_*` con RLS; bucket privado `cuentos`.
  - El conector de Supabase de Claude («Carche») llega a esta misma base por SQL.
  - Los libros de prueba de la preview están en la base real.
- **Claves:** nunca por el chat. Las pone Álvaro en Vercel o en `.env.local`.

**Comprobar antes de decir «hecho»** (desde `web/`)

```
npm ci && npx next typegen
npx tsc --noEmit && npx eslint && npm run test:unit
NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build
NEXT_PUBLIC_DRY_RUN_PAYMENT=1 CI=1 npx playwright test
```

Sin claves en local se usan la memoria del proceso, imágenes `dry-run` y el cuento `mock`: no se gasta nada.

**En la preview**

- `GET /api/health`: qué está configurado (sin enseñar valores).
- `GET /api/cron/purge?dry=1`: qué borraría el cron.
- `/api/dev?task=…`: pruebas con Gemini y Claude de verdad (`models`, `plan`, `b3start`, `run`, `view`, `revise`, `pages`). Cuestan dinero: pocas tomas. En Vercel solo responde con `DEV_TOKEN` (en `?token=` o en la cabecera `x-dev-token`); sin la variable, 404.

**Libros de prueba reales** (caducan hacia el 12 nov; el cron de producción los borrará porque la base es la misma)

- Mateo `g2ajgsd2ut`: pagado, 12 páginas reales.
- Lucía `3gnfu628ew`: hoja y portada.
- Inés `u54zp2tt67`, Daniela `5dpfckxg9e`, Hugo `27fjm8hyd9`: hoja y portada.

**Trampas conocidas**

- `pkill -f next-server` mata también la propia shell: busca el PID con `ps` y usa `kill <PID>`.
- Construir con `npm run build`, no con `npx next build`: el `prebuild` genera `public/pieces/` (no está en git). Sin las piezas, el test de `/gratis` falla con 404.
- Las clases propias de `globals.css` van en `@layer base` o `@layer components`. Fuera de capa ganan a cualquier utilidad de Tailwind, y `p-6` o `outline-none` dejan de hacer efecto.
- Los scripts que importan módulos `server-only` se lanzan con `node --conditions=react-server --import tsx`. Si usan `await` en el nivel superior, el archivo tiene que ser `.mts`.
- Playwright: un localizador que encuentra dos elementos falla al instante (modo estricto). Hay que buscar por nombre o por `data-testid`.
- La preview se puede pedir con `curl` directamente. La herramienta de Vercel para leer URLs va de una en una y no sirve para binarios.
- Los modelos 5.x de Anthropic no aceptan `temperature`; el razonamiento se controla con `thinking` y `effort` (`lib/llm.ts`).

**Reglas de Álvaro**

- Castellano, directo y conciso.
- Distinguir lo propuesto, lo hecho y lo comprobado.
- En generaciones de pago, pocas tomas.
- Nada sensible, destructivo o externo sin su visto bueno.

## 7. Archivo (superados — no leer salvo arqueología)

- `ASSETS.md`, `docs/hermes-mision-assets.md` — superados por D1 (13 oct): ya no hay piezas ni escenas fijas.
- `docs/GENERATION.md`, `docs/STORY-ENGINE.md`, `docs/PDF.md` — describen el flujo Clásico, fuera del embudo. Los sustituyen `ILUSTRACION.md`, `PLANIFICADOR.md` y `lib/pdf/book2.ts`.
