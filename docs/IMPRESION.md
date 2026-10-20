# Libro impreso: imprentas, competencia y números (18 oct 2026)

Respalda D7 (PLAN §2): el libro impreso de tapa dura, con el PDF incluido, es el producto principal. **Decidido el 18 oct (Álvaro):** se sale con la tapa dura, a 34,90 € con envío a la Península y Baleares, y el libro va a la imprenta solo cuando el padre lo confirma. La conexión con Gelato está hecha (B8, §7). Siguen abiertas las preguntas de ESTADO §4.22, §4.24 y §4.25. Precios buscados el 17 y 18 oct; varios son «desde» o de reseñas de 2025: hay que confirmarlos en el panel de cada imprenta antes de fijar el precio.

## 1. Por qué el impreso

- **La categoría vende un objeto de regalo.** Quien compra suele ser quien regala (el copy de la landing ya apunta a padres, abuelos y tíos), y un PDF no se envuelve.
- **Precios de referencia:**

| Marca | Precio | Fuente |
|---|---|---|
| MiCuento (Barcelona) | Unos 25 €, tapa dura 21×21 | intelectium.com |
| Librio | 24,48 £ tapa blanda, 32,48 £ tapa dura, 26 páginas | notonthehighstreet.com |
| Wonderbly | 29 $ tapa blanda, 36 $ tapa dura (precios de lanzamiento, antiguos) | es.digitaltrends.com |
| Hooray Heroes | Unos 24 € de media por libro (cálculo: 12 M€ con casi medio millón de libros en 2018) | english.sta.si |

- **El sector se consolida:** Penguin Random House compró Wonderbly en junio de 2025, y Personalized Story Group compró Hooray Heroes en octubre de 2026. Todos venden ilustraciones fijas con el nombre y el aspecto del niño; la historia libre es lo que nos diferencia.
- **El PDF solo deja poco:** ≈ 13 € por venta a 14,90 €. Con anuncios, captar un cliente puede comérselo (no hay dato propio todavía).

## 2. Imprentas

**Con API, listas para integrar un ejemplar por pedido**

| Imprenta | Qué ofrece | Notas |
|---|---|---|
| **Gelato** | Tapa dura y blanda en 20×20; precio con 30 páginas interiores incluidas; 170 g, tapa mate laminada; producción local con más de 250 imprentas en 32 países | 19,13 $ la tapa dura 20×20 en su tienda de demostración; desde 11,85 $ con Gelato+ (desde 19,99 $ al mes). Envío de referencia: 5,52 € a Luxemburgo, 4 a 10 días. Tapa blanda desde 11,18 $ (6,92 $ con plan) |
| **Prodigi / Peecho** | Tapa dura de 24 a 500 páginas, envío sin marca, fabrica en la UE, 120 h de producción | Tamaños 9×9", 9×11", 11×9", 12×12", A4 y A5: no hay 20×20. ≈ 22 $ con 24 páginas (reseña de 2025). Tapa blanda desde 4 €; revista 21×21 de 115 g |
| **Lulu** | API gratis; se paga la impresión, el envío y una comisión por pedido. Tapa dura, blanda y grapa | Sin confirmar dónde imprime los pedidos para España |
| **Mixam** | API pública (OpenAPI) con aprobación previa; envía desde Reino Unido y la UE; tapa dura, blanda y grapa | Sin precios mirados |

**Españolas (sin API pública: hay que pedir presupuesto)**

| Imprenta | Qué ofrece |
|---|---|
| **Podiprint** (Antequera) | Bajo demanda desde un ejemplar, tapa dura y grapado, pedidos con varios destinos desde su plataforma |
| **Veprix** | Entrega en 24 a 48 h por debajo de 25 ejemplares |
| **Realisaprint** | Solo para revendedores; envío gratis a Península y Baleares, sin su marca |
| **Bookmundo** | Red de imprentas que incluye España y Portugal |
| CoolLibri, Bubok | Pensadas para autores, no para pedidos automáticos |

**Propuesta:** Gelato para salir, por la API y el 20×20. Pedir presupuesto a Podiprint y Realisaprint para comparar con volumen: imprimir en España acorta los plazos de Navidad.

## 3. Formato

**Decidido el 18 oct (D5 bis):** apaisado. Tapa dura apaisada (el código busca en Gelato la más cercana a 280×210 mm, sin confirmar en su catálogo), 30 páginas interiores con cada escena a doble página: la ilustración a página completa (a sangre) a la izquierda y el texto a la derecha. La 3:2 se recorta un 5 a 11 % por los lados según el tamaño final. La cubierta lleva la portada a sangre con el título arriba. El PDF que se descarga usa la misma maqueta en A4 apaisado. Lo de debajo es la propuesta del 18 oct, superada en el tamaño.

Propuesta anterior:

- 20×20, tapa dura, 24 páginas interiores a doble página: la ilustración 3:2 a un lado y el texto al otro, más la dedicatoria. Cumple el mínimo de páginas y quita el blanco bajo el texto (E15).
- **A 2K basta:** 2528 px en 20 cm son unos 320 ppp. Solo haría falta 4K si la ilustración ocupa la doble página. Quita los ≈ 2 $ que el PLAN reservaba para el 4K.
- Cubierta con lomo, en el formato de la imprenta elegida (Gelato pide la cubierta aparte).

