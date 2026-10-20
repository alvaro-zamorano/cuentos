# Brief 3 — `cuentos` · Rediseño editorial y edición pintada

Fecha: 9 oct 2026. Working tree `/home/claude/repo-cuentos` (rama `feat/fase-1-journey-clasico`, mismo contenido que el remoto). Lee `PRD.md` §6, `README.md` y los briefs anteriores en `docs/` solo si necesitas contexto. Álvaro se encarga de generar assets nuevos con ChatGPT; tú no generas nada.

## Decisión de producto que cambia este brief

El cliente es un adulto que quiere **un regalo de verdad** para sus hijos: tono profesional, elegante, sin "baby talk". Nada de "peque", "¡vamos!", emojis en la interfaz, exclamaciones, diminutivos ni frases de animación infantil. La estética cambia de "app de juegos" a **editorial / librería**: la ilustración es lo único infantil; la interfaz es seria y bella.

## A. Copy (todo el sitio)

Reglas:
- Trata al lector de "tú" pero con registro adulto. Frases cortas, precisas, sin relleno. Ejemplos de registro: "Un libro que solo existe para él." / "Elige cómo es. Elige quién le acompaña. Nosotros escribimos y pintamos el resto." / "Impreso en casa en cinco minutos, o en tapa dura en tu puerta."
- Palabras prohibidas: peque, peques, chiqui, nene, bebé (salvo ocasión "hermanito"), ¡…! en botones y titulares, emojis en textos de interfaz (los chips de "detalle especial" y ocasiones pueden conservar un icono pequeño, pero no emoji en titulares, botones ni párrafos).
- Nombra al niño por su nombre cuando lo haya ("el cuento de Vera"), y como "tu hijo" / "tu hija" / "el protagonista" cuando no.
- Botones: imperativo sobrio ("Continuar", "Ver el libro", "Descargar PDF", "Aprobar"), no "Me gusta, a imprimir" ni "Sorpréndeme" (→ "Aleatorio").
- Legal y privacidad: mismo contenido, mismo registro adulto; la declaración del comprador pasa a "Declaro ser madre, padre o tutor legal del menor, o contar con su autorización".
- Landing nueva, estructura: titular + subtítulo + CTA; tres pasos (Quién · Su mundo · El libro); una muestra del libro (doble página real con `Scene`); sección "Ediciones" (Clásico PDF gratis · Ilustrado PDF · Tapa dura) con precios "desde" como texto; sección "Cómo lo hacemos" (avatar sin fotos, historia escrita para él, ilustración consistente, impresión en casa o encuadernado); FAQ corta (privacidad del menor, qué pasa con los datos, devolución en bienes personalizados); footer legal. SEO: title/description en castellano con intención "cuento personalizado" / "regalo cumpleaños niño".
- Actualiza los tests Playwright (`tests/journey.spec.ts`) a los textos nuevos. Los `data-testid` existentes se conservan.

## B. Diseño (todo el sitio)

- Tipografía: display serif editorial (Fraunces o Playfair Display vía `next/font/google`, pesos 500–700, ligera opsz) para titulares; sans neutra (Inter o Geist) para interfaz; el texto del cuento sigue en serif legible (puede ser la misma display en peso 400 y tamaño grande, o Literata).
- Paleta sobria: papel #f7f3ec, tinta #1f1a17, tinta suave #5c534b, línea #e4dcd0, un solo acento profundo (verde botella #1f4d3a o terracota #b5543a; elige uno y úsalo solo en CTA y enlaces), y blanco para tarjetas. Fuera coral/sun/lilac como colores de interfaz (siguen existiendo en `lib/traits.ts` para ropa; no los toques ahí).
- Componentes: botones rectangulares con radio 6–8 px, sin sombra "3D"; tarjetas con borde fino 1 px, sin sombras duras; chips como "segmented" discretos; inputs con borde inferior o borde fino; espaciado generoso; máx. 72 ch de ancho de texto; alineación a una retícula de 8 px. Móvil primero (390 px): el journey debe seguir usándose entero en móvil.
- Microcopy del progreso de pasos: "1 Quién · 2 Su mundo · 3 El libro · 4 Edición".
- Vista de impresión (`/libro`): portada elegante (título en serif grande, dedicatoria en cursiva, figura pintada), página interior con ilustración enmarcada y texto en columna; numeración discreta; conserva `@page A4 landscape`, 13 hojas y `section.sheet`.
- Carga la skill `frontend-design` (Skill tool) antes de tocar el diseño y aplica su guía; evita el aspecto "plantilla de IA".

