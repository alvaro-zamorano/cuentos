# Estilo «La hora del cuento» (13 oct 2026)

**Estado: aprobado por Álvaro el 13 oct, con otra tipografía (Lora en vez de Fraunces, cuya «f» no le gustó), e implementado en la rama `feat/estilo-hora-del-cuento`.** Sustituye la decisión del 9 oct «estética editorial; Fraunces + Geist; verde botella como único acento». El registro adulto del texto (sin diminutivos ni emojis) se mantiene.

Maquetas en el lienzo de diseño «Cuentos · La hora del cuento» (claude.ai, privado de Álvaro): sistema de estilo, landing en escritorio y móvil, y los pasos de `/crear` (1 en móvil y escritorio, 2, 3 escribiendo, 3 escrito, 4 email, 4 personajes, 5 libro y pago). Usan las imágenes reales del libro de muestra y de las cuatro portadas. Las maquetas conservan Fraunces y Kalam; la referencia es ya el código.

## 1. Por qué

La web actual es correcta pero sobria: papel beige, tinta, un solo acento verde, filetes finos, botones de 6 px y titulares en Fraunces de óptica grande (la de las revistas). Las ilustraciones son lo único cálido, y la interfaz no las acompaña. En `/crear` no hay sensación de estar haciendo un libro: pasos en texto pequeño, campos subrayados, el paso 2 como una pared de opciones y esperas con una barra fina.

## 2. Referencias (vistas el 13 oct)

| Tienda | Qué se toma | Qué se evita |
|---|---|---|
| Wonderbly | Serif suave para titulares, el libro como objeto físico, recorrido «para quién es» | Su paleta apagada |
| Hooray Heroes | — | Mayúsculas, tipografías de cómic, aspecto de bazar |
| Yoto | Sans redondeada, botones píldora, tarjetas de 28–32 px de radio, color con alegría | — |
| Tonies | Fondo crema cálido, un rojo de acción, radios de 12 px | — |
| Lovevery | Franjas de color pintadas a mano como detalle | — |
| Maisonette | Serif suave + sans geométrica; manchas de color orgánicas | — |
| Konges Sløjd | Detalles dibujados a mano (iconos, logotipo con corazones) | Exceso de ornamento |
| Jellycat | Fotografía/ilustración como protagonista, el producto cuenta la historia | — |
| Bobo Choses, Liewood | — | Lo editorial de moda: frío para este producto (es donde estamos ahora) |

## 3. Sistema

**Color** (contrastes medidos):

| Token | Hex | Uso |
|---|---|---|
| Noche | `#1D2747` | Cabecera, portada de la landing, secciones de marca, la edición de pago |
| Crema | `#FBF5EA` | Fondo |
| Papel | `#F4EAD8` | Secciones alternas |
| Tinta | `#232036` | Texto (14,5:1 sobre crema) |
| Tinta suave | `#5D566C` | Texto secundario (6,4:1) |
| Teja | `#C8492C` | Solo acciones; texto blanco 4,7:1. Enlaces pequeños en `#A93D25` |
| Estrella | `#F2B84B` | Estrellas, cursivas sobre noche, insignias (8,2:1 sobre noche) |
| Tintes | `#F7D9C4` · `#D6E5F2` · `#F9E6B0` · `#DCE7CF` | Fondos de tarjetas e imágenes; nunca texto ni botones |

**Tipografía** (Google Fonts, `next/font`):
- Titulares: Lora, peso 640. La palabra que importa va en color (teja o estrella), no en cursiva.
- El cuento: Lora 400, 17–23 px. También en el PDF.
- Interfaz: Figtree 400/600/700 (sustituye a Geist). También en el PDF (números de página, «De parte de»).
- Notas a mano: Patrick Hand, con moderación (antetítulos, «se verá:», pies de foto).
- Sin cursivas en textos que pueden llevar «f» (dedicatorias, cuento). La marca «cuentos» y «para» sí van en cursiva.
- Descartadas: Fraunces, por su «f», y Kalam, que tiene una «f» parecida.

**Forma:** botones y chips píldora; tarjetas de 20–24 px de radio; secciones de 28 px; imágenes de 14. El libro se enseña como objeto: A4 vertical, ilustración 3:2 arriba con el título, «para Vera» en la banda (como el PDF real), lomo sombreado y cantos de papel.

**Motivos:** estrella de cuatro puntas, luna, colina entre la noche y la crema, manchas de gouache detrás de las imágenes, cinta adhesiva en la hoja de personajes, camino de puntos para el progreso.