## 4. Números por libro

Costes supuestos: impresión Gelato ≈ 16,5 € sin plan y ≈ 10 € con Gelato+, envío ≈ 5,5 €, IA ≈ 1 €, Stripe ≈ 0,6 a 0,8 €. Sin contar captación ni la cuota mensual.

| Producto | Precio (IVA incl.) | Queda con IVA 4 % | Queda con IVA 21 % |
|---|---|---|---|
| Libro impreso + PDF | 34,90 € | 9,8 € sin plan · 16 € con plan | 5 € · 11,5 € |
| Solo PDF | 14,90 € | ≈ 13 € | ≈ 10,8 € |
| Segundo ejemplar, misma dirección | 24,90 € | 6 € · 13 € (envío extra supuesto ≈ 1 €) | sin calcular |
| Tapa blanda + PDF | 24,90 € | 7,2 € · 10,8 € | 3,9 € · 7,5 € |

- El envío es un coste fijo: pesa más cuanto más barato es el libro. Por eso la tapa blanda deja menos que la dura.
- A 39,90 €, el impreso dejaría ≈ 14,6 € sin plan con IVA del 4 %.
- **IVA:** la DGT aplica el 4 % solo si el contenido es «libro» según la Ley 10/2007 (consulta V2206-24). Un ejemplar único personalizado puede tratarse como fotolibro, al 21 %. Lo decide la gestoría.

## 5. Ideas para subir el ticket (propuestas)

- **Segundo ejemplar** para los abuelos, a la misma dirección.
- **Tarjeta regalo:** quien regala paga y los padres crean el libro. Cubre la Navidad cuando ya no da tiempo a enviar.
- **Lámina de la portada** como complemento, con el mismo envío (sin precio mirado).
- Cartoné para 1 a 3 años: no lo ofrecen Gelato ni Prodigi; haría falta otra imprenta.

## 6. Qué cambia en el producto y en el código (B8)

- Stripe Checkout pide la dirección de envío si el pedido es impreso.
- Tras el pago y con las 12 páginas aprobadas, el servidor manda el PDF de imprenta (interior y cubierta) a la API de la imprenta y guarda el número de pedido.
- Email con el seguimiento; el PDF llega al momento, como ahora.
- Legales: la imprenta entra como encargado (nombre, dirección y el libro), en `PROVEEDORES.md` y `/privacidad`. Condiciones: plazos de entrega y qué pasa con un defecto de impresión. La renuncia al desistimiento sigue valiendo para un bien personalizado.
- La purga a 30 días no puede borrar el libro antes de que la imprenta lo haya recibido.

## 7. Conexión con la imprenta (B8, hecho el 18 oct)

**Recorrido**

1. **Paso 5, antes de pagar:** se elige «Libro de tapa dura · 34,90 €» (marcada) o «Libro ilustrado en PDF · 14,90 €». La tapa dura pide la dirección: nombre y apellidos, calle (35 caracteres por línea, como pide Gelato), código postal y población; teléfono opcional. Canarias, Ceuta y Melilla se rechazan por el código postal. La dirección se guarda en el borrador antes de abrir Stripe.
2. **Pago:** Stripe Checkout lleva `metadata.edition`. El webhook crea el pedido con la edición, la dirección y `print_status = awaiting_approval`. Se pintan las 12 páginas como antes.
3. **Revisión:** el padre retoca textos y elige versiones. Puede cambiar la dirección. El botón «Mandar a imprimir» pide confirmación («después ya no se pueden cambiar…»). No hay envío automático (decisión de Álvaro).
4. **A la imprenta** (`POST /api/libro/print`): el pedido pasa a `sending` una sola vez; con `after()` se maqueta el PDF de imprenta, se sube al bucket (`books/<id>/imprenta-<fecha>.pdf`, enlace firmado de 7 días) y se crea el pedido en Gelato con `orderReferenceId` = id de `cuentos_orders`. Queda `sent` y sale el email «ya está en la imprenta». Si falla, `failed` con el motivo y se puede reintentar.
5. **Después:** el webhook de Gelato (`/api/print/webhook?token=…`) y el cron diario (`/api/cron/print`, 09:23 UTC) consultan el pedido en la API de Gelato (no se fían del aviso) y apuntan `in_production`, `shipped` (con el enlace de seguimiento y el email «va de camino», una vez) y `delivered`.
6. **Cron diario:** recordatorio a los 2 y a los 7 días a quien pagó y no lo ha mandado; los envíos que se cortaron en `sending` pasan a `failed` a los 15 minutos para reintentar.
7. **Bloqueo:** en cuanto sale (`sending` en adelante), el servidor rechaza cambios de texto, de versión de página, de dirección y páginas nuevas (409 `printed`).
8. **Borrado a 30 días:** un libro impreso que no ha salido hacia la imprenta no se borra; al vaciar un libro pagado se borra la dirección, salvo que esté de camino.

