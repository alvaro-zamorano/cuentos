# Plan de trabajo — cuentos

Fuente de verdad del estado y del orden de trabajo. Se actualiza en cada sesión; lo que no está aquí no está en marcha. PRD: `PRD.md` (v0.2). Rama de trabajo: `feat/fase-1-journey-clasico` → PR #1 → `main`.

## 1. Estado real (9 oct 2026, tarde, verificado)

**Funciona en la preview** (`https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app`, commit `2e091c3`):

- Journey Clásico completo: `/` → `/crear` (quién, su mundo, el libro, edición) → PDF de 13 hojas por impresión del navegador. Recorrido automatizado sin errores de consola salvo el 503 de E2.
- Figuras pintadas correctas en la preview (cabeza unida al cuerpo, sin cuello de la prenda original, sin hueco entre las piernas): las piezas se generan en el build de Vercel desde el catálogo (`web/scripts/pieces-build.mjs`, `prebuild`), así que ya no dependen de subir binarios.
- Tres estilos disponibles: gouache, plano (flat) y lápiz de colores. Edición ilustrada con pago simulado: estilo, hoja de personaje, progreso, 12 escenas, PDF.
- 12 escenas vectoriales rehechas (brief 4). Lead magnet `/gratis`, legales en borrador, consentimiento de cookies, 8 tests Playwright en verde.

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

Resueltos hoy: E1 (figuras) por generación en build.

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

### B2. Motor de historia

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Paso «Detalles reales» en `/crear` (3–5 campos de texto libre, con ejemplos) | Claude | En la preview |
| Generación de las 12 páginas (texto + prompt de escena) con esqueleto de beats, validación y reintento; clave del LLM en Vercel | Álvaro clave · Claude | Tres cuentos de prueba leídos y distintos entre sí |
| Edición de texto por el padre y guardado del cuento | Claude | Test Playwright |

### B3. Muestra y conversión

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Hoja de personaje generada (1 imagen) tras el email; 1 página ilustrada real; resto bloqueado con el precio | Claude | Flujo completo en la preview con coste registrado por lead |
| Registro de gasto por lead y tope diario en Supabase | Claude | Tabla `cuentos_generation_jobs` con coste; el tope corta |

### B4. Pago y entrega

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Stripe Checkout + webhook; generación de las 13 imágenes restantes tras el pago, con progreso y aprobación página a página | Álvaro claves · Claude | Pago de prueba completo; libro generado |
| Email transaccional con enlace y PDF generado en servidor | Álvaro clave (Resend) · Claude | Email recibido con PDF de 13 páginas |

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

## 5. Próximos tres pasos

1. Álvaro: clave del proveedor de imagen (Gemini o OpenAI) en Vercel y en `web/.env.local`; app de GitHub en el repo; `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
2. Claude: Fase 0 (1 hoja + 3 páginas) y captura comparada con coste.
3. Los dos: decidir proveedor y precio; Claude actualiza PRD y empieza B2.

## 6. Registro de decisiones

- 8 oct: solo ocasiones felices; sin fotos del menor; avatar por rasgos.
- 9 oct: registro adulto en todo el sitio; estética editorial; Fraunces + Geist; verde botella como único acento.
- 9 oct: Clásico e Ilustrado comparten las figuras pintadas; el Ilustrado se diferencia por fondos pintados, poses y tapa dura. Los rasgos que no se pintan (ojos, gafas, color de ropa, accesorio) no se ofrecen.
- 9 oct: assets externos (fondos, poses) los genera Álvaro con ChatGPT; la sesión no genera imágenes de pago.
- 9 oct: Clarity solo tras consentimiento; franja superior, no flotante.
- 9 oct (tarde): la v1 pasa de plantillas a motor de generación (historia única por LLM + ilustración por character sheet) con gasto antes del pago acotado (≤ 0,10 € por lead, tras email). Fondos y poses por ChatGPT quedan como respaldo.
- 9 oct (tarde): las piezas pintadas se generan en el build (`prebuild`) desde el catálogo; `web/public/pieces/` deja de versionarse.
