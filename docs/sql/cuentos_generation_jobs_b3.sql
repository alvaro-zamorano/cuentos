-- B3 (brief 7): generación sin worker externo. Jobs de muestra (antes del pago) y del libro (tras el pago),
-- idempotentes por huella. Lo usan web/lib/generation/{store,service}.ts y las rutas /api/generate/*.
-- Aplicar una vez (MCP apply_migration o el editor SQL de Supabase). Es aditivo: no toca filas existentes.

-- Tipos nuevos: sample (página 9 antes del pago), page (página del libro pagado) y cover (portada).
-- 'scene' se mantiene para los jobs antiguos de /api/jobs y del worker.
alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_kind_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_kind_check check (kind in ('sheet', 'scene', 'sample', 'page', 'cover'));

alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_check check (
    (kind in ('sheet', 'cover') and page_n is null) or (kind in ('scene', 'sample', 'page') and page_n is not null)
  );

-- Estado 'failed' (error de proveedor, de presupuesto o tiempo agotado); 'error' y 'skipped' quedan para el worker antiguo.
alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_status_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_status_check check (status in ('pending', 'running', 'done', 'failed', 'error', 'skipped'));

-- paid: job creado tras el pago (salta el tope por lead; el diario sigue).
-- storage_path: PNG en el bucket privado `cuentos` (books/<book_id>/<kind>-<n>-<versión>-<huella>.png); null en dry-run.
-- variant: versión (1 = la incluida; hoja hasta 3, página hasta 2).
-- job_key: <kind>:<n>:<versión>:<huella>; único por libro, así nada se genera dos veces.
alter table public.cuentos_generation_jobs
  add column if not exists paid boolean not null default false,
  add column if not exists storage_path text,
  add column if not exists variant integer not null default 1 check (variant between 1 and 3),
  add column if not exists job_key text;

-- Índice único sin WHERE para que PostgREST pueda usarlo en upsert(onConflict: "book_id,job_key", ignoreDuplicates).
-- Las filas antiguas tienen job_key null y no chocan (NULL es distinto de NULL en un índice único).
create unique index if not exists cuentos_generation_jobs_book_key_idx on public.cuentos_generation_jobs (book_id, job_key);
