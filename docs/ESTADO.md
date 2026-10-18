# ESTADO — cuentos

Actualizado: 2026-10-18, noche (variables y webhook de Gelato; preview comprobada con Stripe, Resend y Gelato) · Fase: B1–B5 hechos (a B5 le faltan las claves de Stripe) · B6 en parte · B7 en curso · B8 código hecho (Gelato en marcha)

La memoria entre sesiones. Se actualiza en el momento, no al final. El log de decisiones (§2) es append-only: nunca se borra, solo se añade. Mapa de documentos y accesos: `INDICE.md`. Plan, bloques y abiertos (E#): `PLAN.md`.

## 1. Foco actual

- **Ahora (18 oct, noche):** MVP con family and friends en producción. La preview ya tiene Stripe (test), Resend y Gelato (borradores), con todas las comprobaciones en verde (§3). Falta: la compra de prueba completa en la preview, Stripe real en Production (§4.29), `SITE_URL`, `LEGAL_NAME`, `LEGAL_NIF` y `LEGAL_ADDRESS` en Production y la prueba con tres personas. El correo de `hola@` ya funciona. Después, unir el PR #1 a `main`.
- **Producto (18 oct, D7):** se sale con el libro de tapa dura (34,90 €, envío a la Península y Baleares, PDF incluido). La conexión con Gelato está en el PR de B8; falta que Álvaro cree la cuenta, ponga la clave en Preview y pida la muestra (`IMPRESION.md` §7).
- **Después:** unir el PR #1 a `main` (salida a producción).
- **Fuera de foco ahora:** más estilos de ilustración, el Reel (B6). El flujo antiguo redirige a `/crear` desde el 16 oct.

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
| 2026-10-16 | E18 (Álvaro): el email dado solo para recibir el libro, sin aceptar novedades, se borra a los 30 días con el libro. La purga borra esos leads si no tienen libro vigente y quita el email de las filas de gasto de más de 30 días (el tope por lead vuelve a empezar para ese email) | Sin consentimiento no se les puede escribir: guardarlos no sirve | `lib/purge.ts`, `/privacidad` (PR #5) |
| 2026-10-16 | Flujo antiguo (Álvaro): `/clasico`, `/ilustrado`, `/libro` y `/gratis` redirigen a `/crear` con 307. El código se queda | `/gratis` captaba emails con el producto viejo; redirigir es reversible | `next.config.ts` (PR #5). Cierra §4.6 salvo `/api/dev` |
| 2026-10-16 | Renuncia al desistimiento: casilla obligatoria en el paso 5, comprobada también en el servidor (400 sin ella), con hora y versión en los metadatos de Stripe | Las condiciones decían que se aceptaba antes de pagar y no existía; los metadatos de Stripe duran más que el libro | `lib/stripe.ts`, `StepBook.tsx`, rutas `checkout` y `pay` |
| 2026-10-16 | El tope diario no frena a un libro con pedido de Stripe real (lo limita el tope por libro); el pago de prueba sí se frena | Con 500 c al día, un cliente que paga se quedaba sin libro a partir del cuarto o quinto del día | `lib/generation/budget.ts` |
| 2026-10-16 | Los datos del titular salen de `LEGAL_NAME`, `LEGAL_NIF`, `LEGAL_ADDRESS` y `LEGAL_EMAIL` en Vercel, no del código. Las páginas legales son estáticas: tras cambiarlos, volver a desplegar | El repo es público: en el código quedarían para siempre en el historial | `lib/legal.ts`, `.env.example` |
| 2026-10-16 | Proveedores de la política con lo verificado en sus páginas oficiales (entidad, contrato de encargo, cláusulas tipo, Marco de Privacidad). Stripe (fraude, blanqueo) y Microsoft Clarity son responsables independientes, no encargados. Clarity recibe la señal `consentv2` (medición sí, publicidad no) y no graba `/crear` | La política decía «encargados» para todos y no lo son | `/privacidad`, `CookieConsent.tsx`, `app/crear/page.tsx` |
| 2026-10-16 | robots y sitemap: solo se indexa producción con `SITE_URL`; `/crear?…` (los libros de cada familia) nunca. La descripción del sitio deja de prometer tapa dura | Abrir al público con el dominio de la marca, sin indexar el alias de Vercel ni los libros | `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts`, `layout.tsx` |
| 2026-10-16 | Marca «Érase su vez» (Álvaro). Dominio principal `erasesuvez.es` y `erasesuvez.com` redirigido a él (propuesta; libres el 16 oct). En la web: nombre en cabecera, pie, títulos y emails; favicon (luna y estrella en noche), icono de iOS e imagen para compartir de 1200×630 con el libro de muestra (JPEG de 78 KB, para que WhatsApp la enseñe) | Distintiva, explica el producto y la búsqueda no dio marcas iguales; «Su cuento» chocaba con MiCuento | `SiteHeader.tsx`, `layout.tsx`, `app/{icon.svg,apple-icon.png,opengraph-image.jpg}`, `lib/mail.ts` (PR #5) |
| 2026-10-18 | D7 (Álvaro): el libro impreso de tapa dura pasa a ser el producto principal, con el PDF incluido. El PDF solo se queda como opción más barata. Lo demás (precio, imprenta, qué es gratis, segundo ejemplar, tarjeta regalo, orden respecto a la salida) es propuesta de Claude, pendiente en §4.21 a §4.26 | Esta categoría se vende como objeto de regalo entre 25 y 36 €; un PDF no se envuelve, y quien compra suele ser quien regala. Con el PDF solo, el margen por venta (≈ 13 €) deja poco para captar clientes | PLAN (D7, §3.2, B8, §7), `IMPRESION.md`, INDICE |
| 2026-10-18 | Se sale con el libro de tapa dura (Álvaro). Cierra §4.26 | Es el producto principal de D7; mejor con él desde el primer día que añadirlo después | PLAN (B8), `IMPRESION.md` §7 |
| 2026-10-18 | Precio: 34,90 € con envío y el PDF incluido; el PDF solo, 14,90 € (Álvaro). Cierra §4.21 | La propuesta de D7; probar 39,90 € más adelante | `lib/print/prices.ts`, `lib/pricing.ts`, landing, condiciones |
| 2026-10-18 | El libro va a la imprenta solo cuando el padre pulsa «Mandar a imprimir» y lo confirma; nunca solo (Álvaro). Recordatorio por email a los 2 y a los 7 días | Lo pagado se puede seguir retocando; una vez impreso no hay vuelta atrás | `lib/book/print.ts`, `PrintPanel.tsx`, `/api/cron/print` |
| 2026-10-18 | Envíos solo a la Península y Baleares (Álvaro). Canarias, Ceuta y Melilla se rechazan por el código postal | Fuera del territorio del IVA: aduana, DUA y otro impuesto | `lib/print/shipping.ts`, condiciones §6 |
| 2026-10-18 | Imprenta para salir: Gelato, por API (cierra la parte de Gelato de §4.23; el presupuesto de las españolas sigue) | Única con API, tapa dura 20×20 y producción en la UE | `lib/print/gelato.ts`, `PROVEEDORES.md` |
| 2026-10-18 | Migración `0005_cuentos_5_impreso` aplicada en Supabase con el visto bueno de Álvaro: dirección, estado de imprenta, id de Gelato, seguimiento y marcas de email en `cuentos_orders` | Lo necesita el pedido impreso | `supabase/migrations/0005_cuentos_5_impreso.sql` |
| 2026-10-18 | Maqueta de imprenta: 30 páginas interiores con las escenas a doble página y cubierta en noche con lomo; un solo PDF de 33 páginas. Sin las medidas reales de la cubierta (API de Gelato) no se manda | Gelato pide un archivo así para los fotolibros; una cubierta mal medida se imprime mal | `lib/pdf/printHtml.ts`, `lib/pdf/print.ts` |
| 2026-10-18 | Fuera de producción, los pedidos de Gelato se crean como borrador (no se imprimen) salvo `GELATO_ORDER_TYPE=order` | Que una prueba en la preview no imprima ni cobre por error | `lib/print/gelato.ts` |
| 2026-10-18 | Dominio: Álvaro compra `erasesuvez.com` en Vercel. Principal `https://www.erasesuvez.com`; `erasesuvez.com` redirige con 308 (lo configuró Vercel al añadirlo). DNS en Vercel, sin errores de configuración. El `.es` sigue libre y queda opcional. Sustituye «principal `erasesuvez.es`» del 16 oct | Comprado el `.com`; la redirección a www es la que propone Vercel | PLAN §7.1 |
| 2026-10-18 | PR #7 (B8) unido a su base, #6 (D7) a la suya y #5 a la rama de trabajo, con merge commits. Aprobado por Álvaro | Comprobado antes sobre la pila completa: tsc, eslint, 100 unitarios, build y 9 Playwright; CI en verde. La rama de trabajo queda idéntica a lo probado | — |
| 2026-10-18 | Gemini y menores (Álvaro): la web es para los padres, no está dirigida a menores. Se dice en el aviso legal | Los términos de Gemini prohíben servicios dirigidos a menores; el producto lo usan adultos para un niño | `/aviso-legal` §2 |
| 2026-10-18 | Vercel (Álvaro): se sigue en Hobby mientras sea MVP con family and friends. Pasar a Pro antes de abrir al público | Hobby no permite uso comercial; el MVP es cerrado | ESTADO §4.17 |
| 2026-10-18 | Supabase está en eu-west-1 (Irlanda): no hace falta moverla. Las funciones de Vercel pasan de iad1 (Washington) a dub1 (Dublín), junto a la base | Región sacada de la IPv6 de `db.<ref>.supabase.co` contra la lista oficial de IP de AWS. Menos latencia por consulta y los datos se procesan en la UE | `web/vercel.json`, `/privacidad` §7 |
| 2026-10-18 | IVA (Álvaro): libros al 4 %, el PDF y la tapa dura | Decisión de Álvaro | `/condiciones` §6 |
| 2026-10-18 | Resend creado y conectado a `erasesuvez.com` (DKIM y registros de envío en el DNS de Vercel, región eu-west-1). Falta recibir correo en `hola@` (sin registro MX) | Lo hizo Álvaro; comprobado en el DNS | PLAN §7.1 |
| 2026-10-18 | Stripe en producción con **cobro real** durante el MVP (Álvaro). Claves `sk_live_` y secreto del endpoint real solo en Production; Preview sigue en modo de prueba | En producción Gelato imprime de verdad: con claves de prueba, la tarjeta 4242 daría libros impresos gratis | `PAGO.md` |
| 2026-10-18 | Salvaguarda en el código: en producción el webhook de Stripe ignora los eventos con `livemode: false` y «Mandar a imprimir» rechaza los pedidos sin sesión `cs_live_` (error `test_order`) | La base es la misma que la de la preview: un libro pagado allí de prueba se puede abrir en el dominio de producción | `lib/stripe.ts`, `lib/book/print.ts` |
| 2026-10-18 | Correo de `hola@erasesuvez.com`: reenvío gratuito a Gmail (Álvaro). Él crea la cuenta del servicio; Claude pone los MX en el DNS de Vercel | Lo más simple para el MVP; no hace falta un buzón | §4.30 |
| 2026-10-18 | Borrar la variable antigua `service_role` de Vercel (Álvaro) | Sobraba desde E11 | — |
| 2026-10-18 | Correo de `hola@erasesuvez.com` con **Resend** en vez de un servicio de reenvío (Álvaro). Sustituye la línea anterior sobre el reenvío. Resend recibe, avisa a `/api/mail/inbound` y la web lo reenvía a `MAIL_FORWARD_TO` con «Responder a» el remitente; no se reenvía lo que no pasa DMARC | Un proveedor menos con datos de clientes: Resend ya está en la política de privacidad | `lib/inbound.ts`, `PAGO.md` |

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

### 16 oct (salir al público)

- **Gemini y menores:** los términos de la API de Gemini (vigentes desde el 23 mar 2026) prohíben usarla en un servicio «dirigido a menores de 18 años o al que probablemente accedan». Comprobado en ai.google.dev/gemini-api/terms. La web la usan los padres, pero el producto es infantil. Es una cuestión de interpretación: decide Álvaro, mejor con consejo legal (§4).
- **Vercel Hobby no permite uso comercial** (Términos de Vercel, §4). Claude no puede ver el plan del equipo.
- **Las funciones corren en iad1 (EE. UU.).** Vercel permite fijar una región de la UE en cualquier plan (Settings → Functions o `"regions"` en `vercel.json`). Conviene la más cercana a Supabase, cuya región no se ve con el acceso de Claude.
- **Clarity no es encargado:** sus términos dicen que Microsoft es responsable independiente y que puede usar los datos para sus fines. Desde el 31 oct 2025 exige la señal de consentimiento en el EEE. Hecho en el PR #5.
- **Gemini de pago:** solo es «de pago» con un proyecto de Google Cloud con facturación activa. En el EEE solo se puede ofrecer el de pago; en el gratuito Google usa los datos para entrenar.
- **«Su cuento» como marca choca con MiCuento** (micuento.com, Barcelona, libros personalizados). Descartado. Propuestas en §4.9.
- Comprobado en local: tsc, eslint, 87 unitarios, build, 8 Playwright y capturas del paso 5 y de `/privacidad`. Proveedores, con fuentes: `PROVEEDORES.md`.

### 18 oct (impresión y producto)

- **Precios de la competencia:** MiCuento, unos 25 € en tapa dura 21×21; Librio, 24,48 £ en tapa blanda y 32,48 £ en tapa dura; Wonderbly lanzó a 29 $ y 36 $; Hooray Heroes, unos 24 € de media por libro (12 M€ con casi medio millón de libros en 2018). Detalle y fuentes en `IMPRESION.md`.
- **Imprentas con API para un ejemplar:** Gelato (20×20, produce en la UE), Prodigi / Peecho (sin 20×20), Lulu (API gratis, sin confirmar dónde imprime para España) y Mixam (API con aprobación previa). Las españolas (Podiprint, Veprix, Realisaprint) no publican API: hay que pedir presupuesto.
- **Mínimo de páginas:** las tapas duras piden 24 a 30 páginas y nuestro PDF tiene 15. La doble página (ilustración a un lado, texto al otro) da 24 y resuelve el blanco del E15.
- **No hace falta 4K para imprimir** (cálculo de Claude): 2528 px en 20 cm son unos 320 ppp. Solo haría falta si la ilustración ocupa la doble página.
- **El IVA es la incógnita grande:** el 4 % depende de que un ejemplar único personalizado cuente como «libro» y no como fotolibro. Con el 21 %, el margen cae unos 5 € por libro.
- **Archivo para Gelato (B8):** los fotolibros van en un solo PDF: pliego de cubierta, guarda, páginas interiores y guarda; 4 mm de sangre. La cubierta depende del número de páginas y se pide a su API. `pageCount` = 34 (30 interiores + 4) es hipótesis: lo confirmará la muestra.
- **Los webhooks de Gelato no van firmados:** el nuestro lleva un token en la URL y, además, vuelve a consultar el pedido en la API antes de creerse nada.
- **Comprobado en local:** PDF de imprenta del libro de muestra, 33 páginas con los tamaños exactos; recorrido completo con la imprenta simulada en Playwright (pago de prueba, dirección, mandar a imprimir, libro bloqueado).
- **Autoguardado tras imprimir:** el guardado diferido del plan llegaba después de mandar a imprimir y daba 409. Ahora, si el libro está bloqueado y el texto no cambia, se responde bien sin tocar nada.

### 18 oct, noche (configuración para salir)

- **Hecho en Vercel y Gelato (Claude con Chrome, con el visto bueno de Álvaro):** webhook de Gelato a la preview (`/api/print/webhook?token=…`, eventos `order_status_updated` y `order_item_tracking_code_updated`); el mismo token en `GELATO_WEBHOOK_SECRET` (Production y Preview), pegado sin verlo; `CRON_SECRET` en Production, generado en la propia página sin verlo. `SITE_URL` quedó rellena en el diálogo sin guardar: el permiso automático bloqueó el Save de una variable de producción.
- **Preview desplegada desde git** (`c0e0b09`) y `/api/health?deep=1` en verde: Supabase, Anthropic y Gemini «ok»; `payment.mode` = `stripe`; `mail.enabled` = `true`; `print.mode` = `gelato`, `orderType` = `draft`, `webhookSecret` = `true`. En la preview `SITE_URL` no hace falta: los enlaces usan el origen de la petición.
- **Dominio:** `www.erasesuvez.com` y `erasesuvez.com` (308 a www) unidos al proyecto y verificados; DNS en Vercel. Registros de Resend presentes (DKIM `resend._domainkey`, `send` y `rsend`). **No hay registro MX:** `hola@erasesuvez.com` no recibe correo todavía.
- **Riesgo antes de producción:** en producción Gelato crea siempre pedidos reales (`gelatoOrderType`), y el webhook de Stripe no mira `livemode`. Si producción tuviera claves de Stripe de prueba, cualquiera con la tarjeta 4242 recibiría un libro impreso real pagado por la cuenta de Gelato. Además, `STRIPE_WEBHOOK_SECRET` tiene un solo valor para Production y Preview, y los secretos de los endpoints de prueba y real son distintos. Resuelto con cobro real y una salvaguarda en el código (§2, §4.29).

- **Correo entrante funcionando (18 oct, noche; PR #10 unido):** recepción activada en Resend para `erasesuvez.com` (región eu-west-1); MX `10 inbound-smtp.eu-west-1.amazonaws.com` puesto por Claude en el DNS de Vercel; webhook de Resend `email.received` a la preview estable (`/api/mail/inbound`); `RESEND_WEBHOOK_SECRET` (pegado sin verlo) en Production y Preview; `MAIL_FORWARD_TO` y `LEGAL_EMAIL=hola@erasesuvez.com` en Production y Preview. La clave de Resend ya tenía acceso completo (`receivingCheck: ok`). Prueba real: Álvaro escribió a `hola@` desde otra cuenta y le llegó a Gmail; en los logs, `[correo] email.received → forwarded`. **Al salir a producción:** cambiar la URL del webhook de Resend a `https://www.erasesuvez.com/api/mail/inbound` (mismo secreto).
- **Variables de Production que sí guarda Claude:** `MAIL_FORWARD_TO`, `RESEND_WEBHOOK_SECRET` y `LEGAL_EMAIL` se guardaron sin bloqueo. `SITE_URL` sigue sin guardar: lo guarda Álvaro.
## 4. Preguntas abiertas (priorizadas)

1. ~~**Imágenes reales en la preview**~~: hecho el 13 oct. Álvaro cambió `GENERATION_PROVIDER` y la preview pinta con Nano Banana 2.1. Falta confirmar que la variable está solo en **Preview**: si también está en Production, la versión antigua de `main` gastaría en cuanto se vuelva a desplegar.
2. **Stripe:** claves (pasos en `PAGO.md`). Resend ya está (18 oct). Álvaro.
3. **Legales (E6):** los cuatro datos del titular van en las variables `LEGAL_*` de Vercel (PR #5). Quedan como hueco: región de Supabase, IVA y epígrafe IAE. E18 decidido el 16 oct. Álvaro.
4. **Fiscal:** IVA al 4 % decidido (18 oct). Quedan el epígrafe IAE y cómo emitir las facturas. Álvaro con su gestoría.
5. **Formato del PDF (D5):** con A4 vertical e imagen 3:2 queda blanco bajo el texto. ¿Se mantiene, o se prueba una imagen más alta (4:3) o un formato cuadrado? Decisión de Álvaro.
6. ~~**Antes de unir el PR #1:** ¿se borran las rutas del flujo antiguo y `/api/dev`?~~ El flujo antiguo redirige a `/crear` (16 oct). `/api/dev` sigue: en producción da 404 siempre.
7. **`claude/ASSETS.md` está superado por D1.** ¿Se retira del Project? Sigue en el repo.
8. **Vigilar el paso 3:** una vez, en la preview, el cuento nuevo no apareció en 150 s; no se ha podido reproducir (después tardó 26 s y 4 s). Si vuelve a pasar, mirar los logs de `/api/plan` en Vercel.
9. ~~**Marca comercial y dominio**~~ «Érase su vez» (16 oct); `erasesuvez.com` comprado el 18 oct, con `www` como principal. Falta, si no está hecho: el usuario de Instagram y TikTok y la búsqueda en OEPM y EUIPO. El `.es` sigue libre (opcional).
10. **¿Miniaturas también para personas y accesorios?** El catálogo tiene 8 abuelos y 8 accesorios. Las miniaturas tienen el estilo del catálogo, parecido pero no idéntico al del libro.
11. ~~**Estilo nuevo, «La hora del cuento»**~~: aprobado el 13 oct con Lora en vez de Fraunces e implementado (§2, `ESTILO.md`).
12. ~~**¿Se une el PR #2 (estilo) a la rama de trabajo?**~~ Unido el 14 oct, con el copy (PR #4) y la demo abierta (PR #3).
13. ~~**Copy de la landing**~~ Unido el 14 oct (PR #4).
14. ~~**Pendientes de los legales (PR #3)**~~ Hechos en el PR #5, salvo región de Supabase, IVA y epígrafe IAE (punto 3).
15. **`DEV_TOKEN` en Preview** si se quiere seguir usando `/api/dev` en la preview (sin él, 404). Álvaro.

16. ~~**Gemini y menores de 18**~~ Decidido el 18 oct: la web es para padres (§2).
17. ~~**Plan de Vercel**~~ Hobby durante el MVP con family and friends; Pro antes de abrir al público. Funciones en Dublín (18 oct).
18. ~~**Región de Supabase**~~ eu-west-1 (Irlanda), en la UE (18 oct).
19. **Clave de Gemini de pago:** Álvaro dice que tiene créditos. Para ser de pago, el proyecto necesita una cuenta de facturación de Cloud vinculada y prepago (mínimo 5 $) o pospago; los créditos de prueba y de bienvenida no cuentan. Comprobarlo en AI Studio → API keys (columna «Plan»: «Paid») y vigilar el saldo: con prepago, sin saldo la API deja de responder. Álvaro.
20. **Clarity:** si se activa, poner la ocultación en Strict en su panel. El código ya oculta `/crear`. Álvaro.
21. ~~**Precio del libro impreso (D7)**~~ 34,90 € con envío y el PDF incluido; el PDF solo, 14,90 € (18 oct). Probar 39,90 € más adelante.
22. **Qué es gratis (D3):** con D7, el PDF casero gratis compite con lo que se vende. Propuesta: mantener gratis el cuento, los personajes y la portada en la web, y pasar el PDF casero a pago o marcarlo con la marca. Álvaro.
23. **Imprenta:** Gelato conectado (18 oct). Cuenta, clave en Preview y webhook hechos (18 oct, noche). Falta: método de pago en Gelato y la muestra (`IMPRESION.md` §7), la entidad del contrato y su DPA (`PROVEEDORES.md`, `/privacidad` §7), y presupuesto a Podiprint y Realisaprint para comparar. Álvaro.
24. ~~**IVA del libro impreso**~~ 4 % (Álvaro, 18 oct).
25. **Segundo ejemplar y tarjeta regalo:** propuestas para subir el ticket medio (un segundo ejemplar a 24,90 € a la misma dirección) y para quien regala sin conocer al niño. Álvaro.
26. ~~**Orden de salida**~~ Se sale con la tapa dura (18 oct). Queda fijar la fecha límite de Navidad con los plazos reales de la muestra.
27. **Producto exacto de Gelato:** el código busca en el catálogo una tapa dura cuadrada de 20×20; si encuentra otra cosa o nada, poner `GELATO_PRODUCT_UID`. Se ve en la muestra. Claude con Álvaro.
28. **Sin probar contra Gelato:** la API real, el webhook y que acepte el PDF. La clave y el webhook ya están en la preview (18 oct, noche): falta la compra de prueba (§5). Álvaro y Claude.
29. ~~**Stripe en producción**~~ Cobro real (Álvaro, 18 oct) y salvaguarda en el código (§2). Falta que Álvaro active la cuenta, ponga `sk_live_` y el secreto del endpoint real en Production y separe `STRIPE_WEBHOOK_SECRET` de Preview (`PAGO.md`). Álvaro.
30. ~~**Buzón de `hola@erasesuvez.com`**~~ Funciona con Resend desde el 18 oct (noche; §3). Al salir a producción, cambiar la URL del webhook de Resend a `www`. Para revisar con los legales: el buzón de destino es un Gmail personal.
31. ~~**Variable antigua `service_role`**~~ Borrada de Vercel el 18 oct (noche), con el visto bueno de Álvaro. Entra en el siguiente despliegue.

## 5. Próxima sesión — empezar por

1. Leer `INDICE.md` y este documento. No hace falta el historial del chat.
2. Preguntar a Álvaro por §4.19 (Gemini de pago) y §4.22 (qué es gratis).
3. Correo entrante: hecho y probado (§3). Al unir el PR #1 a `main`, cambiar la URL del webhook de Resend a `https://www.erasesuvez.com/api/mail/inbound`.
4. **Compra de prueba completa en la preview** (todo configurado el 18 oct, noche): Álvaro crea un libro de tapa dura, paga con la tarjeta 4242 4242 4242 4242 y pulsa «Mandar a imprimir». Claude comprueba el webhook de Stripe (200), el pedido en `cuentos_orders`, las 12 páginas pintadas con la pestaña cerrada, los dos emails, el borrador en Gelato (producto, medidas de la cubierta, que acepte el PDF) y los avisos del webhook de Gelato. Coste: unos 1 $ de generación. Después, la muestra con `GELATO_ORDER_TYPE=order` (`IMPRESION.md` §7). Preguntas que siguen: §4.25 y §4.27.
5. Stripe real en Production (§4.29, `PAGO.md`): lo pone Álvaro. La salvaguarda del código va en el PR de `feat/stripe-livemode`.
6. Antes de unir el PR #1 a `main`: variables de producción (§7 del PLAN; ya están `CRON_SECRET`, `GELATO_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `MAIL_FORWARD_TO` y `LEGAL_EMAIL`; faltan `SITE_URL`, los otros `LEGAL_*` y Stripe real), cambiar el webhook de Gelato a `https://www.erasesuvez.com/api/print/webhook?token=…` (mismo token), CI en verde, descripción del PR al día y la prueba con tres personas (B7). Después, comprobar en producción `https://www.erasesuvez.com/robots.txt` (debe permitir y apuntar al sitemap) y la vista previa del enlace en WhatsApp.

Hecho del antiguo §5: la purga en simulación contra la base real (16 oct, sin errores: `leads` 0 y `spend` 0, la base tiene menos de 30 días).
