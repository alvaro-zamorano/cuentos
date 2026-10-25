-- Página propia de seguimiento del libro impreso (24 oct). Una columna nueva y opcional en cuentos_orders con lo que
-- dice Gelato del envío (método, entrega estimada, número de seguimiento) y la fecha en que vimos cada hito. Solo
-- aditiva: no toca filas existentes.

alter table public.cuentos_orders
  add column if not exists print_info jsonb;