## C. Edición ilustrada = escenas pintadas (sustituye al collage)

- `components/IllustratedScene.tsx` deja de usar el ancla + recortes. Ahora renderiza `<Scene style={styleId} …>` (escena vectorial con acabado + figuras pintadas) cuando `piecesFor(styleId)` existe; si no existe para ese estilo, renderiza `<Scene style={DEFAULT_PAINTED_STYLE}>` y muestra una etiqueta discreta "Estilo disponible próximamente; vista en gouache".
- En `/ilustrado`, el selector de estilos marca como "Disponible" solo los estilos con piezas (hoy gouache) y el resto como "Próximamente" (seleccionables para avisar, no para ilustrar). La hoja de personaje (`CharacterSheet`) pasa a componer la figura pintada (`PaintedFigure`) en 3 vistas (frontal, espejo, y busto grande = cabeza) sobre fondo papel, sin recortes del catálogo antiguo.
- El progreso de 12 páginas se mantiene como experiencia (simulación de 300–800 ms por página) pero sin la etiqueta "demostración": ahora es real. Elimina `DRY_RUN_NOTICE` de la interfaz y los textos que digan que la ilustración final se genera después.
- `lib/illustration.ts`: deja solo lo que siga usándose (claves de validez de hoja/páginas, `pagesKey`, `sheetKey`, `validPages`); borra `ANCHOR_BOXES`, `pageLayout`, `heroCrop`, `companionCrop` y `CutoutImage.tsx` si nadie los usa. `StyleImage` sigue sirviendo para las miniaturas del selector.
- Precios en la pantalla de edición: Clásico PDF "Gratis", Ilustrado PDF "14,90 €", Tapa dura "desde 39,90 €" (marcados en código como constantes en `lib/pricing.ts` con comentario "hipótesis PRD §10"). El pago simulado se mantiene detrás de `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`, etiquetado con sobriedad ("Pago de prueba — sin cargo").

## D. Verificación y entrega

- `npm run lint` sin errores, `npx tsc --noEmit` limpio, `NEXT_PUBLIC_DRY_RUN_PAYMENT=1 npm run build` limpio, `npm test` con todos los tests pasando (actualízalos a los textos nuevos).
- Captura de pantalla con Playwright a 390×844 de: landing, paso Quién, paso El libro, pantalla Edición, `/ilustrado` (estilo + hoja + preview) y una hoja de `/libro`. Míralas (Read) y corrige lo que se vea mal antes de dar por terminado. Guárdalas en `/home/claude/repo-cuentos/capturas/v3/`.
- Commits en la rama con la atribución del sistema. Nunca `main`, nunca `--force`.
- Publica con `mcp__github__push_files` (ToolSearch `select:mcp__github__push_files,mcp__github__get_file_contents,mcp__github__update_pull_request`), owner `alvaro-zamorano`, repo `cuentos`, rama `feat/fase-1-journey-clasico`, lotes ≤8 archivos, solo texto. Antes de cada lote comprueba con `get_file_contents` el estado remoto del archivo que vas a sobrescribir (el remoto es la fuente de verdad). No toques `web/public/catalog` ni `web/public/pieces`. Si borras archivos, indícalo en el informe (push_files no borra: deja el archivo vacío con un comentario "obsoleto, borrar" y anótalo).
- Actualiza la descripción del PR #1 (`update_pull_request`) con el estado real, terminada con la atribución del sistema.
- Informe final ≤350 palabras, sin adjetivos: hecho y verificado (comandos y salidas), capturas revisadas, decisiones, pendiente.

## Reglas

Ninguna clave real. Nada de generación de pago. No afirmes que algo funciona sin haberlo ejecutado y visto. No amplíes alcance (sin Stripe real, sin POD).
