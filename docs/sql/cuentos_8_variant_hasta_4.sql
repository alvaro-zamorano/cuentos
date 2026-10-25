-- 25 oct: el código quiere hasta 4 versiones de una página (la incluida, 2 «Otra versión» con motivo y 1 si el padre
-- cambia la escena), pero el check de b3 corta en 3. Mientras no se aplique, DB_MAX_VARIANT = 3 en
-- web/lib/book/service.ts limita las versiones a 3. Tras aplicarlo, subir DB_MAX_VARIANT a 4.
-- Solo relaja el límite: no toca filas. Aplicar una vez (MCP apply_migration o el editor SQL de Supabase).
alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_variant_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_variant_check check (variant between 1 and 4);
