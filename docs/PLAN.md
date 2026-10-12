# Plan de trabajo — cuentos

Fuente de verdad del estado y del orden de trabajo. Se actualiza en cada sesión; lo que no está aquí no está en marcha. PRD: `PRD.md` (v0.2). Rama de trabajo: `feat/fase-1-journey-clasico` → PR #1 → `main`.

## 1. Estado real (9 oct 2026, tarde, verificado)

**Funciona en la preview** (`https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app`, commit `4c77ce7`, 11 oct):

- Motor de historia (proveedor `mock`) y embudo de muestra/paywall (dry-run): ver B2 y B3.

- Journey Clásico completo: `/` → `/crear` (quién, su mundo, el libro, edición) → PDF de 13 hojas por impresión del navegador. Recorrido automatizado sin errores de consola salvo el 503 de E2.
- Figuras pintadas: las piezas se generan en el build de Vercel desde el catálogo (`web/scripts/pieces-build.mjs`, `prebuild`). Desde el 12 oct la cabeza se escala y centra por las pupilas (antes por la anchura de piel, que incluía pelo: la cabeza medía entre 0,33 y 0,54 del original según el peinado); la altura sigue por la base del cuello. Verificado con rejillas 12 peinados × 8 prendas en gouache, plano y lápiz, y en `/crear`.
- Tres estilos disponibles: gouache, plano (flat) y lápiz de colores. Edición ilustrada con pago simulado: estilo, hoja de personaje, progreso, 12 escenas, PDF.
- 12 escenas vectoriales rehechas (brief 4). Lead magnet `/gratis`, legales en borrador, consentimiento de cookies, 10 tests Playwright y 47 unitarios en verde (12 oct, en local).

**No funciona o está a medias:**

| # | Qué | Causa | Visible |
|---|---|---|---|
| E2 | `/api/books` responde 503 | Falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel | El enlace «recuperar el cuento» no se guarda; el PDF sale igual |
| E3 | Sin CI | `.github/workflows/ci.yml` no se pudo subir (permiso `workflow`); está en la carpeta local | No |
| E4 | Ojos, gafas, color de ropa y accesorio no se pintan | Las piezas solo cubren pelo, piel y prenda | Ya no se ofrecen |
| E5 | 3D suave, papercraft y acuarela «Próximamente» | Catálogo incompleto: a 3D y papercraft les falta `hair/` (12 peinados); a acuarela, `hair/` y `outfit/` (8 prendas). Con eso el build los activa solo | Sí, en el selector |
| E6 | Legales con campos `Pending` | Faltan datos del responsable, DPA, email de contacto | Sí |
| E7 | Pago simulado; sin Stripe; sin entrega por email | Fuera de alcance hasta ahora | Sí («Pago de prueba») |
| E8 | PNG antiguos de `web/public/pieces/gouache` siguen en el repo | Ahora es carpeta de build (gitignore); borrar del índice cuando haya `git push` desde la sesión | No (el build los sobrescribe) |
| E9 | Restos menores en las figuras | Pelo largo cortado en recto a la altura de los hombros (el busto del catálogo acaba ahí); trazos sueltos junto al cuello en lápiz; manos casi blancas con piel «muy clara» (recolor); catálogo de prendas a 400 px de alto (≈ 3,4× de ampliación en el PDF A4) | Sí, de cerca e impreso |
| E10 | Nada real se ha ejecutado todavía | En Supabase (12 oct): 1 libro (8 oct), 0 historias en caché, 0 gasto. La preview corre con historia `mock` e imágenes `dry-run` | No (se ve igual que si funcionara) |

Resueltos: E1 (figuras) por generación en build (9 oct); reabierto el 12 oct (cabezas de tamaño distinto según el peinado, pestaña de la mandíbula original junto al cuello) y corregido por encaje en pupilas.

## 2. Objetivo de la v1 y cambio de rumbo (9 oct, tarde)

Un adulto crea en cinco minutos un cuento con su hijo como protagonista, lo imprime gratis en casa (Clásico) y, si quiere, paga una edición ilustrada. Sin fotos del menor.

**Cambio acordado:** lo construido hasta hoy es un motor de plantillas (12 escenas fijas, texto con el nombre sustituido, figuras recortadas). La v1 pasa a ser un **motor de generación con control de coste**:

