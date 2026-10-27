-- 27 oct (menores de la auditoría 26 oct, «Novedades sin baja ni prueba del consentimiento»). Decisión de Álvaro: la
-- baja y el registro ahora; la confirmación por email, antes del primer envío. Solo añade columnas: el código de antes no
-- las nota.
--
-- marketing_at y marketing_text: cuándo marcó la casilla de novedades y con qué texto (la prueba del consentimiento,
-- art. 21 LSSI). Los que la marcaron antes del 27 oct se quedan sin fecha ni texto: no se guardaban.
-- unsubscribe_token: la llave del enlace de baja (/baja?t=…), al azar y una por fila; la tienen también las filas que ya
-- había. unsubscribed_at: cuándo se dio de baja.

alter table public.cuentos_leads add column if not exists marketing_at timestamptz;
alter table public.cuentos_leads add column if not exists marketing_text text;
alter table public.cuentos_leads add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table public.cuentos_leads add column if not exists unsubscribed_at timestamptz;
create unique index if not exists cuentos_leads_unsubscribe_token_key on public.cuentos_leads (unsubscribe_token);
