# Plan de trabajo — cuentos

Fuente de verdad del estado y del orden de trabajo. Se actualiza en cada sesión; lo que no está aquí no está en marcha. PRD: `PRD.md` (v0.2). Rama de trabajo: `feat/fase-1-journey-clasico` → PR #1 → `main`.

## 1. Estado real (9 oct 2026, verificado)

**Funciona en la preview** (`https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app`, commit `53f667d`):

- Journey Clásico completo: `/` → `/crear` (quién, su mundo, el libro, edición) → PDF de 13 hojas por impresión del navegador. Recorrido automatizado sin errores de consola ni respuestas 4xx/5xx (sonda del 9 oct).
- Edición ilustrada con pago simulado (`NEXT_PUBLIC_DRY_RUN_PAYMENT=1`): estilo, hoja de personaje, progreso, 12 escenas, PDF.
- Lead magnet `/gratis`, legales en borrador, consentimiento de cookies, 8 tests Playwright en verde en local.
- Logs de runtime de Vercel: sin errores en la última hora.

**No funciona o está a medias:**

| # | Qué | Causa | Visible para el usuario |
|---|---|---|---|
| E1 | Figuras: cuello de la prenda original bajo la cabeza y hueco blanco entre las piernas | Las piezas corregidas (37 PNG + `pieces.json`) están en la carpeta local, no en el repo: no se pueden subir binarios desde aquí | Sí, en todas las escenas de la preview |
| E2 | `/api/books` responde 503 | Falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel | No bloquea el PDF; el enlace «recuperar el cuento» no se guarda |
| E3 | Sin CI | `.github/workflows/ci.yml` no se pudo subir (permiso `workflow`) | No |
| E4 | Ojos, gafas, color de ropa y accesorio no se pintan | Las piezas pintadas solo cubren pelo, piel y prenda | Ya no se ofrecen en el constructor |
| E5 | Solo un estilo (gouache); los otros cinco «Próximamente» | Faltan catálogos | Sí, en el selector |
| E6 | Textos legales con campos `Pending` | Faltan datos del responsable, DPA, email de contacto | Sí, en `/privacidad`, `/condiciones`, `/aviso-legal` |
| E7 | Pago simulado; sin Stripe; sin entrega del PDF ilustrado por email | Fuera de alcance hasta ahora | Sí (etiquetado «Pago de prueba») |

**Errores que ve Álvaro y no están en esta lista:** pendiente de recibir captura o URL + descripción. Entran como E8+ antes de seguir con cualquier otra cosa.

## 2. Objetivo de la v1 (PRD §6 y §10)

Un adulto crea en cinco minutos un cuento de cumpleaños con su hijo como protagonista, lo imprime gratis en casa (Clásico) y, si quiere, paga una edición ilustrada en PDF. Tapa dura después. Una ocasión, un estilo, sin fotos del menor, sin coste de generación antes del pago.

Criterio de «terminado» de la v1: una persona ajena al proyecto, con el enlace, llega al PDF sin ayuda y sin ver nada roto; el pago real cobra y entrega; los legales están completos.

## 3. Bloques de trabajo, en orden

Cada bloque tiene responsable, criterio de hecho y se cierra con evidencia (comando ejecutado, captura revisada) antes de pasar al siguiente. Una cosa a la vez.

### B0. Estabilizar lo que hay (ahora)

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Recoger los errores que ve Álvaro (E8+) y corregirlos uno a uno | Álvaro reporta · Claude corrige | Cada uno reproducido, corregido y verificado en la preview |
| Instalar la app de GitHub de Claude en el repo (o PAT en archivo con `repo` + `workflow`, 1 h) | Álvaro | `git push` desde la sesión funciona |
| Subir piezas corregidas (E1) y `ci.yml` (E3) | Claude | Preview sin cuello ni hueco; CI en verde en el PR |
| `SUPABASE_SERVICE_ROLE_KEY` en Vercel (E2) | Álvaro la introduce en Vercel · Claude verifica | `/api/books` 200; enlace de recuperación funciona en la preview |
| Borrar filas de prueba en `cuentos_*` | Claude | Tablas vacías de datos de prueba |

