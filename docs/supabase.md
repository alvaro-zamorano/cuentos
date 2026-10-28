# Supabase — `cuentos`

Proyecto compartido con otros productos de Álvaro (`https://bcicjjkgjgajxbrwmeyf.supabase.co`). Convención: tablas en `public` con prefijo **`cuentos_`** y RLS activado. Nada de este producto toca tablas sin ese prefijo.

## Migraciones

Aplicadas en la base real (vía MCP `apply_migration`, con el visto bueno de Álvaro) todas; la 0013 y la 0014, el 27 oct, y la 0015, el 28 oct. Aplicadas en orden sobre una base vacía, la reconstruyen igual: `web/tests/unit/migraciones.test.ts` las pasa por un Postgres en memoria (PGlite) y compara columnas, restricciones, índices, triggers y RLS con `web/tests/unit/fixtures/esquema-cuentos.json`, leído de la base real el 27 oct. Una migración nueva se añade aquí con el número siguiente, se aplica en Supabase y se actualizan ese archivo y `web/lib/supabase/types.ts`. Hasta el 27 oct, cuatro vivían sueltas en `docs/sql/` y `cuentos_stories` no estaba en el repo (auditoría 26 oct, I14).

| Archivo | Nombre en Supabase | Aplicada | Qué hace |
|---|---|---|---|
| `0001_cuentos_1_tablas.sql` | `cuentos_1_tablas` | 8 oct | Leads, libros, pedidos, trabajos y assets; índices, trigger `updated_at`, RLS y lectura pública solo en `cuentos_assets` |
| `0002_cuentos_2_storage.sql` | `cuentos_2_storage` | 8 oct | Bucket `cuentos` **privado** (sin políticas: solo service role) |
| `0003_cuentos_3_assets_seed.sql` | `cuentos_3_assets_seed` | 8 oct | 6 anclas y 340 recortes en `cuentos_assets` (`scripts/assets_build.py`) |
| `0004_cuentos_4_outfit_jersey.sql` | `cuentos_4_outfit_jersey` | 8 oct | El conjunto O03 pasa de `azul` a `jersey` |
| `0005_cuentos_5_impreso.sql` | `cuentos_5_impreso` | 18 oct | Dirección, estado de imprenta, id de Gelato, seguimiento y marcas de email en `cuentos_orders` |
| `0006_cuentos_6_feedback.sql` | `cuentos_6_feedback` | 18 oct | `cuentos_feedback`: motivos de «Otra versión» y avisos |
| `0007_cuentos_7_seguimiento.sql` | `cuentos_7_seguimiento` | 25 oct | `cuentos_orders.print_info` (página de seguimiento) |
| `0008_cuentos_8_stories.sql` | `cuentos_stories` | 11 oct | `cuentos_stories`: cuentos escritos (caché por huella) |
| `0009_cuentos_9_spend.sql` | `cuentos_spend` | 11 oct | `cuentos_spend`: gasto por lead y por día |
| `0010_cuentos_10_jobs_b3.sql` | `cuentos_generation_jobs_b3` | 11 oct | Trabajos `sample`, `page` y `cover`; estado `failed`; `paid`, `storage_path`, `variant` y `job_key` único por libro |
| `0011_cuentos_11_jobs_portrait.sql` | `cuentos_generation_jobs_portrait` | 25 oct | Trabajos `portrait` |
| `0012_cuentos_12_variant_hasta_4.sql` | `cuentos_8_variant_hasta_4` | 25 oct | Hasta 4 versiones por página |
| `0013_cuentos_13_email_norm.sql` | `cuentos_13_email_norm` | 27 oct | Límite de cuentos gratis (I7): `cuentos_books.email_norm` (generada, con índice), `free_claimed_at`, la tabla `cuentos_locks` y la función `cuentos_email_norm` |
| `0014_cuentos_14_una_tapa_dura.sql` | `cuentos_14_una_tapa_dura` | 27 oct | Como mucho una tapa dura pagada por libro y entorno (cobro real o de prueba): la red de la base si el bloqueo de cobros no bastara |
| `0015_cuentos_15_novedades.sql` | `cuentos_15_novedades` | 28 oct | Novedades: fecha y texto del consentimiento (`marketing_at`, `marketing_text`), llave de baja (`unsubscribe_token`, única), `unsubscribed_at` y el buzón (`email_norm`, generada como en `cuentos_books`) en `cuentos_leads` |

