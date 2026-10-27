# Generación de imágenes — edición ilustrada

Cómo se pintan la muestra (antes del pago) y el libro (después), y qué camino usar para ejecutar los jobs.

## Embudo

avatar → detalles → cuento completo (gratis) → email (paso 4, con la declaración del tutor) → `/ilustrado`: hoja de personaje + página 9 (`mesa-tarta`) → las otras 11 bloqueadas con su texto y el precio → pago → 11 páginas + portada → PDF.

Antes del pago se pintan 2 imágenes por lead (más hasta 2 «Otra versión de la hoja»), todas contra el presupuesto del lead (`LEAD_CAP_CENTS`, 20 c por defecto). Tras el pago, los jobs llevan `paid: true` (sin tope por lead; el de libro `MAX_COST_CENTS_PER_BOOK` sigue, y el diario `DAILY_CAP_CENTS` solo si el cobro no es real: desde el 26 oct lo pintado para libros cobrados de verdad no cuenta en él).

## Rutas (`web/app/api/generate/*`, lógica en `web/lib/generation/service.ts`)

| Ruta | Qué hace |
|---|---|
| `POST /sample` `{ bookId \| email, styleId, sheetVersion? }` | Comprueba `canSpend` (lead = email) y crea los jobs `sheet` y `sample` si no existen para su huella. Con `sheetVersion`, una versión más de la hoja (máx. 3 en total). No ejecuta nada. |
| `POST /run` `{ jobId }` | Ejecuta UN job: lo reclama (`running`, bloqueo optimista por `updated_at`), llama al adaptador, sube el PNG a `cuentos/books/<book_id>/<kind>-<n>-<versión>-<huella>.png`, guarda ruta y coste, `recordSpend`, `done`. Si falla, `failed` con el mensaje recortado. `maxDuration = 60`. |
| `GET /status?bookId=` | Jobs del libro con estado y URL firmada (10 min) para los que tienen imagen. Incluye `provider`. |
| `POST /book` `{ bookId, styleId, sheetJobId?, page? }` | Tras el pago (pedido `paid` en `cuentos_orders`, o `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`): páginas que faltan + portada. La página 9 de la muestra y la hoja no se repiten. Con `page`, la otra versión de esa página (máx. 1). |

**Nada se genera dos veces:** cada job lleva `job_key = <kind>:<n>:<versión>:<huella>` (`lib/generation/keys.ts`) y hay un índice único `(book_id, job_key)`. La huella de la hoja es estilo + rasgos + edad; la de una página añade acompañante, historia (`inputHash`) y su prompt de escena. Editar el texto no cambia ninguna huella. Si cambian rasgos, estilo o historia después de pintar la muestra, la interfaz avisa antes de pintar otra.

**Dry-run** (`GENERATION_PROVIDER=dry-run`, por defecto): el adaptador no devuelve imagen; el job queda `done` con un placeholder y la interfaz pinta la escena vectorial con la etiqueta «Vista previa sin ilustrar (modo de prueba)».

**Sin Supabase:** con dry-run, los jobs viven en memoria del proceso (`memoryStore`): sirve para desarrollo, tests y la preview sin service role; se pierde al reiniciar y no se comparte entre instancias de Vercel (en dry-run no cuesta nada). Con un proveedor de pago y sin Supabase, las rutas responden 503.

## Quién ejecuta los jobs

| Camino | Cuándo |
|---|---|
| **Cliente + `/api/generate/run`** (por defecto) | Producción en Vercel sin máquinas propias. `useGeneration(bookId)` (`web/lib/useGeneration.ts`) consulta `status` cada 2 s y lanza `run` para los jobs pendientes de la huella actual, de uno en uno. Si el usuario cierra la pestaña, se para; al volver, retoma desde `status`. |
| **`scripts/worker.ts`** (Mac Mini) | Para terminar libros pagados aunque el usuario cierre la pestaña, o para vaciar una cola acumulada (tope diario). Procesa los jobs con `job_key` con la misma `runJob` (mismo bloqueo, presupuesto y rutas) y los antiguos de `/api/jobs` con su lógica. Puede correr a la vez que el cliente: solo uno reclama cada job. |

Un job `running` sin cambios en 2 minutos (función cortada) se puede reclamar otra vez, hasta 2 intentos. Un `failed` se reabre al volver a pedir la muestra o el libro, también hasta 2 intentos.

## Datos

SQL (aplicado el 11 oct): `supabase/migrations/0010_cuentos_10_jobs_b3.sql` (tipos `sample|page|cover`, estado `failed`, columnas `paid`, `storage_path`, `variant`, `job_key` e índice único). Tipos actualizados a mano en `web/lib/supabase/types.ts`.

En el borrador (`Draft.illustration`): `bookId`, `sampleKey`, `sampleJobId`, `sheetJobId` (versión elegida), `sheetVersions`, `pageVersions`, y `pages[n].variant` = versión elegida de cada página.

## Verificación

`npm run test:unit` (huellas, invalidación, idempotencia, bloqueo optimista, presupuesto con la muestra) y `npm test` (journey completo en dry-run contra las rutas reales, con almacén en memoria). `CAPTURAS=1` guarda las capturas en `web/capturas/v7/`.
