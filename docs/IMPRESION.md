# Libro impreso: imprentas, competencia y números (18 oct 2026)

Respalda D7 (PLAN §2): el libro impreso de tapa dura, con el PDF incluido, pasa a ser el producto principal. Lo único decidido es eso. Precio, imprenta, formato y el resto son propuestas, pendientes en ESTADO §4.21 a §4.26. Precios buscados el 17 y 18 oct; varios son «desde» o de reseñas de 2025: hay que confirmarlos en el panel de cada imprenta antes de fijar el precio.

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

## 3. Formato (propuesta)

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

## 7. Pendiente

- Muestra de Gelato con el libro de Vera, y presupuesto de Podiprint y Realisaprint.
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