**Maqueta** (`lib/pdf/printHtml.ts`, `lib/pdf/print.ts`): un PDF de 33 páginas como pide Gelato para los fotolibros: 1 pliego de cubierta, 2 guarda en blanco, 3 a 32 las 30 páginas interiores, 33 guarda. Interior de 208×208 mm (20 cm + 4 mm de sangre): portadilla, «así son los personajes» con la hoja, dedicatoria, las 12 escenas a doble página (ilustración a la izquierda, texto a la derecha), «Fin», colofón y una en blanco. Cubierta en noche: portada con la ilustración y el título, lomo con el título y trasera con la marca. Las medidas de la cubierta salen de la API de Gelato para ese número de páginas; sin ellas no se manda (la estimada solo sirve para la simulación). `pageCount` = 30, las interiores: Gelato suma las 4 caras de las tapas (comprobado con su API el 20 oct; `GELATO_PAGE_COUNT` lo cambia).

**Modos** (`printMode`): `gelato` con `GELATO_API_KEY`; `dry-run` fuera de producción con `NEXT_PUBLIC_DRY_RUN_PAYMENT=1` (maqueta el PDF pero no llama a Gelato); `none` en producción sin clave (la tapa dura no se ofrece). Fuera de producción los pedidos reales se crean como **borrador** (Gelato no los imprime) salvo `GELATO_ORDER_TYPE=order`.

**Comprobado (18 oct):** 100 unitarios (13 nuevos en `tests/unit/print.test.ts`: dirección, cuerpo del pedido, estados, cubierta, maqueta, recorrido con imprenta simulada y con un doble de Gelato, webhook, cron, borrado), build y 9 Playwright (uno nuevo: tapa dura con dirección rechazada en Canarias, pago de prueba, cambio de dirección, mandar a imprimir y libro bloqueado). PDF de imprenta del libro de muestra maquetado en local con Chromium: 33 páginas, cubierta de 450×230 mm (estimada) e interior de 208 mm, mirado en capturas. Migración `0005` aplicada en Supabase (columnas nuevas en `cuentos_orders`). **Sin probar todavía:** la API real de Gelato (falta la clave), la búsqueda del producto en su catálogo y que acepte este PDF (lo dirá la muestra).

**Lo que tiene que hacer Álvaro** (ninguna clave por el chat):

1. Crear la cuenta de Gelato (empresa) y una clave de API → `GELATO_API_KEY` en Vercel (Preview primero).
2. Webhook en Gelato (API Portal) → `https://<preview o dominio>/api/print/webhook?token=<valor aleatorio largo>`, eventos de estado del pedido y de seguimiento. El mismo valor → `GELATO_WEBHOOK_SECRET`.
3. Opcional: `GELATO_PRODUCT_UID` con el producto exacto (tapa dura 20×20); si no, se busca solo.
4. **Muestra:** `GELATO_ORDER_TYPE=order` en Preview, un libro con la tarjeta de prueba de Stripe y tu dirección, «Mandar a imprimir». Después quitar `GELATO_ORDER_TYPE` para que la preview vuelva a crear borradores.
5. Mirar la entidad del contrato de Gelato y su DPA (`PROVEEDORES.md`).
6. En Gelato, el método de pago para que cobre los pedidos (sin él, los pedidos se quedan parados).

## 8. Pendiente

- La muestra con la conexión real (§7, paso 4), y presupuesto de Podiprint y Realisaprint.
- Precio exacto a España en el panel de Gelato (los de arriba son «desde»).
- Las decisiones de ESTADO §4.21 a §4.26.

## Fuentes

- Gelato: gelato.com/es/productos/childrens-books · gelato-demo.myshopify.com/products/hardcover-photo-book · gelato-demo.myshopify.com/collections/soft-cover-photo-books · gelato.com/custom/photo-books/hardcover-photo-book · bestreviews.net/gelato-reviews (precios con plan, 2025)
- Prodigi / Peecho: prodigi.com/download/product-range/Prodigi%20Hardcover%20photo%20book.pdf · prodigi.com/blog/photo-books-technical-guide · ecommerce-platforms.com/articles/prodigi-review · peecho.com/products/books/hardcover · webflow.peecho.com/products/magazines
- Lulu: help.api.lulu.com (comisiones de la API) · lulu.com/personalized-books
- Mixam: polotno.com/sdk/product/integrations/mixam
- España: podiprint.com/impresion-bajo-demanda · veprix.com · realisaprint.es · bookmundo.com/es/imprimir-un-libro/impresion-bajo-demanda
- Competencia: intelectium.com/en/post/startup-of-the-week-micuento · notonthehighstreet.com/librio · es.digitaltrends.com (Wonderbly) · english.sta.si/2594910 (Hooray Heroes) · graphitecapital.com/portfolio/wonderbly · prnewswire (Personalized Story Group compra Hooray Heroes, oct 2026)
- IVA: consulta DGT V2206-24, resumida en primeralecturaediciones.com
