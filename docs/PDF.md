# PDF en servidor

`POST /api/pdf { draft, edition }` devuelve el libro como `application/pdf`: 13 páginas A4 apaisadas (portada + 12), unos 5–6 MB, en 10–20 s. Lo usan el botón «Descargar PDF» del paso 4 (Clásico, tras guardar el email) y el de `/ilustrado`. La vista `/libro?print=1` (imprimir desde el navegador) se mantiene como alternativa y es a lo que llevan los enlaces si el servidor no puede.

## Cómo

1. `lib/pdf/render.ts` abre un Chromium sin cabeza (puppeteer-core) con el borrador sembrado en `localStorage` (`cuentos:draft:v1`, la misma clave que usa la app), carga `/libro?edition=…&pdf=1` del propio origen y espera a las 13 hojas, las tipografías y las imágenes.
2. Fotografía cada `section.sheet` (JPEG, calidad 86, ×3 ≈ 290 ppp) y monta el PDF con `pdf-lib` (título = título del cuento).

Se fotografía en vez de usar `page.pdf()` porque los filtros SVG del acabado pintado hacen que Chrome rasterice cada capa por separado a 300 ppp: 80 bitmaps y 86 MB por libro. Con una foto por hoja son ~5 MB. El texto va rasterizado (no seleccionable); a 290 ppp imprime nítido.

## Chromium

- **Vercel**: `@sparticuz/chromium-min` descarga el paquete (~60 MB) de `CHROMIUM_PACK_URL` (por defecto la release v140 de Sparticuz) en el primer arranque de la función y lo deja en `/tmp`. `maxDuration = 60`. `next.config.ts` lo marca en `serverExternalPackages`.
- **Local y tests**: `CHROME_PATH` o, si no, el Chromium de Playwright (`/opt/pw-browsers/...`). Sin ninguno, la ruta responde 503 `no_chromium` y la interfaz ofrece la vista de impresión.

## Límites

1 petición por segundo y 10 por minuto por IP (memoria del proceso). Cuerpo ≤ 200 KB. El borrador viaja en la petición: no hace falta Supabase.

## Verificación

`npm test` → «Clásico: de /crear al PDF de 13 hojas» descarga el archivo y comprueba con `pdfinfo` 13 páginas y tamaño A4 apaisado.