**Movimiento:** entradas que suben 12 px con fundido (500 ms, curva suave, cascada de 60 ms); botones que suben 2 px; el libro flota 8 px cada 7 s; estrellas que parpadean; cambio de paso con la misma subida. Con «reducir movimiento» todo queda quieto.

## 4. Recorrido: cambios por paso

- **Landing:** portada en noche con el libro de Vera como objeto y la frase que lo creó; tres pasos con imágenes reales; un hojeador del libro de muestra; las cuatro portadas como libros; ideas de arranque que llevan a `/crear` con la idea elegida; ediciones con la de pago destacada; preguntas en tarjetas; cierre en noche.
- **Barra de progreso** de cinco tramos y título del paso; botón principal fijo abajo en móvil.
- **Paso 1:** la frase «Un cuento para [Vera], que tiene [6] años»; la idea en una hoja pautada; ideas con icono; tono en cuatro tarjetas. En escritorio, a la derecha, «así va su libro» con la portada que se va rellenando.
- **Paso 2:** cara (piel, pelo, peinado, ojos) arriba; el resto (gafas, rasgo, ropa, reparto, detalles, dedicatoria) en filas plegables con su resumen y una marca cuando están hechas.
- **Paso 3 escribiendo:** libro abierto con un lápiz que escribe y un camino de puntos; sin números falsos de página.
- **Paso 3 escrito:** cada página como hoja de libro, «se verá:» a mano, y «rehacer con una frase» con sugerencias.
- **Paso 4 email:** qué va a recibir, el email grande, consentimiento en dos casillas cortas.
- **Paso 4 personajes:** la hoja como foto pegada con cinta, versiones, cambios con palabras y sugerencias, la portada como libro y el PDF gratis a mano.
- **Paso 5:** hojeador del libro con las páginas por pintar (qué se pintará y el texto) y el pago en una tarjeta de noche.

## 5. Hallazgos del recorrido actual (13 oct)

Arreglados el 13 oct:

- Al volver al paso 4 de un libro guardado, la hoja y la portada decían «En cola…» mientras solo se cargaba la vista. Ahora solo brillan; «en cola» y «pintando» salen cuando lo están.
- Las miniaturas de peinados del paso 2 salían en blanco hasta cargar. Ahora tienen fondo de papel.
- «Empezar otro» y «Escribirlo de otra manera» usaban el `confirm()` del navegador. Ahora preguntan en la propia página.
- El aviso «Libro recuperado.» no desaparecía. Ahora se va a los 8 s o con su botón de cerrar; el de enlace caducado se queda.

## 6. Implementación (hecha el 13 oct)

1. Tokens y tipografías en `app/globals.css` y `app/layout.tsx` (Lora, Figtree y Patrick Hand con `next/font`). Las clases propias (`.btn-*`, `.card`, `.chip`, `.tile`, `.input`, `.madlib`, `.row`…) van en `@layer components` y lo base en `@layer base`, para que las utilidades de Tailwind las puedan ajustar en cada sitio.
2. Piezas comunes en `components/brand.tsx`: estrella, luna, colina, mancha, iconos de trazo y `BookCover` (el libro como objeto, con unidades de contenedor).
3. Landing (`app/page.tsx`, `components/landing/SampleFlipper.tsx`), con miniaturas propias del libro de muestra (`public/muestra/mini/`) y la hoja de Vera (`public/muestra/hoja-vera.webp`).
4. `/crear`: cabecera con «Paso n de 5» y barra de cinco tramos en móvil, pasos numerados en escritorio; barra de acción fija abajo en móvil; «así va su libro» a la derecha en escritorio (pasos 1–3); los cinco pasos rehechos sin tocar la lógica. Los `data-testid` y los nombres accesibles se mantienen; el test abre las filas plegables del paso 2.
5. Arreglados los cuatro hallazgos de §5. Nuevo: `/crear?idea=<id>` llega con la idea de la landing marcada, y la idea elegida sigue al nombre mientras no se toque a mano.
6. PDF (`lib/pdf/book2.ts`): Lora + Figtree, sin cursivas.
7. Comprobado: tsc, eslint, 77 unitarios, build, 8 tests de Playwright y capturas en móvil (390 px) y escritorio (1440 px) de la landing y de todos los pasos, también con imágenes del libro de muestra en lugar de las de prueba.

Sin coste de generación.
