# Supabase — `cuentos`

Proyecto compartido con otros productos de Álvaro (`https://bcicjjkgjgajxbrwmeyf.supabase.co`). Convención: tablas en `public` con prefijo **`cuentos_`** y RLS activado. Nada de este producto toca tablas sin ese prefijo.

## Migraciones aplicadas (8 oct 2026, vía MCP `apply_migration`)

| Nombre | Archivo | Qué hace |
|---|---|---|
| `cuentos_1_tablas` | `supabase/migrations/0001_cuentos_1_tablas.sql` | 5 tablas, índices, trigger `updated_at`, RLS, política de lectura pública solo en `cuentos_assets` |
| `cuentos_2_storage` | `supabase/migrations/0002_cuentos_2_storage.sql` | bucket de Storage `cuentos` **privado** (sin políticas: solo service role) |
| `cuentos_3_assets_seed` | `supabase/migrations/0003_cuentos_3_assets_seed.sql` | 6 anclas + 340 recortes en `cuentos_assets` (generado por `scripts/assets_build.py`) |
| `cuentos_4_outfit_jersey` | `supabase/migrations/0004_cuentos_4_outfit_jersey.sql` | renombra el conjunto O03 de `azul` a `jersey` |

## Tablas

- `cuentos_leads` — email, marketing (consentimiento LSSI separado), edition, source. Único por `(email, edition)`; `/api/lead` hace upsert.
- `cuentos_books` — `public_id` corto (10 caracteres) para `/crear?b=<public_id>`, `draft` jsonb (sin email), edition, status (`draft|paid|illustrating|ready|delivered|expired`), email, `expires_at = created_at + 30 días`.
- `cuentos_orders` — book_id → books (cascade), edition, amount_cents, currency, stripe_session_id único, status.
- `cuentos_generation_jobs` — book_id → books (cascade), kind `sheet|scene`, page_n (1–12, solo escenas), style_id, prompt, `references` jsonb, status `pending|running|done|error|skipped`, attempts, candidates jsonb, chosen, cost_cents, error.
- `cuentos_assets` — kind `anchor|sheet|crop`, style_id, category, trait_id, path único. Lectura pública (anon/authenticated).

## Acceso

- La app accede solo desde rutas API con `SUPABASE_SERVICE_ROLE_KEY` (`web/lib/supabase/server.ts`, marcado `server-only`). El worker usa `web/lib/supabase/admin.ts`.
- Sin políticas para anon/authenticated salvo `cuentos_assets` (select). El advisor de seguridad lo marca como INFO "RLS enabled no policy" en 4 tablas: es intencionado.
- Tipos: `web/lib/supabase/types.ts` (generados con `generate_typescript_types` y filtrados a `cuentos_*`). Regenerar al cambiar el esquema.

## Borrado a 30 días (PRD §9)

Desde el 13 oct lo hace el cron diario de Vercel `/api/cron/purge` (`web/lib/purge.ts`, `web/vercel.json`; solo corre en producción y exige `CRON_SECRET`).
- Libro caducado sin pagar: se borran sus imágenes del bucket y la fila; los jobs caen en cascada.
- Libro caducado pagado: la fila se queda vacía (`draft = {}`, `status = expired`, sin jobs ni imágenes) para conservar el pedido.
- `cuentos_stories` de más de 30 días: se vacían `input` y `story`.

`?dry=1` cuenta sin borrar. (Antes lo hacía `scripts/worker.ts`, que no está corriendo.)

Desde el 27 oct (auditoría 26 oct, I11 e I29):
- Un libro que falla (un archivo que Storage no deja borrar) no para la pasada: se apunta, se sigue con los demás y la ruta avisa a soporte con el id corto y el fallo. Se reintenta al día siguiente.
- La consulta avanza por caducidad: los libros que se conservan (tapa dura sin mandar a imprimir) ya no llenan la tanda y tapan a los demás. Los leads también avanzan por id.
- Tapa dura ya mandada a imprimir: se guarda hasta 14 días después de la entrega (plazo para pedir que se reimprima, `/condiciones` §9), como mucho 30 días desde que salió (`/privacidad` §4). Se le alarga `expires_at` hasta entonces.
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
