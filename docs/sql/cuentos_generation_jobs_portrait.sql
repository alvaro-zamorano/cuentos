-- 25 oct: retratos de los personajes para la página «así son los personajes» del libro (uno por personaje, tras el pago).
-- Tipo nuevo «portrait»: page_n es la posición del personaje en el reparto (1 = protagonista), así que entra en 1..12.
-- Lo usan web/lib/book/service.ts (ensurePortraits) y web/lib/pdf/printHtml.ts.
-- Aplicar una vez (MCP apply_migration o el editor SQL de Supabase). Es aditivo: no toca filas existentes.
-- Sin aplicar, el libro no se rompe: los retratos no se encolan (se avisa en el log) y la página usa la hoja.

alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_kind_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_kind_check check (kind in ('sheet', 'scene', 'sample', 'page', 'cover', 'portrait'));

alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_check check (
    (kind in ('sheet', 'cover') and page_n is null) or (kind in ('scene', 'sample', 'page', 'portrait') and page_n is not null)
  );