- **Historia única** por niño: el padre aporta 3–5 detalles reales en texto libre; un LLM escribe las 12 páginas sobre un esqueleto de beats fijo y devuelve texto + prompt de escena por página; validación automática (longitud por edad, solo los nombres dados, tono feliz). Se enseña completa antes del pago y se puede editar. Coste ≈ 0,01–0,05 €.
- **Ilustración consistente por character sheet**: del avatar sale un prompt canónico + una hoja de personaje; cada página se genera con la hoja como referencia de imagen y el ancla de estilo. El texto nunca va dentro de la imagen.
- **Gasto antes del pago, acotado**: texto siempre; tras el email, hoja de personaje + 1 página ilustrada real (≈ 0,08 €); el libro completo solo tras cobrar (≈ 0,5–1,5 € según modelo). Máximo 2 «otra versión» de la hoja gratis; tope diario de gasto; nada se genera dos veces.
- **Clásico gratis** se mantiene como lead magnet: historia única + escenas de código (coste 0).

Esto sustituye la regla del PRD «nada con coste antes del pago» por «≤ 0,10 € por lead, solo tras email, con tope diario». El PRD se actualiza cuando la Fase 0 confirme el proveedor.

Criterio de «terminado» de la v1: una persona ajena, con el enlace, llega al PDF sin ayuda y sin ver nada roto; el pago real cobra y entrega; los legales están completos.

## 3. Bloques de trabajo, en orden

Una cosa a la vez; cada tarea se cierra con evidencia.

### B0. Estabilizar (en curso)

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Errores que vea Álvaro (URL + captura) | Álvaro reporta · Claude corrige | Reproducido, corregido, verificado en la preview |
| App de GitHub de Claude en el repo (o PAT en archivo con `repo` + `workflow`) | Álvaro | `git push` desde la sesión funciona → E3 y E8 |
| `SUPABASE_SERVICE_ROLE_KEY` en Vercel | Álvaro · Claude verifica | `/api/books` 200 (E2) |

### B1. Fase 0 — prueba real de consistencia (decide el motor)

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Clave del proveedor de imagen (recomendado Gemini «Nano Banana»; alternativa gpt-image-1) en Vercel y en `.env.local` | Álvaro | La clave existe; nadie la ve en el chat |
| Generar 1 hoja de personaje + 3 páginas de un mismo niño en gouache; mirar si la cara y la ropa aguantan; anotar coste real por imagen | Claude genera (≤ 6 imágenes) · los dos juzgan | Captura comparada y coste anotado aquí |
| Decidir proveedor, precio del Ilustrado y qué se enseña gratis | Álvaro | Decisión en §6 |

### B2. Motor de historia — hecho con proveedor mock (11 oct, `ad647f2`)

| Tarea | Quién | Estado |
|---|---|---|
| Paso «Lo que solo tú sabes» en `/crear` (2–5 detalles de texto libre) | Claude | Hecho; en la preview |
| Esqueleto de 12 beats, validación (longitud por franja, nombres, lista negra, detalles presentes), reintento y caída al arco | Claude | Hecho; 17 tests unitarios |
| Proveedores `mock` (determinista), `anthropic`, `openai` por `STORY_PROVIDER`; `/api/story` con límite por IP y caché en `cuentos_stories` (tabla creada) | Claude | Hecho; `/api/story` responde en la preview con `mock` |
| Edición de texto, «Escribirlo de otra manera» (máx. 2), portada y dedicatoria del cuento generado | Claude | Hecho; Playwright 9/9 |
| Probar con proveedor real: `STORY_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` en Vercel (o `openai` + `OPENAI_API_KEY`); leer tres cuentos | Álvaro clave · los dos leen | Pendiente de clave |

Ver `docs/STORY-ENGINE.md`.

### B3. Muestra y conversión — hecho en dry-run (11 oct, `4c77ce7`)

| Tarea | Quién | Estado |
|---|---|---|
| Email → hoja de personaje + página 9 (`mesa-tarta`) → 11 páginas bloqueadas con precio → pago simulado → libro; «Otra versión» de la hoja (máx. 3) y de página (máx. 2) | Claude | Hecho; Playwright en verde contra las rutas reales con almacén en memoria |
| Presupuesto por lead (`LEAD_CAP_CENTS`, 20 c), por día y por libro; `cuentos_spend` y `cuentos_generation_jobs` (SQL aplicado); nada se genera dos veces (`job_key` único) | Claude | Hecho |
| Adaptador Gemini (`gemini-images`) y OpenAI; personaje canónico; guion de la Fase 0 (`web/scripts/fase0.mjs`) | Claude | Hecho; espera clave |
| Probar con proveedor real (Fase 0) | Álvaro clave · los dos juzgan | Pendiente de clave |

Ver `docs/GENERATION.md`.