La 0013 se aplicó antes de desplegar el código que la usa (también la preview: la base es la misma). Solo añade, así que el código de antes no la nota. Después de aplicarla, el esquema leído de la base real coincide con `esquema-cuentos.json` (columnas, restricciones, funciones, índices, políticas, RLS y triggers) y marcó como empezados los 22 libros que ya tenían hoja.

Las 0008 a 0010 se aplicaron antes que la 0005 (el orden de los números es el del repo, no el de la base). No dependen de ella, así que en una base nueva el resultado es el mismo.

Los nombres de los archivos no son las versiones con que constan en la base (allí son marcas de tiempo, como `20261011123108`). Se aplican con el MCP `apply_migration`. Antes de usar la CLI de Supabase contra este proyecto (`supabase db push`, Branching), hay que alinearlas con `supabase migration repair`: si no, la CLI las daría todas por pendientes y la 0001 y la 0003 fallarían.

## Tablas

- `cuentos_leads` — email, marketing (consentimiento LSSI separado), edition, source. Único por `(email, edition)`. Desde la 0015: cuándo y con qué texto se marcó la casilla (`marketing_at`, `marketing_text`), la llave del enlace de baja (`unsubscribe_token`), `unsubscribed_at` y el buzón (`email_norm`). Lo escribe `web/lib/marketing.ts`; la baja es `/baja?t=…` (botón) y `POST /api/baja` (también la baja en un clic de los gestores de correo, `List-Unsubscribe`). La baja vale para todo el buzón y volver a marcar la casilla no la deshace: el alta después de una baja será con la confirmación por email, que se hará antes del primer envío.
- `cuentos_books` — `public_id` corto para `/crear?b=<public_id>`, `draft` jsonb, edition, status, email, `expires_at` (30 días; se alarga al pagar). `updated_at` lo pone un trigger: el guardado condicional del borrador se apoya en él. Desde la 0013: `email_norm` (el email como lo cuenta el límite de cuentos gratis; columna generada con `cuentos_email_norm(email)`, que tiene que dar lo mismo que `web/lib/emailNorm.ts`) y `free_claimed_at` (cuándo pasó la puerta de los gratis).
- `cuentos_orders` — book_id → books (cascade), edition, amount_cents, `stripe_session_id` único, status (`pending|paid|refunded|cancelled`), y lo de la imprenta: shipping, `print_*` y `print_info`. Desde la 0014, una sola tapa dura pagada por libro y entorno.
- `cuentos_generation_jobs` — book_id → books (cascade), kind (`sheet|scene|sample|page|cover|portrait`), page_n, prompt, status (`pending|running|done|failed`, más `error|skipped` del worker antiguo), attempts, cost_cents, `paid`, `storage_path`, `variant` (1 a 4) y `job_key` (único por libro).
- `cuentos_assets` — catálogo de piezas. Lectura pública (anon/authenticated).
- `cuentos_stories` — cuentos escritos por el planificador; el borrado diario quita las filas de más de 30 días.
- `cuentos_spend` — gasto de generación (topes en `web/lib/generation/budget.ts`). Desde el 27 oct, cada imagen reserva su coste estimado antes de pintarse (`model = 'reserva'`) y la fila se cambia por lo que costó, o se quita si no se pintó. Una reserva que se queda así (una función que muere a medias) cuenta como gastada.
- `cuentos_feedback` — motivos de «Otra versión» y avisos de «Sigue sin estar bien»; a los 30 días se vacía la nota.
- `cuentos_locks` (0013) — bloqueos cortos con caducidad: la puerta de los cuentos gratis, por buzón (la clave es un hash del email normalizado), y desde el 27 oct los cobros de Stripe de un mismo libro, de uno en uno (`pago:<id del libro>`). La fila se borra al soltar el bloqueo; si una función muere con él, caduca a los 20 s y se reutiliza.

## Acceso

