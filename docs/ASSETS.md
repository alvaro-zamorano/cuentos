# Assets externos: fondos y poses

Cómo generar con ChatGPT (modelo de imagen) los fondos pintados y las poses que el compositor integra sin más trabajo manual. Hoy solo existe el estilo `gouache`; el mismo esquema sirve para los demás (`acuarela`, `lapiz`, `flat`, `papercraft`, `3d`).

## Dónde dejarlos

```
assets/raw/<estilo>/backgrounds/<escena>.png      (o .jpg / .webp)
assets/raw/<estilo>/poses/<pose>/<prenda>.png
```

`assets/raw/` no se versiona. Después:

```
python3 scripts/pieces_build.py <estilo>
```

El script recorta, redimensiona y escribe `web/public/pieces/<estilo>/…` y `pieces.json`. Lo que no coincida con un nombre conocido se ignora con aviso. Todo es opcional: una escena sin fondo pintado se dibuja en vectorial; una pose que falta usa el cuerpo de pie.

## Fondos (12 escenas)

Formato de entrada: cualquier tamaño, proporción 3:2 (si no, se recorta centrado). Salida: 1200×800 JPEG. En la escena ocupa el viewBox 600×400, así que 1 px de salida = 0,5 unidades.

Reglas de composición que el compositor da por hechas (ver `scripts/backgrounds_layout.json`; se puede ajustar ahí sin tocar código):

- **Sin personajes ni animales.** El protagonista, el acompañante y las velas se superponen después.
- **Suelo visible** en la franja inferior: los pies apoyan en la línea `ground` (372/400 = 93 % de la altura en casi todas; 350 en `cama-manana` y `nube-deseo`, 356 en `cama-noche`).
- **Zona despejada** donde va el protagonista: centro horizontal `hero.x` y altura `hero.h` (≈ 200–230 unidades, es decir, el 50–58 % de la altura de la imagen), sin muebles que deban quedar por delante de él.
- Si hay acompañante (`comp`), otra zona despejada a su derecha o izquierda.
- `mesa-tarta` y `velas`: la tarta **sin velas**; la parte superior de la tarta centrada en (300, 200) y (330, 205) respectivamente, en unidades de escena (el 50 % de la altura de la imagen). Las velas (tantas como años) se dibujan encima.
- `nube-deseo`: dejar libre la esquina superior derecha (desde x = 330, y = 40): ahí va la nube de pensamiento con el detalle especial.
- Luz cálida de día en todas salvo `cama-noche` (noche azul, lámpara o luna).

Prompt base (añadir al final la línea de cada escena):

> Ilustración de libro infantil en gouache sobre papel, pinceladas visibles, colores cálidos y saturados, bordes suaves, textura de papel. Escenario vacío, sin personas ni animales. Composición horizontal 3:2, suelo visible en el tercio inferior, zona central despejada para colocar después a un personaje de pie. Misma paleta y mismo acabado que la imagen de referencia adjunta (`web/public/styles/gouache.jpg`).

| archivo | escena |
|---|---|
| `cama-manana` | Dormitorio infantil por la mañana, cama a la izquierda, ventana con sol a la derecha; espacio libre delante de la cama (el niño va sentado al borde, pies a 350). |
| `ventana` | Interior junto a una ventana grande centrada con calle soleada y pájaros fuera; suelo delante despejado. |
| `desayuno` | Cocina con mesa de desayuno a la derecha (tostadas con forma de estrella, zumo), un globo rojo atado a una silla; espacio libre a la izquierda. |
| `puerta-regalo` | Recibidor con la puerta de entrada abierta a la derecha y una caja de regalo grande envuelta junto a ella; espacio libre a la izquierda. |
| `salon-globos` | Salón decorado con globos de colores y guirnaldas de papel, sofá al fondo; dos zonas despejadas (izquierda y derecha). |
| `nube-deseo` | Salón tranquilo con un sillón a la izquierda y una lámpara; esquina superior derecha vacía (nube de pensamiento). |
| `parque` | Parque soleado con columpios al fondo, tobogán y un árbol grande; césped en primer plano despejado a la derecha, banco a la izquierda. |
| `jardin-juego` | Jardín con flores, una piedra con un papelito debajo, arbustos; césped despejado en el centro y la derecha. |
| `mesa-tarta` | Comedor de fiesta: mesa centrada con una tarta rosa de dos pisos **sin velas**, guirnaldas; zonas libres a izquierda y derecha de la mesa. |
| `velas` | Primer plano de mesa con una tarta grande **sin velas** ligeramente a la derecha del centro, habitación en penumbra cálida; espacio libre a la izquierda. |
| `abrir-regalo` | Salón con una caja de regalo abierta en el centro-derecha, papel y confeti por el suelo; espacio libre a la izquierda. |
| `cama-noche` | El mismo dormitorio de noche, luz azul, luna en la ventana, un regalo pequeño junto a la cama; espacio libre delante (niño acostado o sentado, pies a 356). |

