-- Gasto de generación por lead y por día (B3). Lo lee y escribe web/lib/generation/budget.ts con service role.
-- lead_id: email del lead antes del pago, o id del libro (cuentos_books.id) cuando ya está pagado.
-- kind: story (texto) | sheet (hoja de personaje) | sample (página de muestra) | page (página del libro pagado).
create table if not exists public.cuentos_spend (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null,
  kind text not null check (kind in ('story', 'sheet', 'sample', 'page')),
  provider text not null,
  model text not null,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists cuentos_spend_lead_id_idx on public.cuentos_spend (lead_id);
create index if not exists cuentos_spend_created_at_idx on public.cuentos_spend (created_at);

-- RLS activada y sin políticas: anon y authenticated no leen ni escriben; solo el service role (que salta RLS).
alter table public.cuentos_spend enable row level security;
