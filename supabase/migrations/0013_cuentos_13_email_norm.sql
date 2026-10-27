-- 27 oct (auditoría 26 oct, I7): el límite de cuentos gratis por buzón, con una consulta pequeña y sin carreras.
-- La aplica Álvaro en Supabase ANTES de desplegar el código que la usa (web/lib/book/freeLimit.ts). Solo añade: el
-- código de ahora no la nota.
--
-- 1. cuentos_books.email_norm: el email escrito como lo cuenta el límite (minúsculas, sin `+algo`, sin los puntos de
--    Gmail, googlemail.com = gmail.com). Columna generada: se rellena sola en las filas que ya hay y en las nuevas,
--    también las que escriba el código de antes. Tiene que dar lo mismo que normalizeEmail() en
--    web/lib/book/freeLimit.ts (lo comprueba web/tests/unit/migraciones.test.ts).
-- 2. cuentos_books.free_claimed_at: cuándo pasó el libro la puerta de los gratis. Cuenta como empezado mientras se
--    preparan sus personajes, antes de que exista su primera imagen.
-- 3. cuentos_locks: un bloqueo con caducidad por buzón (la clave es un hash, no el email). Dos peticiones a la vez con
--    el mismo email se cuentan una detrás de otra.

create or replace function public.cuentos_email_norm(email text) returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  with a as (select lower(regexp_replace(email, '^\s+|\s+$', '', 'g')) as e),
  b as (select e, case when strpos(e, '@') = 0 then 0 else length(e) - strpos(reverse(e), '@') + 1 end as at from a),
  c as (
    select e, at, left(e, at - 1) as l0,
      case when substr(e, at + 1) = 'googlemail.com' then 'gmail.com' else substr(e, at + 1) end as dom
    from b
  ),
  d as (select e, at, dom, case when strpos(l0, '+') > 1 then left(l0, strpos(l0, '+') - 1) else l0 end as l1 from c)
  select case
    when at < 2 then e
    when dom = 'gmail.com' then replace(l1, '.', '') || '@' || dom
    else l1 || '@' || dom
  end
  from d
$$;
comment on function public.cuentos_email_norm(text) is 'cuentos · email normalizado para el límite de cuentos gratis (igual que normalizeEmail en web/lib/book/freeLimit.ts).';
revoke execute on function public.cuentos_email_norm(text) from public, anon, authenticated;
grant execute on function public.cuentos_email_norm(text) to service_role;

alter table public.cuentos_books
  add column if not exists email_norm text generated always as (public.cuentos_email_norm(email)) stored;
alter table public.cuentos_books add column if not exists free_claimed_at timestamptz;
create index if not exists cuentos_books_email_norm_idx on public.cuentos_books (email_norm, created_at desc) where email_norm is not null;

create table if not exists public.cuentos_locks (
  key text primary key,
  holder text not null,
  expires_at timestamptz not null
);
comment on table public.cuentos_locks is 'cuentos · bloqueos cortos con caducidad (límite de cuentos gratis por buzón). Sin datos personales: la clave es un hash.';
-- RLS activada y sin políticas: anon y authenticated no leen ni escriben; solo el service role (que salta RLS).
alter table public.cuentos_locks enable row level security;
