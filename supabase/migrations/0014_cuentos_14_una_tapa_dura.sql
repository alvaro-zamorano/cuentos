-- 27 oct (revisión de «una compra, un libro», PR #84): como mucho una tapa dura pagada por libro.
-- Aplicada en Supabase el 27 oct como `cuentos_14_una_tapa_dura` (versión 20261027152007, visto bueno de Álvaro). Solo
-- añade un índice: el código de antes no lo nota.
--
-- Los cobros de un libro ya se registran de uno en uno (cuentos_locks, web/lib/book/service.ts). Esto es la red por si
-- ese bloqueo caducara con un cobro aún a medias: el segundo pedido de tapa dura no entra, y el código lo trata como
-- cobro doble (con aviso a soporte para devolverlo).
--
-- La base es la misma en la preview y en producción: un cobro real (`cs_live_…`) y uno de prueba del mismo libro no
-- chocan. Los pedidos devueltos (`status` distinto de `paid`) no cuentan.

create unique index if not exists cuentos_orders_una_tapa_dura
  on public.cuentos_orders (book_id, (left(coalesce(stripe_session_id, ''), 8) = 'cs_live_'))
  where status = 'paid' and edition = 'hardcover';
