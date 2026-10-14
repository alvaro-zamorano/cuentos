# Fase 0 — calibración de la ilustración (13 oct 2026)

Hecha con **Nano Banana 2.1** desde Higgsfield (conector de Claude), en lugar de la clave de Gemini: es la familia de modelos «Nano Banana 2» de Google. Objetivo: saber si un niño descrito con texto (sin foto) sale igual en todas las páginas, a qué coste y con qué reglas.

## Qué se generó (7 imágenes, todas válidas a la primera)

| # | Imagen | Qué ponía a prueba | Resultado |
|---|---|---|---|
| 1 | Hoja de reparto Vera + Toby (3:2) | Niña con gafas, pecas y ojos verdes + perro en una sola hoja | 4 vistas + 4 expresiones + perro en 2 vistas, todo idéntico |
| 2 | Hoja de Nico (1:1) | El prompt actual de la app (`sheetPrompt`) sin tocar, rasgos muy distintos | Correcta: 4 vistas + 6 expresiones |
| 3 | Cumpleaños | 3 personajes; la abuela solo descrita con texto; contar velas | Niña y perro idénticos; abuela correcta; **7 velas en vez de 5** |
| 4 | Luna | Historia libre y cambio de ropa (traje de astronauta) | Cara, pelo, gafas y pecas intactos con otra ropa; la bandera con el dinosaurio sale |
| 5 | Noche en la cama | Postura tumbada, luz de lámpara | Consistente; el perro dormido mantiene manchas y collar |
| 6 | Portada | Dejar cielo libre arriba para el título | Cumple (≈ 30 % superior despejado) |
| 7 | Nico bajo la lluvia | Piel oscura con luz de anochecer; abuelo por texto | Consistente; **el tercio pedido libre para el texto lo ocupa el abuelo** |

Imágenes (CDN de Higgsfield):
- Hoja Vera + Toby: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_000901_e15436bb-b223-498d-888d-e1d25c2a08d6.png
- Hoja Nico: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_000900_6f9e8eb6-8549-4a07-8110-3e0108016202.png
- Cumpleaños: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_001027_884fcfbd-47dc-493e-b4d0-aac70b9aeba9.png
- Luna: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_001026_9ebd3a31-ffa9-4f85-a416-f4574eaf10b2.png
- Noche: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_001026_ea2fc5be-8e23-4be5-a016-0a26746327f6.png
- Portada: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_001027_82b14ca2-5a89-4822-b561-db61eaac77f2.png
- Nico lluvia: https://d8j0ntlcm91z4.cloudfront.net/user_34CU8KK3GsN12O5FxhIU0qNHjpZ/hf_20261013_001027_f47212e1-7977-4aff-b74d-be38d42befb6.png

## Cómo se hizo

- Referencias en cada llamada: ancla de estilo `web/public/styles/gouache.jpg` y, en las páginas, la hoja del niño (id del trabajo de Higgsfield como referencia).
- Hojas: `sheetPrompt()` de `web/lib/generation/prompts.ts` tal cual (Nico) y una variante «hoja de reparto» con el perro en la fila de abajo (Vera).
- Páginas: estructura de `scenePrompt()` + descripción canónica de `characterBible()` + una línea de vestuario cuando cambia la ropa («only the clothes change for this scene»).
- 2K, 3:2 en páginas. Salida 2528×1696 px.

## Coste y tiempo

| Concepto | Dato | Fuente |
|---|---|---|
| Higgsfield, Nano Banana 2.1 | 1,5 créditos (1K) · 2 (2K) · 3 (4K) por imagen | Preflight y transacciones del 13 oct |
| Gasto de la prueba | 7 imágenes = 14 créditos | Transacciones |
| Crédito en plan Ultra | ≈ 0,033–0,043 $ → ≈ 0,07–0,09 $ por imagen 2K | [creatify.ai](https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay) (secundaria) |
| API de Gemini, Nano Banana 2 | 0,067 $ (1K) · 0,101 $ (2K) · 0,151 $ (4K); la mitad en lote | [myarchitectai.com](https://www.myarchitectai.com/blog/nano-banana-api-pricing), 14 ago 2026 (secundaria: comprobar en la página de Google antes de fijar precios) |
| Tiempo | 40–70 s por imagen; 5 en paralelo ≈ 70 s | Medido |
| Resolución | 2K = 2528×1696 ≈ 216 ppp a lo ancho de un A4; 4K para tapa dura | Medido |

## Conclusiones (lo que cambia el producto)

1. **La consistencia da para vender.** Cara, pelo, gafas, pecas, ojos, ropa y el perro se mantienen en todas las páginas: con disfraz, tumbada, de noche y con lluvia.
2. **Una hoja de reparto basta para el reparto principal.** Niño + mascota en una imagen; las páginas la usan como referencia.
3. **Personajes que salen una vez: solo texto.** La abuela y el abuelo salen bien descritos con una frase. Si alguien sale en más de una página, tiene que estar en la hoja.
4. **La ropa puede cambiar por escena.** Separar identidad (cara, pelo, piel, ojos, gafas, rasgos) de vestuario (habitual + cambio por página).
5. **Nada de contar en la imagen.** Pedimos 5 velas y pintó 7. La edad y los números van en el texto; en la imagen, «unas velas».
6. **El hueco para el texto no es fiable.** La maqueta pone el texto en su propia banda, no encima de la imagen.
7. **Estilo:** ancla + descripción dan un álbum cálido y coherente, algo menos texturado que el ancla. Un solo estilo para salir; como ancla nueva conviene una de nuestras propias páginas.
8. **Sin texto espurio** en ninguna imagen. Los detalles del padre se convierten en objetos (la bandera con el dinosaurio).

## Pendiente de medir

- Un secundario recurrente dentro de la hoja (la abuela en tres páginas).
- Dos protagonistas (hermanos) en la misma hoja.
- Cambios con palabras sobre la hoja aprobada («más rizos», «sin pecas»).
- Libro completo de 12 páginas: deriva a lo largo del libro y cuántas páginas hay que repetir.
- Id del modelo y precio en la API de Google, o si la API de Higgsfield (`hf`) expone Nano Banana: decide el proveedor en producción.
