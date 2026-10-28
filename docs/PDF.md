# PDF en servidor

`POST /api/pdf { draft, edition }` devuelve el libro como `application/pdf`: 13 páginas A4 apaisadas (portada + 12), unos 5–6 MB, en 10–20 s. Lo usan el botón «Descargar PDF» del paso 4 (Clásico, tras guardar el email) y el de `/ilustrado`. La vista `/libro?print=1` (imprimir desde el navegador) se mantiene como alternativa y es a lo que llevan los enlaces si el servidor no puede.

## Cómo

1. `lib/pdf/render.ts` abre un Chromium sin cabeza (puppeteer-core) con el borrador sembrado en `localStorage` (`cuentos:draft:v1`, la misma clave que usa la app), carga `/libro?edition=…&pdf=1` del propio origen y espera a las 13 hojas, las tipografías y las imágenes.
2. Fotografía cada `section.sheet` (JPEG, calidad 86, ×3 ≈ 290 ppp) y monta el PDF con `pdf-lib` (título = título del cuento).

Se fotografía en vez de usar `page.pdf()` porque los filtros SVG del acabado pintado hacen que Chrome rasterice cada capa por separado a 300 ppp: 80 bitmaps y 86 MB por libro. Con una foto por hoja son ~5 MB. El texto va rasterizado (no seleccionable); a 290 ppp imprime nítido.

## Chromium

- **Vercel**: desde el 27 oct, `@sparticuz/chromium` 153 viaja dentro de las funciones que maquetan PDF y se descomprime en `/tmp` en el primer arranque (antes, `@sparticuz/chromium-min` descargaba de GitHub el paquete de `CHROMIUM_PACK_URL`, que ya no se usa). `maxDuration = 60`. `next.config.ts` lo marca en `serverExternalPackages`.
- **Local y tests**: `CHROME_PATH` o, si no, el Chromium de Playwright (`/opt/pw-browsers/...`). Sin ninguno, la ruta responde 503 `no_chromium` y la interfaz ofrece la vista de impresión.

## Límites

1 petición por segundo y 10 por minuto por IP (memoria del proceso). Cuerpo ≤ 200 KB. El borrador viaja en la petición: no hace falta Supabase.

## Tiempos medidos

- Local (Chromium de Playwright): ~15 s, 13 hojas, 2,5 MB a escala 2 (5,6 MB a escala 3).
- Vercel preview (11 oct, `37d0d36`, iad1): **26 s** en frío: Chromium listo en 3 s (descarga del paquete y arranque), página cargada en 4 s, las 13 fotos en 20 s (los filtros SVG del acabado pintado son lo caro: ~1,5 s por hoja). Resultado: 2,9 MB, 13 páginas A4 apaisadas. Dentro del tope de 60 s de la función; si se acerca, las opciones son fotografiar en dos pestañas a la vez o aligerar los filtros en modo `pdf=1`.

Dos errores que hubo y cómo se evitan: `networkidle0` nunca llegaba en las previews (la barra de Vercel mantiene conexiones): se espera a `load` + las 13 hojas + tipografías, y se manda la cookie `__vercel_toolbar=0`. Y el paquete de Sparticuz es el *headless shell*: puppeteer tiene que lanzarlo con `headless: "shell"` (con `true` añade `--headless=new` y el arranque se queda colgado hasta el tope).

## Verificación

`npm test` → «Clásico: de /crear al PDF de 13 hojas» descarga el archivo y comprueba con `pdfinfo` 13 páginas y tamaño A4 apaisado. En Vercel: `curl -X POST …/api/pdf` con un borrador devuelve `application/pdf` (comprobado el 11 oct).
