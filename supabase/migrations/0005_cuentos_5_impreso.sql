-- B8 (D7): libro impreso de tapa dura. Columnas nuevas y opcionales en cuentos_orders: dirección de envío, estado del
-- pedido en la imprenta (Gelato), número de seguimiento y marcas de los emails. Solo aditiva: no toca filas existentes.

alter table public.cuentos_orders
  add column if not exists shipping jsonb,
  add column if not exists print_status text,
  add column if not exists print_order_id text,
  add column if not exists print_tracking_url text,
  add column if not exists print_error text,
  add column if not exists print_sent_at timestamptz,
  add column if not exists print_updated_at timestamptz,
  add column if not exists print_reminded_at timestamptz,
  add column if not exists print_shipped_mailed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cuentos_orders_print_status_check') then
    alter table public.cuentos_orders
      add constraint cuentos_orders_print_status_check check (
        print_status is null or print_status in (
          'awaiting_approval', 'sending', 'sent', 'in_production', 'shipped', 'delivered', 'returned', 'canceled', 'failed'
        )
      );
  end if;
end $$;

-- pedidos de imprenta abiertos (el cron diario los recorre)
create index if not exists cuentos_orders_print_open_idx on public.cuentos_orders (print_status)
  where print_status in ('awaiting_approval', 'sending', 'sent', 'in_production', 'shipped');
