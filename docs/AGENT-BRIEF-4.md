# Brief 4 — escenas vectoriales con calidad de ilustración

Working tree `/home/claude/repo-cuentos` (rama `feat/fase-1-journey-clasico`). Solo tocas `web/components/Scene.tsx` (y, si hace falta, `web/components/Finish.tsx`). No commits, no push: yo los hago.

## Situación

Las figuras (niño, mascotas, abuelos) son piezas pintadas en gouache y se ven bien. Los fondos y los objetos de las 12 escenas son vectoriales y se ven planos y de plantilla: paredes vacías con rayas verticales, muebles de un solo tono, una cama que es dos rectángulos. Captura actual de las 12 escenas: `web/capturas/v4/escenas-antes.png`. El objetivo es que el fondo esté a la altura de las figuras: que todo parezca pintado por la misma mano.

Los fondos pintados reales (imágenes) llegarán después por otro camino (`docs/ASSETS.md`); el bloque `if (bg && style)` de `Scene` que los dibuja **no se toca**. Este brief es la versión vectorial, que es la que verá todo el mundo mientras tanto y la que queda de respaldo.

## Qué hacer

1. **Luz y materia en `Room` y `Outdoor`.** Pared con degradado cálido y una mancha de luz suave desde el lado de la ventana (radial, baja opacidad); rodapié; suelo de tablas de madera con dos tonos y veta sugerida (líneas finas que se desvanecen), sombra de contacto donde pared y suelo se encuentran. Exterior: cielo con degradado, dos planos de colinas de tonos distintos, arbustos y manchas de flores pequeñas, un camino o claro donde pisan las figuras. Colores desaturados y cálidos, en armonía con las piezas gouache (mirar `web/public/pieces/gouache/bodies/jersey.png` y `web/public/styles/gouache.jpg`): nada de azules y verdes puros.
2. **Objetos con volumen.** Cada prop con base + sombra + luz (dos o tres tonos), bordes ligeramente irregulares (ya los da el filtro `rough`), sombra de contacto en el suelo. Cama con cabecero, almohada, edredón con pliegue; mesa con grosor y patas en perspectiva; silla; sillón con cojín; puerta con marco, panel y pomo; árbol con copa de dos o tres masas; columpio con cuerdas y asiento; banco con listones; tarta con glaseado que chorrea; regalo con cinta y lazo; ventana con marco, alféizar, cortina y luz que entra (haz suave en diagonal sobre la pared/suelo, opacidad baja).
3. **Atrezo compartido para que las paredes no estén vacías**: cuadro enmarcado, estantería con libros, planta en maceta, lámpara, alfombra ovalada bajo las figuras, cojines. Reutilízalos en las escenas de interior con criterio (dos o tres por escena, no todos). Exterior: pájaros, nubes de dos tonos, flores, una cometa o un pequeño sendero.
4. **Composición.** Las posiciones de `hero(...)` y `comp(...)` se pueden retocar (están en unidades de escena, pies en la línea del suelo), pero las figuras no se solapan con el atrezo que debería quedar delante de ellas, no se cortan y el acompañante «busto» (abuelos) queda detrás de algo (mesa, banco, sofá, regalo, borde inferior) para que no parezca una pegatina flotando: hoy en `parque` flota sobre el césped.
5. **Noche (`cama-noche`)**: azules apagados con luz cálida de una lámpara o de la luna; que no quede gris sucio.

## Reglas

- Mantén la API de `Scene` (props, `data-painted-bg`, `aria-label`, `data-testid` de nadie se toca) y los ids de escena. Nada de emojis nuevos en la interfaz (los `emoji` de `Thought`/`Gift` vienen de datos, se mantienen).
- Sin dependencias nuevas. Todo SVG inline. Los degradados y filtros que definas dentro de un prop necesitan ids únicos por instancia (usa `useId` o un sufijo por props) porque hay 12 escenas en una misma página.
- Rendimiento: 13 hojas en una página de impresión; evita filtros pesados por objeto (el `rough`/`paint` ya envuelven la escena). Degradados y formas, sí; `feTurbulence` por prop, no.
- `npm run lint` y `npx tsc --noEmit` limpios al terminar.

## Cómo verificar (obligatorio)

- Servidor de desarrollo aparte: `cd web && npx next dev -p 3021 > /tmp/dev3021.log 2>&1 &` (en 3017 hay un `next start` que no es tuyo; no lo mates).
- Capturas: `PORT=3021 npx playwright test tests/_scratch_sheets.spec.ts` genera `web/capturas/v4/escenas/p01..p12.png`; monta la hoja de contacto con el mismo Python que generó `escenas-antes.png` (PIL, 4×3 a 450×300) y guárdala como `web/capturas/v4/escenas-despues.png`. **Mírala** (Read) y corrige lo que se vea mal: figuras cortadas o solapadas, colores que desentonan con las piezas, atrezo que tapa la cara. Itera hasta que las 12 aguanten al lado de las figuras. Guarda también una captura a tamaño completo de dos escenas (`p09` y `p07`) para que yo las vea de cerca.
- Al final: `npm run lint`, `npx tsc --noEmit`, y `npm test` contra el servidor 3021 (`PORT=3021 npm test`): los 8 tests deben pasar.

## Informe (≤250 palabras, sin adjetivos)

Qué cambiaste por bloque (fondos, props, atrezo, composición), qué viste en las capturas y corregiste, salidas de lint/tsc/test, y qué no conseguiste.
