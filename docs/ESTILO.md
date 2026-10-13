# Estilo «La hora del cuento» — propuesta (13 oct 2026)

**Estado: propuesta, pendiente del visto bueno de Álvaro.** Si se aprueba, sustituye la decisión del 9 oct «estética editorial; Fraunces + Geist; verde botella como único acento». El registro adulto del texto (sin diminutivos ni emojis) se mantiene.

Maquetas en el lienzo de diseño «Cuentos · La hora del cuento» (claude.ai, privado de Álvaro): sistema de estilo, landing en escritorio y móvil, y los pasos de `/crear` (1 en móvil y escritorio, 2, 3 escribiendo, 3 escrito, 4 email, 4 personajes, 5 libro y pago). Usan las imágenes reales del libro de muestra y de las cuatro portadas.

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
- Titulares: Fraunces con los ejes `SOFT 100` y `WONK 1`, peso 600–640. Cursiva en teja o estrella para la palabra que importa.
- El cuento: Fraunces de texto (`opsz 14`, `SOFT 50`), 17–23 px.
- Interfaz: Figtree 400/600/700 (sustituye a Geist).
- Notas a mano: Kalam, con moderación (antetítulos, «se verá:», pies de foto).

**Forma:** botones y chips píldora; tarjetas de 20–24 px de radio; secciones de 28 px; imágenes de 14. El libro se enseña como objeto: A4 vertical, ilustración 3:2 arriba con el título, «para Vera» en la banda (como el PDF real), lomo sombreado y cantos de papel.

**Motivos:** estrella de cuatro puntas, luna, colina entre la noche y la crema, manchas de gouache detrás de las imágenes, cinta adhesiva en la hoja de personajes, camino de puntos para el progreso.

**Movimiento:** entradas que suben 12 px con fundido (500 ms, curva suave, cascada de 60 ms); botones que suben 2 px; el libro flota 8 px cada 7 s; estrellas que parpadean; cambio de paso con deslizamiento de 24 px. Con «reducir movimiento» todo queda quieto.

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

- Al volver al paso 4 de un libro guardado, la hoja y la portada dicen «En cola…» durante unos segundos mientras solo se está cargando la vista.
- Las miniaturas de peinados del paso 2 salen en blanco hasta que cargan (sin color de fondo).
- «Empezar otro» usa el `confirm()` del navegador.
- El aviso «Libro recuperado.» no desaparece.

## 6. Implementación propuesta (si se aprueba)

1. Tokens y tipografías en `app/globals.css` y `app/layout.tsx` (Fraunces con `SOFT`/`WONK`, Figtree, Kalam); componentes base (botón, chip, tarjeta, libro, barra de progreso, barra fija).
2. Landing (`app/page.tsx`).
3. Marco de `/crear` (progreso, barra fija, transiciones) y los cinco pasos, sin tocar la lógica ni los `data-testid`.
4. PDF (`lib/pdf/book2.ts`): misma tipografía de titulares en la portada.
5. Comprobación: tsc, eslint, unitarios, build, Playwright y capturas en móvil y escritorio.

Sin coste de generación. El acento de la acción se puede cambiar en el lienzo (teja, noche o verde) para compararlo.
