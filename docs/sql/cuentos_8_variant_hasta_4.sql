-- 25 oct: el código quiere hasta 4 versiones de una página (la incluida, 2 «Otra versión» con motivo y 1 si el padre
-- cambia la escena), pero el check de b3 cortaba en 3. Aplicada en Supabase el 25 oct (visto bueno de Álvaro), con
-- DB_MAX_VARIANT = 4 en web/lib/book/service.ts.
-- Solo relaja el límite: no toca filas. Aplicar una vez (MCP apply_migration o el editor SQL de Supabase).
alter table public.cuentos_generation_jobs drop constraint if exists cuentos_generation_jobs_variant_check;
alter table public.cuentos_generation_jobs
  add constraint cuentos_generation_jobs_variant_check check (variant between 1 and 4);
