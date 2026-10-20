-- cuentos_1_tablas · tablas del producto `cuentos` (prefijo cuentos_, RLS activado)
-- Todo acceso desde la app va por rutas API con service role. Sin políticas públicas salvo cuentos_assets (lectura).

create table if not exists public.cuentos_leads (
  id bigint generated always as identity primary key,
  email text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  marketing boolean not null default false,
  edition text not null default 'classic' check (edition in ('classic', 'illustrated', 'hardcover')),
  source text not null default 'cuentos-web',
  created_at timestamptz not null default now(),
  unique (email, edition)
);
comment on table public.cuentos_leads is 'cuentos · emails capturados (lead magnet / aviso de ediciones). marketing = consentimiento LSSI separado.';

create table if not exists public.cuentos_books (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^[a-z0-9]{8,16}$'),
  draft jsonb not null,
  edition text not null default 'classic' check (edition in ('classic', 'illustrated', 'hardcover')),
  status text not null default 'draft' check (status in ('draft', 'paid', 'illustrating', 'ready', 'delivered', 'expired')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
comment on table public.cuentos_books is 'cuentos · borradores/libros. Datos del niño: se borran a los 30 días (expires_at) salvo petición (PRD §9).';
create index if not exists cuentos_books_expires_at_idx on public.cuentos_books (expires_at);

create table if not exists public.cuentos_orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.cuentos_books (id) on delete cascade,
  edition text not null check (edition in ('classic', 'illustrated', 'hardcover')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  stripe_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists cuentos_orders_book_id_idx on public.cuentos_orders (book_id);

create table if not exists public.cuentos_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.cuentos_books (id) on delete cascade,
  kind text not null check (kind in ('sheet', 'scene')),
  page_n integer check (page_n between 1 and 12),
  style_id text not null,
  prompt text not null,
  "references" jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error', 'skipped')),
  attempts integer not null default 0,
  candidates jsonb not null default '[]'::jsonb,
  chosen text,
  cost_cents integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'sheet' and page_n is null) or (kind = 'scene' and page_n is not null))
);
create index if not exists cuentos_generation_jobs_book_id_idx on public.cuentos_generation_jobs (book_id);
create index if not exists cuentos_generation_jobs_pending_idx on public.cuentos_generation_jobs (created_at) where status = 'pending';

create table if not exists public.cuentos_assets (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('anchor', 'sheet', 'crop')),
  style_id text not null,
  category text,
  trait_id text,
  path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists cuentos_assets_lookup_idx on public.cuentos_assets (style_id, category, trait_id);

create or replace function public.cuentos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger cuentos_books_updated_at before update on public.cuentos_books
  for each row execute function public.cuentos_set_updated_at();
create or replace trigger cuentos_generation_jobs_updated_at before update on public.cuentos_generation_jobs
  for each row execute function public.cuentos_set_updated_at();

alter table public.cuentos_leads enable row level security;
alter table public.cuentos_books enable row level security;
alter table public.cuentos_orders enable row level security;
alter table public.cuentos_generation_jobs enable row level security;
alter table public.cuentos_assets enable row level security;

create policy cuentos_assets_public_read on public.cuentos_assets
  for select to anon, authenticated using (true);