### B1. Calidad visual (en paralelo a B0, sin dependencias)

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Fondos pintados de las 12 escenas según `docs/ASSETS.md` (empezar por `mesa-tarta`, `parque`, `cama-noche`) | Álvaro genera · Claude integra | Fondo en `assets/raw/gouache/backgrounds/`, script ejecutado, escena revisada en captura |
| Poses `brazos-arriba` y `sentado` para las 8 prendas (16 imágenes) | Álvaro genera · Claude integra | Igual |
| Portada y hoja de personaje con las piezas nuevas | Claude | Captura revisada |
| Segundo estilo (catálogo completo) solo si B0 y B2 están cerrados | Álvaro + Claude | Selector con dos estilos «Disponible» |

### B2. Backend y entrega

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Guardar libro y enlace de recuperación (`/crear?b=`) con Supabase real; borrado a los 30 días | Claude | Test contra la preview; job de borrado probado |
| Email transaccional (enlace al cuento, PDF ilustrado): elegir proveedor (Resend) y clave en Vercel | Álvaro clave · Claude integra | Email recibido en una cuenta de prueba |
| PDF ilustrado generado en servidor (no por impresión del navegador) | Claude | PDF de 13 páginas descargable desde el enlace del email |

### B3. Pago real

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Stripe Checkout (14,90 € Ilustrado), webhook, claves en Vercel | Álvaro cuenta y claves · Claude integra | Pago de prueba en modo test completo; `cuentos_orders` con el pedido |
| Quitar el pago simulado del build de producción | Claude | `NEXT_PUBLIC_DRY_RUN_PAYMENT` solo en preview |

### B4. Legal y confianza

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Rellenar `Pending` de legales (responsable, NIF, email, proveedores, DPA) | Álvaro datos · Claude redacta | Sin `Pending` en el sitio |
| Revisión del texto de devolución en bienes personalizados y de la declaración del tutor | Álvaro (o asesor) | Aprobado |
| `NEXT_PUBLIC_CLARITY_ID` en Vercel (ya hay banner) | Álvaro | Clarity recibe datos tras aceptar |

### B5. Salida

| Tarea | Quién | Hecho cuando |
|---|---|---|
| Merge del PR #1 a `main`; dominio en Vercel | Álvaro aprueba · Claude ejecuta | Producción en dominio propio |
| Prueba con tres personas ajenas (criterio de terminado de §2) | Álvaro | Tres PDFs descargados sin ayuda; lista de fallos |
| Bloque de distribución del PRD (§distro): primer canal y primera semana | Álvaro | Según PRD |

## 4. Reglas de trabajo

1. **Una cosa a la vez.** Se abre una tarea, se cierra con evidencia, se anota aquí. Nada de «ya que estoy».
2. **Rama + PR, nunca `main` directo, nunca `--force`.** Texto por `push_files` desde la sesión; binarios por `git push` con la app de GitHub (hasta entonces, se dejan en la carpeta local y se anota en E1).
3. **Verificación antes de decir «hecho»:** lint, tsc, build, tests, y captura mirada cuando sea visual. Lo no verificado se dice que no está verificado.
4. **Claves:** Álvaro las mete en Vercel o en un archivo local; nunca en el chat. Nada de generación de pago antes del pago del cliente (PRD).
5. **Assets:** Álvaro genera con ChatGPT según `docs/ASSETS.md` y los deja en `assets/raw/`; Claude integra y enseña captura. No se generan imágenes desde la sesión.
6. **Errores:** se reportan con URL + captura + qué se esperaba; entran en la tabla de §1 antes de corregirse.
7. **Copy:** registro adulto, sin diminutivos, sin emojis en interfaz (brief 3).

## 5. Próximos tres pasos

1. Álvaro: lista de errores que ve (captura + URL). Claude: los reproduce y corrige (B0).
2. Álvaro: app de GitHub en el repo. Claude: sube piezas y CI (E1, E3).
3. Álvaro: `SUPABASE_SERVICE_ROLE_KEY` en Vercel. Claude: verifica `/api/books` y limpia datos de prueba (E2).

## 6. Registro de decisiones

- 8 oct: solo ocasiones felices; sin fotos del menor; avatar por rasgos.
- 9 oct: registro adulto en todo el sitio; estética editorial; Fraunces + Geist; verde botella como único acento.
- 9 oct: Clásico e Ilustrado comparten las figuras pintadas; el Ilustrado se diferencia por fondos pintados, poses y tapa dura. Los rasgos que no se pintan (ojos, gafas, color de ropa, accesorio) no se ofrecen.
- 9 oct: assets externos (fondos, poses) los genera Álvaro con ChatGPT; la sesión no genera imágenes de pago.
- 9 oct: Clarity solo tras consentimiento; franja superior, no flotante.
