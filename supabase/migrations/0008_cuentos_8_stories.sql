-- cuentos_stories · cuentos escritos por el planificador (caché por huella de la ficha; coste y avisos de validación).
-- Aplicada en Supabase el 11 oct como `cuentos_stories` (versión 20261011120336). Su SQL no estaba en el repo hasta el
-- 27 oct (auditoría 26 oct, I14): se ha copiado tal cual de supabase_migrations.schema_migrations.
-- El borrado diario (web/lib/purge.ts) borra las filas de más de 30 días.
create table if not exists public.cuentos_stories (
  id uuid primary key default gen_random_uuid(),
  input_hash text not null,
  input jsonb not null,
  story jsonb not null,
  provider text not null,
  model text not null default '',
  usage jsonb not null default '{}'::jsonb,
  cost_cents integer not null default 0,
  fallback boolean not null default false,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cuentos_stories_hash_idx on public.cuentos_stories (input_hash, provider, created_at desc);
alter table public.cuentos_stories enable row level security;
-- solo el service role (servidor) lee y escribe; sin políticas para anon/authenticated
comment on table public.cuentos_stories is 'cuentos: historias generadas por el motor (cache por hash de entrada; coste y validación).';