## Poses (cuerpos alternativos)

Hoy el cuerpo siempre es «de pie». Cada pose es una figura **entera** (con cabeza; el script la quita y la sustituye por la cabeza elegida) con estas condiciones:

- Fondo blanco liso, figura centrada, sin sombra en el suelo, sin recortes.
- **El mismo niño de referencia** que en el catálogo: piel melocotón clara, pelo castaño corto, para que el recolor de piel y pelo funcione. La cara no importa (se descarta).
- Cuerpo entero, pies dentro del encuadre; en poses sentadas, lo que apoya (silla, cama) **no** se dibuja.
- Una imagen por prenda. Nombres exactos de prenda: `chubasquero`, `peto`, `jersey`, `marinera`, `vestido`, `plumifero`, `pijama`, `verano` (ver `web/lib/traits.ts`, columna `en` para describirlas).

Poses que usan las escenas (`SCENE_POSE` en `web/lib/pieces.ts`); en orden de prioridad:

| pose | escenas | descripción para el prompt |
|---|---|---|
| `brazos-arriba` | salon-globos, abrir-regalo | de pie, brazos levantados, celebrando |
| `sentado` | cama-manana, nube-deseo | sentado de frente, piernas colgando |
| `soplando` | velas | de pie, inclinado hacia delante, mejillas hinchadas, manos en la mesa (sin mesa) |
| `corriendo` | parque | corriendo hacia la derecha, vista de tres cuartos |
| `saltando` | jardin-juego | saltando con los pies despegados |

Prompt por imagen:

> Hoja de personaje, un solo niño de cuerpo entero sobre fondo blanco liso, ilustración gouache de libro infantil, misma técnica que la referencia adjunta. Niño de unos 6 años, piel melocotón clara, pelo castaño corto, {prenda en inglés de `traits.ts`}, pose: {descripción}. Sin sombra, sin objetos, sin texto.

Con 5 poses × 8 prendas son 40 imágenes; el mínimo útil son `brazos-arriba` y `sentado` para las 8 prendas (16).

## Otros estilos

Las piezas se generan en el build (`web/scripts/pieces-build.mjs`, `prebuild`) para cada estilo cuyo catálogo tenga `hair/` y `outfit/` completos. Hoy: gouache, flat y lapiz. Para activar los demás falta, en `web/public/catalog/<estilo>/`, con los mismos nombres de archivo que en `gouache` y la misma construcción (bust con chubasquero amarillo para los peinados; figura entera sobre blanco para las prendas):

| estilo | falta |
|---|---|
| `3d` | `hair/` (12 peinados: afro, coleta, corto, flequillo, melena, mono, ondulado, rapado, rizos-largos, rizos-media, rizos, trenzas) |
| `papercraft` | `hair/` (los mismos 12) |
| `acuarela` | `hair/` (12) y `outfit/` (8: chubasquero, jersey, marinera, peto, pijama, plumifero, verano, vestido) |

Con esas imágenes en el catálogo, el selector marca el estilo como disponible en el siguiente deploy sin tocar código. El ancla `web/public/styles/<estilo>.jpg` ya existe para los seis.
