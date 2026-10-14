# ESTADO — cuentos

Actualizado: 2026-10-14 (PR #2, #3 y #4 unidos a la rama de trabajo) · Fase: B1–B5 hechos (a B5 le faltan las claves) · B6 en parte · B7 pendiente

La memoria entre sesiones. Se actualiza en el momento, no al final. El log de decisiones (§2) es append-only: nunca se borra, solo se añade. Mapa de documentos y accesos: `INDICE.md`. Plan, bloques y abiertos (E#): `PLAN.md`.

## 1. Foco actual

- **Ahora:** la preview de la rama de trabajo está completa desde el 14 oct: estilo «La hora del cuento», copy nuevo de la landing, `/api/dev` cerrado y legales al día, con imágenes reales (Nano Banana). Que Álvaro la recorra y la enseñe, y juzgue la UX y el recorrido.
- **Después:** claves de Stripe y Resend (B5), legales (E6), prueba con tres personas ajenas (B7) y salida a producción.
- **Fuera de foco ahora:** tapa dura, más estilos de ilustración, el Reel (B6), el flujo antiguo (`/clasico`, `/ilustrado`, `/libro`, `/gratis`).

## 2. Log de decisiones (append-only)

### Entradas anteriores (copiadas tal cual de PLAN §8 el 13 oct)

- 8 oct: solo ocasiones felices; sin fotos del menor; avatar por rasgos.
- 9 oct: registro adulto en todo el sitio; estética editorial; Fraunces + Geist; verde botella como único acento.
- 9 oct: Clarity solo tras consentimiento; franja superior, no flotante.
- 9 oct (tarde): la v1 pasa de plantillas a motor de generación (historia única por LLM + ilustración por hoja de personaje) con gasto antes del pago acotado.
- 11 oct: motor de historia con `mock`; el proveedor real se activa por variable de entorno. Los nombres que el adulto escribe en los detalles cuentan como permitidos.
- 13 oct (Álvaro): el look de piezas queda plantilla y las combinaciones no cuadran; los padres tienen que poder hacer la historia que quieran con poco esfuerzo; calibrar con Nano Banana desde Higgsfield como si fuera la clave de Gemini.
- 13 oct: Fase 0 hecha y positiva (`docs/FASE0.md`).
- 13 oct (Álvaro): todo lo que ve el padre es ilustración generada, un estilo para salir y más estilos en el futuro; gratis = texto + hoja + portada + PDF casero; hasta ≈ 0,30 $ por lead antes del pago; página con imagen 3:2 y texto en banda; libro de muestra «Vera y Toby viajan a la Luna».
- Sustituidas por D1 (13 oct): «Clásico e Ilustrado comparten las figuras pintadas» (9 oct) y «las piezas se generan en el build» (9 oct).
- 13 oct (tarde): textos con Claude Sonnet 5.5 (razonamiento mínimo, esfuerzo medio); dirección de arte con Haiku 5.5; control de calidad con Sonnet 5.5. Los modelos 5.x no admiten `temperature`.
- 13 oct (tarde): moderación local + del planificador. Se permiten emociones pequeñas (nervios, miedo a la oscuridad) que se resuelven; siguen fuera muerte, violencia, armas, sexo, drogas, marcas, personajes con derechos y famosos reales (se sustituyen y se avisa al padre).
- 13 oct (tarde): el aspecto (pelo, piel, ropa) no cambia el cuento escrito; lo corrige la hoja de personajes con palabras.
- 13 oct (tarde): la landing dice en las preguntas que el cuento lo escribe e ilustra una IA y que el padre lo revisa todo.
- 13 oct (B5): Stripe Checkout sin SDK; el pedido solo lo crea el webhook firmado. El pago de prueba nunca funciona en producción (`VERCEL_ENV`), aunque se quede puesta la variable. El servidor pinta en segundo plano y el navegador, si sigue abierto, ayuda con los mismos jobs.

### Desde el 13 oct (noche)

| Fecha | Decisión | Por qué | Docs afectados |
|---|---|---|---|
| 2026-10-13 | Borrado a 30 días con un cron diario de Vercel (`/api/cron/purge`, 03:17 UTC). Un libro caducado sin pagar se borra con sus imágenes. Uno pagado se vacía (sin ficha, plan, jobs ni imágenes) y conserva el pedido y el email del cliente. Los planes cacheados de más de 30 días se quedan sin ficha ni cuento, pero conservan coste y modelo | El consentimiento del paso 4 promete el borrado y no existía. Los pedidos se conservan por contabilidad | `web/lib/purge.ts`, `web/vercel.json`, PLAN (E14 cerrado, E17) |
| 2026-10-13 | `CRON_SECRET` es obligatorio en producción: sin él, la ruta de borrado no hace nada. Fuera de producción funciona sin secreto, para probarla | Evitar que cualquiera dispare el borrado; poder probarlo en la preview | `.env.example`, PLAN §7 |
| 2026-10-13 | El webhook de Stripe apunta al alias fijo de la rama en la preview | La protección de despliegues del proyecto está desactivada, así que Stripe puede llegar | `PAGO.md` |
| 2026-10-13 | La letra del PDF se queda en 20 pt. El blanco bajo el texto se debe al formato (D5), no a la letra | Mirado a buena resolución: 20 pt es legible. «Letra pequeña» salió de mirar una miniatura | PLAN (E15) |
| 2026-10-13 | Las rayas de diálogo del PDF van pegadas a la palabra siguiente (WORD JOINER) | Quedaban colgando al final del renglón | `web/lib/pdf/text.ts` |
| 2026-10-13 | «Subimos todo» se lee como: código subido a la rama y probado en la preview. La salida a producción (unir el PR #1 a `main`) espera a legales, Stripe y `CRON_SECRET`. *Interpretación de Claude; pendiente de que Álvaro la confirme* | Producción sin legales ni borrado ni pago real no se puede abrir al público | PLAN §7 |
| 2026-10-13 | Un único registro de decisiones: este. PLAN §8 apunta aquí | Dos registros se desincronizan | PLAN |
| 2026-10-13 | La documentación para cambiar de hilo vive en el repo (`docs/INDICE.md` y `docs/ESTADO.md`, que mandan) con una copia en el Project (`claude/00-INDICE.md`, `claude/00-ESTADO.md`). Quien cambie uno actualiza el otro | Los hilos de chat leen el Project; los de código leen el repo | INDICE, CLAUDE.md |
| 2026-10-13 | El paso 2 enseña lo que se elige con imágenes. Peinados y gafas llevan miniaturas que se repintan con la piel y el pelo elegidos; en las gafas solo la piel. La ropa y las mascotas llevan miniaturas que rellenan el texto con lo que se ve, y el texto se puede retocar. Los ojos muestran su color. Las miniaturas salen del catálogo gouache que ya existía, sin coste de generación | Álvaro, al hacer el recorrido: sin imágenes cuesta saber qué se está eligiendo | `StepHero.tsx`, `Tiles.tsx`, `lib/crearPicks.ts`, `public/crear/`, `scripts/crear-thumbs.mjs` |
| 2026-10-13 | Estilo «La hora del cuento» aprobado por Álvaro, con Lora (titulares y cuento), Figtree (interfaz) y Patrick Hand (notas a mano). Sustituye «estética editorial; Fraunces + Geist; verde botella» del 9 oct. Teja solo para acciones; noche para la marca y el pago | Álvaro: la web era sobria; la propuesta le pareció bien, pero no la «f» de Fraunces | `ESTILO.md`, `globals.css`, `layout.tsx`, `app/page.tsx`, `app/crear/page.tsx`, `components/crear/*`, `lib/pdf/book2.ts` |
| 2026-10-13 | Sin cursivas en la dedicatoria ni en el cuento (web y PDF); el énfasis va en color | La «f» cursiva de las serif tiene el mismo problema | `ESTILO.md`, `lib/pdf/book2.ts`, `BookSheet.tsx` |
| 2026-10-13 | El estilo va en la rama `feat/estilo-hora-del-cuento`, con PR hacia `feat/fase-1-journey-clasico` | La preview de la rama de trabajo no cambia mientras Álvaro lo revisa, y otra sesión trabaja en esa rama | — |
| 2026-10-13 | Paso 2: arriba solo la cara; gafas, rasgo, ropa, reparto, detalles y dedicatoria en filas plegables con su resumen. Paso 5 antes del pago: las doce páginas en una tira horizontal y el pago justo debajo | Las maquetas aprobadas: menos pared de opciones y el pago a la vista | `StepHero.tsx`, `StepBook.tsx`, `tests/crear.spec.ts` |
| 2026-10-13 | Producción (unir el PR #1 a `main`) espera a los datos legales, `CRON_SECRET` y `SITE_URL`. Confirma la interpretación de «subimos todo» | Álvaro, al pedir subir a producción y ver lo que faltaba: el consentimiento promete el borrado a 30 días y las páginas legales tienen huecos | PLAN §7 |
| 2026-10-14 | `/api/dev` en Vercel solo responde con `DEV_TOKEN` (en `?token=` o en la cabecera `x-dev-token`); sin la variable, 404. Producción, siempre 404; en local, abierta. Legales reescritos con el producto actual: qué es gratis (D3), proceso, uso de IA (Anthropic y Gemini, también antes de pagar), qué se guarda y el borrado a 30 días aunque se compre | La preview es pública y se va a enseñar: cualquiera con la URL podía gastar con `/api/dev`, y los legales describían el flujo antiguo | `lib/devAccess.ts`, `app/api/dev`, `app/{privacidad,condiciones,aviso-legal}`, `.env.example` (PR #3) |
| 2026-10-14 | Copy de la landing orientado a quien compra (padres, abuelos, tíos). Título «Una frase tuya. Un libro suyo.». Fuera la jerga interna: «hoja de personajes» pasa a «cómo será en el libro» o «sus personajes» (también en `/crear`), y fuera «igual en las doce páginas», «la misma niña», «plantillas» y «una versión más». Cuatro preguntas nuevas: parecido, personaje favorito, edades, Navidad y Reyes | Álvaro: varios apartados no se entendían. El texto hablaba de nuestros problemas técnicos (consistencia, plantillas) y creaba dudas que el padre no tenía | `app/page.tsx`, `SampleFlipper.tsx`, `components/crear/Step{Hero,Cast,Book}.tsx`, `app/crear/page.tsx`; rama `copy/landing-target` |
| 2026-10-14 | PR #4 (copy) unido a la rama del estilo; PR #3 (demo abierta) y PR #2 (estilo + copy) unidos a la rama de trabajo, con merge commits. La preview de la rama de trabajo lleva todo | Álvaro: «que el preview quede completo». La unión se probó antes en local (82 unitarios, build, 8 Playwright, capturas) y el resultado en GitHub es el mismo árbol | — |

## 3. Hallazgos cerrados (13 oct, noche)

- **«Los textos están repetidos en el libro» (Álvaro):** era el PDF que Claude le mandó, una prueba de maqueta local con dos textos de relleno alternados, presentada por error como el PDF de Vercel. El PDF real de la preview (`/api/libro/pdf?b=g2ajgsd2ut&kind=full`) tiene los 12 textos distintos, cada uno con su ilustración. Comprobado extrayendo el texto y mirando las páginas.
- **Dos pagos de prueba chocaban** porque todos los pedidos usaban el mismo `stripe_session_id` («dry-run»), que es único. Ahora cada uno lleva `dry-run:<libro>`, y si llega dos veces la misma sesión ya no da error.
- **CI en rojo:** el test de la página 5 fallaba cuando la respuesta tardaba, porque el modo estricto de Playwright falla sin esperar. Reproducido en local retrasando la respuesta 1,5 s y arreglado.
- **El borrado a 30 días no existía:** hecho y probado en la base real con dos libros de prueba caducados. El no pagado desaparece con sus 2 imágenes; el pagado queda vacío con el pedido; no quedan archivos huérfanos en el bucket.
- **Paso 3 en móvil:** el título largo se cortaba. Ahora crece, y la dedicatoria también.
- **Imágenes en el formulario (Álvaro):** el paso 2 era difícil de rellenar sin ver qué se elegía. Hecho: 35 miniaturas (275 KB en total). Al elegir piel y color de pelo, los peinados se repintan. Comprobado con capturas en móvil y escritorio y con un test nuevo en Playwright. En las gafas no se repinta el pelo, porque el repintado teñía también las monturas marrones.
- **Aviso «Pintando las páginas»:** se quedaba unos segundos con el libro ya completo. Arreglado.
- **Recorrido completo en la preview por la interfaz** (textos reales, imágenes sin coste): de la idea al PDF en 47 s con el cuento en caché, sin errores. Un cuento nuevo tarda 26 s.
- **Nano Banana en la preview, por la interfaz:** del paso 1 al 4 con imágenes reales. La hoja tardó 45 s y la portada 81 s desde el email; las dos están bien y no hubo errores. Gasto ≈ 0,11 $ (el cuento estaba en caché). `GENERATION_PROVIDER` admite ahora también «gemini» y «nano-banana»: con un valor distinto de `gemini-images`, las rutas de imágenes daban 503. El libro pagado con imágenes reales y el segundo plano todavía no se han probado: lo hará Álvaro.
- **Estilo nuevo en código** (rama `feat/estilo-hora-del-cuento`): landing y los cinco pasos de `/crear`. Comprobado con tsc, eslint, 77 unitarios, build, 8 tests de Playwright (uno nuevo: `/crear?idea=` y «Empezar otro» sin ventanas del navegador) y capturas en móvil y escritorio de todos los pasos, también sustituyendo las imágenes de prueba por las del libro de muestra. Sin coste de generación.
- **Arreglados con el estilo:** «En cola…» mientras solo se cargaba la vista; miniaturas en blanco hasta cargar; `confirm()` del navegador en «Empezar otro» y «Escribirlo de otra manera»; el aviso «Libro recuperado.» que no se iba.
- **Las clases propias de CSS ganaban siempre a Tailwind:** estaban fuera de capa, y en Tailwind 4 eso pesa más que cualquier utilidad (por ejemplo, `sm:p-6` sobre `.card` o `outline-none` sobre el foco global no hacían nada). Ahora van en `@layer base` y `@layer components`.
- **Hojeador de la landing en Safari:** la ilustración tenía `height: 100%` dentro de una rejilla; Safari lo resuelve contra toda la tarjeta, la imagen se alargaba y el texto quedaba encima (lo vio Álvaro; en Chromium no se reproduce). Ahora la imagen va absoluta dentro de un marco 3:2, igual que las de las portadas y `BookImage`. Comprobado en Chromium (cajas medidas, sin solape); en Safari falta que lo mire Álvaro.
- **Producción (`cuentos-pi.vercel.app`) da 404:** su último despliegue es del 8 oct (`main`, `a5a6a74`). No hay nada público.
- **`npx next build` no genera `public/pieces/`** (lo hace el `prebuild` de `npm run build`). Sin esas piezas, el test de `/gratis` falla en local con 404. Usar siempre `npm run build`.
- **Gasto de pruebas de esta noche:** ≈ 0,30 $ (3 planes con Sonnet, una hoja con Gemini que se repitió por el control de calidad, varias llamadas a Haiku).

### 14 oct (copy de la landing)

- **La landing prometía algo falso sobre los datos:** «Mientras escribes, todo se queda en tu navegador». En el paso 3, `/api/plan` manda la ficha a Anthropic y la guarda en `cuentos_stories` (visto en el código). Corregida la pregunta; la política de privacidad ya lo cuenta bien en el PR #3. Un test impide volver a prometerlo.
- **«Nada de miedo»** contradecía al planificador, que admite emociones pequeñas como el miedo a la oscuridad. Ahora: «nada que asuste de verdad».
- **Tiempos optimistas:** «alrededor de un minuto» para hoja y portada; medido en la preview, 45 s y 81 s. Ahora «uno o dos minutos» (landing y paso 4).
- **El test de «peques» daba falsos positivos:** usaba `\b`, y en JavaScript la «ñ» cuenta como límite de palabra, así que «pequeños» caía. Ahora con `\p{L}`.
- Comprobado: tsc, eslint, 77 unitarios, build, 8 Playwright y capturas de la landing en móvil (390 px) y escritorio (1440 px). Los textos cambiados en `/crear` los recorre Playwright; sin capturas de esos pasos.

## 4. Preguntas abiertas (priorizadas)

1. ~~**Imágenes reales en la preview**~~: hecho el 13 oct. Álvaro cambió `GENERATION_PROVIDER` y la preview pinta con Nano Banana 2.1. Falta confirmar que la variable está solo en **Preview**: si también está en Production, la versión antigua de `main` gastaría en cuanto se vuelva a desplegar.
2. **Stripe y Resend:** claves y dominio de envío (pasos en `PAGO.md`). Álvaro.
3. **Legales (E6):** datos del responsable para privacidad, condiciones y aviso legal (21 campos `Pending`). Falta también fijar el plazo de los emails de leads sin consentimiento de marketing (E18). Álvaro.
4. **Fiscal:** IVA aplicable y facturas, antes de cobrar. Álvaro con su gestoría.
5. **Formato del PDF (D5):** con A4 vertical e imagen 3:2 queda blanco bajo el texto. ¿Se mantiene, o se prueba una imagen más alta (4:3) o un formato cuadrado? Decisión de Álvaro.
6. **Antes de unir el PR #1:** ¿se borran las rutas del flujo antiguo y `/api/dev`?
7. **`claude/ASSETS.md` está superado por D1.** ¿Se retira del Project? Sigue en el repo.
8. **Vigilar el paso 3:** una vez, en la preview, el cuento nuevo no apareció en 150 s; no se ha podido reproducir (después tardó 26 s y 4 s). Si vuelve a pasar, mirar los logs de `/api/plan` en Vercel.
9. **Marca comercial y dominio** (el PRD la deja pendiente).
10. **¿Miniaturas también para personas y accesorios?** El catálogo tiene 8 abuelos y 8 accesorios. Las miniaturas tienen el estilo del catálogo, parecido pero no idéntico al del libro.
11. ~~**Estilo nuevo, «La hora del cuento»**~~: aprobado el 13 oct con Lora en vez de Fraunces e implementado (§2, `ESTILO.md`).
12. ~~**¿Se une el PR #2 (estilo) a la rama de trabajo?**~~ Unido el 14 oct, con el copy (PR #4) y la demo abierta (PR #3).
13. ~~**Copy de la landing**~~ Unido el 14 oct (PR #4).
14. **Pendientes de los legales (PR #3):** datos del titular, DPA de cada proveedor, plazo de los emails de leads (E18), IVA y la casilla de desistimiento que falta en el paso del pago. Álvaro, salvo la casilla, que es código.
15. **`DEV_TOKEN` en Preview** si se quiere seguir usando `/api/dev` en la preview (sin él, 404). Álvaro.

## 5. Próxima sesión — empezar por

1. Leer `INDICE.md` y este documento. No hace falta el historial del chat.
2. Preguntar a Álvaro qué le parece el paso 2 con imágenes en la preview y apuntarlo aquí.
3. `curl https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app/api/health` y mirar:
   - `images.provider` debe ser `gemini-images`. Comprobar que el libro pagado de prueba de Álvaro (12 páginas con imágenes reales y segundo plano) terminó bien; si no, mirar los logs de Vercel. Anotar aquí lo que se vea de la UX.
4. Si `payment.mode` es `stripe`: un pago con la tarjeta 4242 4242 4242 4242, comprobar el webhook (200 en Stripe), el libro pintado sin la pestaña abierta y los dos emails si `mail.enabled` es `true`.
5. Con Álvaro: leer los 10 cuentos de prueba (criterio de B1, `PLANIFICADOR.md`) y decidir las preguntas 5 y 6.
6. Con los datos legales: rellenar E6.
7. Preguntar a Álvaro qué le parece la preview completa (estilo y copy nuevos) en su móvil, y si en Safari el hojeador ya no monta el texto sobre la ilustración. Apuntarlo aquí.
8. Antes de unir el PR #1:
   - `CRON_SECRET` y `SITE_URL` en producción.
   - Quitar `/api/dev` si se decide.
   - Actualizar la descripción del PR.
   - CI en verde y revisión.