### B4. Pago y entrega

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Stripe Checkout + webhook; generación de las 13 imágenes restantes tras el pago, con progreso y aprobación página a página | Álvaro claves · Claude | Pago de prueba completo; libro generado |
| PDF generado en servidor (`/api/pdf`, puppeteer + pdf-lib; `docs/PDF.md`) | Claude | Hecho y verificado en Vercel (11 oct, `37d0d36`): 13 páginas A4, 2,9 MB, 26 s en frío; test con `pdfinfo` |
| Email transaccional con enlace y PDF adjunto | Álvaro clave (Resend) · Claude | Email recibido con PDF de 13 páginas |

### B5. Legal, salida y distribución

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Rellenar `Pending` de legales; devolución en bienes personalizados; Clarity ID | Álvaro datos · Claude | Sin `Pending` |
| Merge a `main`, dominio, prueba con tres personas ajenas | Álvaro · Claude | Tres PDFs sin ayuda |
| Bloque de distribución del PRD | Álvaro | Según PRD |

Fuera de la v1 (se mantiene como respaldo y Clásico): fondos pintados y poses por ChatGPT (`docs/ASSETS.md`), catálogos de los estilos que faltan (E5).

## 4. Reglas de trabajo

1. **Una cosa a la vez.** Se abre una tarea, se cierra con evidencia, se anota aquí.
2. **Rama + PR, nunca `main` directo, nunca `--force`.** Texto por `push_files` desde la sesión; binarios por `git push` con la app de GitHub. Lo derivado (piezas) se genera en el build, no se versiona.
3. **Verificación antes de decir «hecho»:** lint, tsc, build, tests, captura mirada si es visual.
4. **Claves:** Álvaro las mete en Vercel o en `.env.local`; nunca en el chat.
5. **Generación de pago:** solo en Fase 0 (≤ 6 imágenes) y en pruebas acordadas; cada prueba con coste anotado. Nada de tomas de más.
6. **Errores:** URL + captura + qué se esperaba; entran en §1 antes de corregirse.
7. **Copy:** registro adulto, sin diminutivos, sin emojis en interfaz.

## 5. Lista de Álvaro (11 oct)

Ninguna clave por el chat: a Vercel (proyecto `cuentos` → Settings → Environment Variables, Production y Preview) o a un archivo local.

Ahora (desbloquean):
1. App de GitHub de Claude en el repo `cuentos` (o PAT fine-grained de 1 h en archivo: Contents + Workflows lectura/escritura) → CI y limpieza de PNG.
2. `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → service_role) en Vercel + Redeploy → `/api/books`.
3. `GEMINI_API_KEY` (Google AI Studio; límite de gasto en Google Cloud) o `OPENAI_API_KEY` en Vercel → Fase 0.
4. `ANTHROPIC_API_KEY` (o la de OpenAI) en Vercel → historia real; hasta entonces, simulada.
5. Revocar el PAT antiguo y borrar `github-token.rtf`.

Cuando pueda: 6. datos legales (responsable, NIF, domicilio, email de contacto/privacidad, autónomo o sociedad); 7. `NEXT_PUBLIC_CLARITY_ID`; 8. decisiones tras la Fase 0 (proveedor, precio 14,90/19,90, qué se enseña gratis).

Más adelante (B4): 9. Stripe test (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); 10. Resend (`RESEND_API_KEY`, dominio verificado).

Claude, sin claves: motor de historia con adaptador simulado, prompts de personaje y escena, embudo de muestra con imágenes simuladas, contabilidad de gasto, PDF en servidor, limpieza de datos de prueba.

## 6. Registro de decisiones

- 8 oct: solo ocasiones felices; sin fotos del menor; avatar por rasgos.
- 9 oct: registro adulto en todo el sitio; estética editorial; Fraunces + Geist; verde botella como único acento.
- 9 oct: Clásico e Ilustrado comparten las figuras pintadas; el Ilustrado se diferencia por fondos pintados, poses y tapa dura. Los rasgos que no se pintan (ojos, gafas, color de ropa, accesorio) no se ofrecen.
- 9 oct: assets externos (fondos, poses) los genera Álvaro con ChatGPT; la sesión no genera imágenes de pago.
- 9 oct: Clarity solo tras consentimiento; franja superior, no flotante.
- 9 oct (tarde): la v1 pasa de plantillas a motor de generación (historia única por LLM + ilustración por character sheet) con gasto antes del pago acotado (≤ 0,10 € por lead, tras email). Fondos y poses por ChatGPT quedan como respaldo.
- 11 oct: motor de historia en producción con `mock`; el proveedor real se activa por variable de entorno sin tocar código. Los nombres que el adulto escribe en los detalles cuentan como permitidos.
- 9 oct (tarde): las piezas pintadas se generan en el build (`prebuild`) desde el catálogo; `web/public/pieces/` deja de versionarse.
