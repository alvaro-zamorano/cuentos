-- 27 oct (menores de la auditoría 26 oct, «Novedades sin baja ni prueba del consentimiento»). Decisión de Álvaro: la
-- baja y el registro ahora; la confirmación por email, antes del primer envío. Solo añade columnas: el código de antes no
-- las nota.
--
-- marketing_at y marketing_text: cuándo marcó la casilla de novedades y con qué texto (la prueba del consentimiento,
-- art. 21 LSSI). Los que la marcaron antes del 27 oct se quedan sin fecha ni texto: no se guardaban.
-- unsubscribe_token: la llave del enlace de baja (/baja?t=…), al azar y una por fila; la tienen también las filas que ya
-- había. unsubscribed_at: cuándo se dio de baja.
-- email_norm: el buzón, como en cuentos_books (función cuentos_email_norm de la 0013). La baja vale para todas las filas
-- del mismo buzón (otra edición, el email escrito de otra forma), y una baja no la deshace volver a marcar la casilla.

alter table public.cuentos_leads add column if not exists marketing_at timestamptz;
alter table public.cuentos_leads add column if not exists marketing_text text;
alter table public.cuentos_leads add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table public.cuentos_leads add column if not exists unsubscribed_at timestamptz;
create unique index if not exists cuentos_leads_unsubscribe_token_key on public.cuentos_leads (unsubscribe_token);
alter table public.cuentos_leads
  add column if not exists email_norm text generated always as (public.cuentos_email_norm(email)) stored;
create index if not exists cuentos_leads_email_norm_idx on public.cuentos_leads (email_norm);
