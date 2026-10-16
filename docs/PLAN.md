# Plan de trabajo — cuentos

Fuente de verdad del plan: bloques, abiertos (E#) y lista de Álvaro. Para arrancar un hilo nuevo: `docs/INDICE.md` (mapa) y `docs/ESTADO.md` (foco, decisiones, próxima sesión). Lo que no está aquí no está en marcha. PRD: `PRD.md` (v0.2, se reescribe tras las decisiones de §2). Rama de trabajo: `feat/fase-1-journey-clasico` → PR #1 → `main`.

## 1. Estado real (13 oct 2026, noche)

**El flujo nuevo funciona de punta a punta en la preview** (rama `feat/fase-1-journey-clasico`):

- **B1 hecho** (`docs/PLANIFICADOR.md`): ficha + planificador con Claude Sonnet 5.5, moderación, validador y una corrección. 10 fichas de prueba → 10 libros válidos, ≈ 33 s y ≈ 6 c cada uno.
- **B2 hecho**: `/crear` nuevo en cinco pasos (idea → quién → cuento en 12 tarjetas → personajes con email → libro). Se edita cualquier texto y cada página se rehace con una frase. Playwright: de una frase al cuento escrito, personajes y libro sin coste con PDF, recuperar por enlace.
- **B3 hecho** (`docs/ILUSTRACION.md`): hoja de personajes + portada tras el email, cambios con palabras, control de calidad. Tres niños reales en la preview (Lucía, Mateo, Inés) con hoja y portada; 10 c por lead, 20 c con un cambio.
- **B4 hecho**: libro pagado con 12 ilustraciones a 2K (Mateo, idéntico en las 12), revisión por página, PDF A4 vertical de 15 páginas generado en Vercel (6,75 MB, 8 s). ≈ 1 $ por libro.
- **B5, código hecho; faltan las claves** (`docs/PAGO.md`): Stripe Checkout + webhook (pedido idempotente), emails con Resend (enlace al dar el email; «tu libro está listo» al terminar las 12), y el servidor pinta en segundo plano con `after()` aunque se cierre la pestaña. Probado en local con un webhook firmado y en la preview (Supabase, imágenes sin coste): hoja, portada y 12 páginas terminadas sin que el navegador pida nada.
- **B6 en parte**: landing nueva con el libro de muestra «Vera y Toby viajan a la Luna», cuatro portadas reales de ocasiones, cinco pasos, ediciones (gratis = cuento + hoja + portada + PDF casero, D3) y transparencia sobre la IA; 20 ideas de arranque en el paso 1.
- **Borrado a 30 días** (E14, cerrado): cron diario `/api/cron/purge` (`web/vercel.json`). Probado en la base real con dos libros de prueba caducados: el no pagado desaparece con sus imágenes; el pagado queda vacío y conserva el pedido.
- **Recorrido completo por la interfaz en la preview** (13 oct, noche): de la idea al PDF en 47 s con el cuento en caché, sin errores (imágenes en modo sin coste). Cuento nuevo: 26 s.
- **CI** (E3): GitHub Actions con tsc, eslint, 76 unitarios, build y 7 Playwright.

**Fuera del embudo (D1):** constructor de piezas y edición Clásica (`/clasico`, `/ilustrado`, `/libro`, `/gratis` siguen existiendo pero nada enlaza a ellos salvo `/gratis` desde su propio formulario).

**Abierto:**

| # | Qué | Causa |
|---|---|---|
| E6 | Legales con campos `Pending` | Faltan datos del responsable |
| E7 | Pago de prueba; sin emails | Código de B5 hecho; faltan las claves de Stripe y Resend (§7) |
| E15 | PDF: queda bastante blanco bajo el texto. La letra ya es de 20 pt (lo de «pequeña» fue por mirar una miniatura); el blanco viene del formato A4 vertical + imagen 3:2 (D5). Las rayas de diálogo que quedaban colgando al final del renglón, arregladas | Decidir si se cambia el formato (D5) |
| E17 | El cron de borrado necesita `CRON_SECRET` en producción (sin él no borra) y solo corre en producción | Álvaro (§7) |
| E18 | Los emails de `cuentos_leads` sin consentimiento de marketing no caducan | Decidir el plazo con los legales (E6) |
| E13 | Si el segundo plano no termina las 12 páginas en ≈ 3,5 min (corte de Vercel a 300 s), las que falten se pintan cuando el padre vuelve con su enlace, y el email de «listo» no sale | Aceptable para salir; con más volumen, encadenar otra función |
| E10 | En la interfaz de la preview las imágenes siguen en modo sin coste | Falta `GENERATION_PROVIDER=gemini-images` en Preview (la prueba real se hizo con `/api/dev`, que fuerza Gemini) |
| E11 | `/api/health` en producción | Ya no enseña nombres de variables y la comprobación profunda pide `HEALTH_TOKEN`. La variable antigua `service_role` sobra en Vercel |
| E12 | `/api/dev` solo existe fuera de producción | Correcto así; quitarlo antes del merge si se prefiere |

## 2. Decisiones (D1–D6 tomadas el 13 oct)

| # | Decisión | Resultado | Por qué |
|---|---|---|---|
| D1 | Todo lo que ve el padre es ilustración generada; fuera del embudo las piezas y las escenas fijas | **Decidido: sí.** Un estilo para salir; habrá más estilos en el futuro (la arquitectura los admite: `styles.json` + ancla por estilo) | Fase 0: calidad de libro de verdad y consistencia; las piezas no llegan |
| D2 | Gasto por lead antes del pago | **Decidido: ≈ 0,30 $** (hoja 1K + portada 2K + hasta 2 cambios de hoja); tope diario igual | El plan decía ≤ 0,10 € por lead (el código, 20 c): hoja + portada ya son ≈ 0,17 $ a precio de Gemini |
| D3 | Qué es gratis | **Decidido:** cuento completo en texto + hoja + portada en la web, y PDF casero con portada ilustrada y el texto | Mantiene el puente gratis del bloque de distribución (8 oct) sin las figuras; el Ilustrado pasa a ser lo único de pago |
| D4 | Proveedor en producción | **Decidido (13 oct): API de Gemini**, modelo `gemini-nano-banana-2.1` (el de la Fase 0; cambiado por la tarde desde `gemini-3.1-flash-image`: mitad de precio, 0,0504 $ la imagen 2K) | Coste ≈ 4 c la hoja 1K y 6 c la portada o página 2K; Gemini no depende de una suscripción |
| D5 | Estilo y formato | **Decidido:** un estilo (el de la Fase 0) y página = imagen 3:2 arriba + texto en banda debajo: A4 vertical (casero) y 20×20 (tapa dura) | El hueco para texto dentro de la imagen no es fiable; 3:2 + banda sirve para los dos formatos |
| D6 | Libro de muestra para la web y las redes | **Decidido:** «Vera y Toby viajan a la Luna», con la hoja de Vera (12 páginas + portada = 13 imágenes ≈ 26 créditos). Ver `docs/MUESTRA-LUNA.md` | Sin ejemplos reales no hay landing ni Reels; además mide la deriva en 12 páginas |

## 3. Producto: el padre cuenta la historia que quiere, nosotros hacemos el libro

Principios:
- **Esfuerzo mínimo:** con el nombre del niño y una frase sale un libro completo; todo lo demás tiene valor por defecto.
- **Libertad total de historia:** sin catálogo de ocasiones. Las ocasiones son ideas de arranque, no plantillas; añadir Navidad no cuesta dibujos.
- **Control donde importa:** el padre aprueba al personaje y puede pedir cambios con palabras («más rizos», «que el perro sea más pequeño»). En las páginas puede cambiar el texto y pedir otra versión.
- **Gasto en escalera:** texto gratis; 2 imágenes tras el email; el libro, tras el pago.

### 3.1 La ficha del cuento (lo necesario para personalizar)

Lo que pone el padre (todo opcional salvo el nombre):

| Bloque | Campo | Cómo se pide |
|---|---|---|
| Historia | Idea | Una caja: «Cuéntanos la idea como se la contarías a un amigo». Debajo, ideas de arranque (cumpleaños, Navidad, primer día de cole, llega un hermanito, viaje a la Luna…) y «Sorpréndeme» |
| | Tono | Aventura · tierno · divertido · para dormir (por defecto según la idea) |
| | Quién lo regala y dedicatoria | «De parte de…» + dedicatoria propia o propuesta |
| Protagonista | Nombre, edad, niño/niña/sin marcar | Campos cortos; el género solo para la concordancia del castellano |
| | Aspecto | Chips: forma y color de pelo, piel, ojos, gafas. Más «algo que le hace único» en texto libre (pecas, diente que se le cae, su capa) |
| | Ropa habitual | Chips + texto («su chubasquero amarillo») |
| Reparto | Hasta 2 recurrentes | Persona o mascota: nombre, relación y una línea de aspecto. Entran en la hoja |
| | Otros | Se nombran en la idea; salen descritos con texto cuando aparecen |
| Detalles | Lo que solo tú sabes | 0–5 líneas libres (frases que dice, sitios, manías). El planificador las reparte |

Lo que produce el planificador (LLM), la «biblia» del libro:
- Título, dedicatoria, 12 páginas con: texto (largo por edad), escena en castellano para el padre y en inglés para el modelo, quién sale, lugar, vestuario si cambia, plano (general/medio/cerca) y momento del día.
- Lugares recurrentes (máximo 4) y objetos recurrentes («la mochila de dinosaurio»), descritos una vez y repetidos igual.
- Reglas que el validador comprueba: 12 páginas; protagonista en ≥ 10; ≤ 3 personajes por imagen; secundarios recurrentes solo del reparto; sin números que haya que contar en la escena; sin marcas ni personajes con derechos (se sustituyen por equivalentes originales y se avisa); moderación del texto libre (ahora sí hace falta).

### 3.2 Embudo

| Paso | Qué ve el padre | Qué pone | Coste |
|---|---|---|---|
| 0 | Landing con páginas reales (Fase 0 y libro de muestra) | — | 0 |
| 1 | «¿De qué va el cuento?» | Una frase o una idea de arranque | 0 |
| 2 | «¿Quién lo protagoniza?» | Nombre, edad, aspecto en chips, reparto | 0 |
| 3 | El cuento escrito en 12 tarjetas (texto + qué se verá) en ~10 s | Nada, o cambia una tarjeta con una frase / «escribirlo de otra manera» | ≈ 0,01–0,05 € (LLM) |
| 4 | Email → «Así será Vera»: hoja de reparto + portada en ~1 min | Aprueba o pide hasta 2 cambios con palabras | ≈ 0,17–0,30 $ (D2) |
| 5 | Libro con las 12 páginas bloqueadas y precio | Paga | 0 |
| 6 | Las 12 páginas en ~2 min, revisión página a página (1 versión más incluida por página) | Ajusta textos | ≈ 1,6 $ (12 + ~30 % repeticiones a 2K) |
| 7 | PDF casero (y tapa dura más adelante) | Descarga o pide impresión | 4K para tapa dura ≈ 2 $ |

Gratis (D3): pasos 1–4 y PDF con portada + texto. El email del paso 4 es la captura del lead.

### 3.3 Reglas de generación (de la Fase 0)

1. Hoja de reparto en una imagen 3:2: protagonista (4 vistas + 4 expresiones) y hasta 2 recurrentes.
2. Cada página lleva como referencias la hoja aprobada y el ancla de estilo; redeclara la identidad y, aparte, el vestuario de esa escena.
3. Secundarios de una sola página: solo texto. Si repiten: a la hoja.
4. En la imagen no se cuentan cosas (velas, años, número de globos); eso va en el texto.
5. La maqueta no depende de huecos dentro de la imagen.
6. Control de calidad automático tras cada imagen: un modelo de visión comprueba rasgos clave (gafas, pelo, número de personajes, texto espurio) contra la ficha; si falla, un reintento antes de enseñarla.
7. Ancla de estilo propia: una de nuestras páginas (la Luna o la portada) en lugar del gouache genérico.
8. Objetos recurrentes (el cohete del libro de muestra): una descripción fija en cada página mantiene colores y rasgos, no la forma. Si la forma importa, el objeto entra en la hoja o lleva su propia imagen de referencia.

## 4. Contenidos que necesitamos

| Contenido | Para qué | Coste aprox. |
|---|---|---|
| Libro de muestra completo (D6) | Landing, carrusel de Instagram, Reel «de una frase a un libro», prueba de deriva | **Hecho (13 oct):** 13 imágenes, 26 créditos, todas a la primera; PDF A4 de 15 páginas (`docs/MUESTRA-LUNA.md`) |
| 4 portadas de ocasiones distintas con niños diversos (Navidad, primer día de cole, hermanito, aventura) | Landing y anuncios | 4 hojas + 4 portadas ≈ 16 créditos |
| 20 ideas de arranque | Paso 1 | Texto (Claude) |
| Ancla de estilo propia | Consistencia entre libros | Elegir entre las de la Fase 0 |
| 7 imágenes de la Fase 0 | Primeras pruebas de landing y redes | Hechas |

## 5. Bloques de trabajo, en orden

Una cosa a la vez; cada tarea se cierra con evidencia.

| Bloque | Qué | Quién | Hecho cuando |
|---|---|---|---|
| B0 | Decisiones D1–D6 | Álvaro | Hechas (13 oct) |
| B1 | Ficha + planificador de historia: esquema, prompt, validador, moderación, mock; prueba con proveedor real | Claude · clave de Anthropic u OpenAI de Álvaro | **Hecho (13 oct)**: 10/10 libros válidos (`docs/PLANIFICADOR.md`). Falta leerlos juntos |
| B2 | Nuevo flujo de creación (pasos 1–3) en lugar de `/crear` con piezas | Claude | **Hecho (13 oct)**: Playwright de una frase al cuento escrito |
| B3 | Hoja de reparto + portada tras el email; cambios con palabras; control de calidad | Claude · D4 resuelto | **Hecho (13 oct)**: 3 niños con hoja y portada en la preview, 10 c por lead (`docs/ILUSTRACION.md`) |
| B4 | Libro tras el pago: 12 páginas, revisión por página, maqueta 3:2 + banda, PDF | Claude | **Hecho (13 oct)**: libro de Mateo, 12 páginas reales, PDF de 15 A4 en Vercel |
| B5 | Pago y entrega: Stripe + emails + segundo plano | Álvaro claves · Claude | **Código hecho (13 oct)**, probado con webhook firmado. Falta: claves, un pago en modo test de Stripe y el email recibido |
| B6 | Contenidos (§4) y landing nueva | Claude genera · Álvaro elige | **Landing hecha (13 oct)** con el libro de muestra y 4 portadas de ocasiones; falta el Reel |
| B7 | Legales, dominio, prueba con 3 personas ajenas, merge a `main` | Álvaro · Claude | Tres libros sin ayuda |

Objetivo de calendario (propuesta): B1–B4 en tres semanas para vender antes de mediados de noviembre y llegar a Navidad con el PDF casero; tapa dura después.

## 6. Reglas de trabajo

1. **Una cosa a la vez.** Se abre una tarea, se cierra con evidencia, se anota aquí.
2. **Rama + PR, nunca `main` directo, nunca `--force`.** Texto por `push_files` desde la sesión; binarios por `git push` con la app de GitHub.
3. **Verificación antes de decir «hecho»:** lint, tsc, build, tests, captura mirada si es visual.
4. **Claves:** Álvaro las mete en Vercel o en `.env.local`; nunca en el chat.
5. **Generación de pago:** pocas tomas y coste anotado en cada prueba; nada de lotes para descartar.
6. **Errores:** URL + captura + qué se esperaba; entran en §1 antes de corregirse.
7. **Copy:** registro adulto, sin diminutivos, sin emojis en interfaz.

## 7. Lista de Álvaro (actualizada 16 oct)

Ninguna clave por el chat: a Vercel (proyecto `cuentos` → Settings → Environment Variables) o a un archivo local.

Hecho: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GENERATION_PROVIDER=gemini-images` en Preview, app de GitHub de Claude en el repo.

Pendiente, en orden (detalle de cada bloqueo en ESTADO §4):
1. **Marca «Érase su vez»** (16 oct). Antes de pagar nada, mirar que `@erasesuvez` está libre en Instagram y TikTok y buscar la marca en OEPM y EUIPO. Después:
   - Comprar `erasesuvez.com` en Vercel (Domains, 11,25 $ al año) y `erasesuvez.es` en un registrador español, porque Vercel no vende `.es`.
   - En el proyecto `cuentos` → Settings → Domains: añadir los dos, con `erasesuvez.es` como principal y `.com` redirigido a él. En el registrador del `.es`, los registros DNS que enseñe Vercel.
   - Buzón `hola@erasesuvez.es` para recibir (reenvío del registrador o un buzón); Resend con el mismo dominio para enviar.
   - Variables: `SITE_URL=https://erasesuvez.es`, `LEGAL_EMAIL=hola@erasesuvez.es`, `MAIL_FROM` con «Érase su vez». En Stripe, el nombre del negocio.
2. **Bloqueos de salida:** Gemini y menores de 18 (§4.16), plan Pro de Vercel y región de funciones en la UE (§4.17), región de Supabase (§4.18), clave de Gemini de un proyecto con facturación (§4.19).
3. **B5** (pasos exactos en `docs/PAGO.md`): Stripe en modo test en la preview (`STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`) y un pago con la tarjeta 4242 4242 4242 4242. Resend con el dominio verificado (`RESEND_API_KEY` y `MAIL_FROM`).
4. **Variables de producción** (ámbito Production): las tres claves, `GENERATION_PROVIDER=gemini-images`, `CRON_SECRET` (obligatorio), `SITE_URL`, `LEGAL_NAME`, `LEGAL_NIF`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, Stripe en modo real y Resend. Sin `NEXT_PUBLIC_DRY_RUN_PAYMENT`. `HEALTH_TOKEN` si se quiere la comprobación profunda. Borrar la variable antigua `service_role`.
5. **Fiscal:** confirmar con la gestoría el IVA (4 % como libro), el epígrafe IAE y cómo emitir las facturas.
6. **B7:** tres personas ajenas hacen un libro sin ayuda. Después, unir el PR #1 a `main`.

## 8. Registro de decisiones

Movido el 13 oct (noche) a `docs/ESTADO.md` §2, que es desde entonces el único registro (append-only). Las entradas anteriores están copiadas allí tal cual.