- La app accede solo desde rutas API con `SUPABASE_SERVICE_ROLE_KEY` (`web/lib/supabase/server.ts`, marcado `server-only`). El worker usa `web/lib/supabase/admin.ts`.
- Sin políticas para anon/authenticated salvo `cuentos_assets` (select). El advisor de seguridad lo marca como INFO "RLS enabled no policy" en las tablas sin políticas: es intencionado. La función `cuentos_email_norm` solo la puede ejecutar el service role.
- Tipos: `web/lib/supabase/types.ts` (generados con `generate_typescript_types` y filtrados a `cuentos_*`). Regenerar al cambiar el esquema.

## Borrar a quien lo pide

Desde el 27 oct (menores de la auditoría 26 oct), a mano: `node --import tsx scripts/borrar-email.mts <email>` en `web/`, con las claves de `.env.local`. Sin `--de-verdad` solo cuenta. Borra por buzón (mismas variantes que el límite de gratis): los libros sin pagar enteros (también los pagados solo con la tarjeta de prueba: cuenta como pagado un cobro real, `cs_live_`), los pagados vaciados (el pedido se queda por la normativa fiscal), sus cuentos escritos (por la huella de la ficha de cada libro), sus leads y el email del gasto. Una tapa dura pagada de verdad sin imprimir no se toca sin `--aunque-no-se-haya-impreso`. Lee por páginas: no se deja filas aunque haya miles del mismo dominio. Detalle en `web/lib/forget.ts`.

## Borrado a 30 días (PRD §9)

Desde el 13 oct lo hace el cron diario de Vercel `/api/cron/purge` (`web/lib/purge.ts`, `web/vercel.json`; en Vercel exige `CRON_SECRET`).
- Libro caducado sin pagar: se borran sus imágenes del bucket y la fila; los jobs caen en cascada.
- Libro caducado pagado: la fila se queda vacía (`draft = {}`, `status = expired`, sin jobs ni imágenes) para conservar el pedido.
- `cuentos_stories` de más de 30 días: se borran (desde el 27 oct; antes se vaciaban `input` y `story`).

`?dry=1` cuenta sin borrar. (Antes lo hacía `scripts/worker.ts`, que no está corriendo.)

Desde el 27 oct (auditoría 26 oct, I11 e I29):
- Un libro que falla (un archivo que Storage no deja borrar, o Storage que no contesta en 20 s) no para la pasada: se apunta, se sigue con los demás y la ruta avisa a soporte con la referencia corta (`ref. abc123`) y el fallo. Se reintenta al día siguiente. Los pasos que no son de libros (cuentos, leads, gasto, notas, direcciones) también van cada uno por su cuenta. Si la pasada se queda sin tiempo, la ruta también avisa.
- La consulta avanza por caducidad: los libros que se conservan (tapa dura sin mandar a imprimir) ya no llenan la tanda y tapan a los demás. Los leads también avanzan por id.
- Tapa dura ya mandada a imprimir (también si la imprenta la devuelve o la cancela): se guarda hasta 14 días después de la entrega (plazo para pedir que se reimprima, `/condiciones` §9), como mucho 30 días desde que salió (`/privacidad` §4). Se le alarga `expires_at` hasta entonces. Al vaciarla, sus pedidos pierden la dirección y el seguimiento aunque la imprenta nunca la diera por entregada.
- Al borrar o vaciar un libro, sus filas de `cuentos_feedback` pierden la nota y la relación con él en ese momento.
- Los archivos del libro se listan con sus subcarpetas.

## Filas de prueba

Durante la verificación quedó una fila de prueba: `cuentos_books.public_id = 'zzagenttest1'` (caducada, status `expired`, con 1 job `skipped`) y un lead `agent-test@example.com`. El MCP canceló el `delete` (requiere confirmación). Se borran con:

```sql
delete from public.cuentos_books where public_id = 'zzagenttest1';
delete from public.cuentos_leads where email = 'agent-test@example.com';
```

(El libro lo borra también el worker en su primera pasada, por estar caducado.)

## Variables (en `web/.env.local`, nunca en el repo)

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEADS_WEBHOOK_URL` (opcional), `GENERATION_PROVIDER`, `OPENAI_API_KEY`, `MAX_COST_CENTS_PER_BOOK`, `GENERATION_COST_CENTS_PER_IMAGE`, `JOBS_API_SECRET`. Plantilla en `web/.env.example`.
