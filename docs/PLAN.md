# Plan de trabajo — cuentos

Fuente de verdad del estado y del orden de trabajo. Se actualiza en cada sesión; lo que no está aquí no está en marcha. PRD: `PRD.md` (v0.2, se reescribe tras las decisiones de §2). Rama de trabajo: `feat/fase-1-journey-clasico` → PR #1 → `main`.

## 1. Estado real (13 oct 2026)

**Fase 0 hecha** (`docs/FASE0.md`): con Nano Banana 2.1 un niño descrito con texto sale igual en todas las páginas, con disfraz, de noche o tumbado, junto a su mascota y con secundarios descritos en una frase. 7 imágenes a la primera, 2 créditos cada una a 2K. Esto decide el producto: la ilustración generada sustituye a las figuras recortadas. **Libro de muestra hecho** (`docs/MUESTRA-LUNA.md`): 12 páginas + portada sin deriva del personaje.

**Construido y reutilizable:** Next.js en Vercel; `/api/story` con proveedores intercambiables, validación, caché y límite por IP (hoy corre en `mock`); servicio de generación con trabajos idempotentes, presupuesto por lead/día/libro, `run`/`status` y worker; adaptador Gemini; PDF en servidor (13 páginas A4, verificado en Vercel); captura de email con declaración del tutor; pago simulado; legales en borrador; cookies; 10 tests Playwright y 47 unitarios.

**Construido que sale del embudo (D1):** constructor de avatar por piezas, figuras pintadas recortadas (`pieces-build`, el arreglo del 12 oct incluido), 12 escenas vectoriales, esqueleto fijo de 12 momentos de cumpleaños, edición Clásica con esas figuras. Motivo (Álvaro, 13 oct): queda plantilla y las combinaciones no cuadran.

**Abierto:**

| # | Qué | Causa |
|---|---|---|
| E3 | Sin CI | El acceso de GitHub ya está (13 oct, `git push` desde la sesión); falta un workflow que pase unitarios y Playwright en cada PR |
| E6 | Legales con campos `Pending` | Faltan datos del responsable |
| E7 | Pago simulado; sin entrega por email | Faltan Stripe y Resend |
| E10 | Nada real se ha ejecutado en el flujo | La historia ya iría por Anthropic en la preview, pero el flujo que la usa es el antiguo; imágenes en `dry-run` hasta tener el flujo nuevo y los topes de D2 (B2–B3) |
| E11 | Antes de producción, `/api/health` es público | Protegerlo o quitarle `similarNames`. Claves verificadas en la preview el 13 oct: Supabase (clave de servicio, lectura ok; `/api/books/<id>` da 404 y no 503), Anthropic `claude-sonnet-4-5` y Gemini `gemini-3.1-flash-image`. La variable antigua `service_role` sobra |

## 2. Decisiones (D1–D6 tomadas el 13 oct)

| # | Decisión | Resultado | Por qué |
|---|---|---|---|
| D1 | Todo lo que ve el padre es ilustración generada; fuera del embudo las piezas y las escenas fijas | **Decidido: sí.** Un estilo para salir; habrá más estilos en el futuro (la arquitectura los admite: `styles.json` + ancla por estilo) | Fase 0: calidad de libro de verdad y consistencia; las piezas no llegan |
| D2 | Gasto por lead antes del pago | **Decidido: ≈ 0,30 $** (hoja 1K + portada 2K + hasta 2 cambios de hoja); tope diario igual | El plan decía ≤ 0,10 € por lead (el código, 20 c): hoja + portada ya son ≈ 0,17 $ a precio de Gemini |
| D3 | Qué es gratis | **Decidido:** cuento completo en texto + hoja + portada en la web, y PDF casero con portada ilustrada y el texto | Mantiene el puente gratis del bloque de distribución (8 oct) sin las figuras; el Ilustrado pasa a ser lo único de pago |
| D4 | Proveedor en producción | **Decidido (13 oct): API de Gemini**, modelo `gemini-3.1-flash-image` (clave puesta por Álvaro y verificada; modelo por defecto en el código) | Coste parecido (≈ 0,07–0,10 $ por imagen 2K); Gemini no depende de una suscripción |
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
| B1 | Ficha + planificador de historia: esquema, prompt, validador, moderación, mock; prueba con proveedor real | Claude · clave de Anthropic u OpenAI de Álvaro | 10 ideas de prueba dan 10 libros válidos; los leemos los dos |
| B2 | Nuevo flujo de creación (pasos 1–3) en lugar de `/crear` con piezas | Claude | Playwright: de una frase al cuento escrito sin errores |
| B3 | Hoja de reparto + portada tras el email; cambios con palabras; control de calidad | Claude · D4 resuelto | 3 niños distintos con hoja aprobada en la preview y coste anotado |
| B4 | Libro tras el pago: 12 páginas, revisión por página, maqueta 3:2 + banda, PDF | Claude | PDF de 13 páginas con ilustraciones reales |
| B5 | Pago y entrega: Stripe + email con PDF | Álvaro claves · Claude | Pago de prueba completo y email recibido |
| B6 | Contenidos (§4) y landing nueva | Claude genera · Álvaro elige | Landing con el libro de muestra |
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

## 7. Lista de Álvaro (13 oct; claves y GitHub hechos por Álvaro el 13 oct, verificación en §1)

Ninguna clave por el chat: a Vercel (proyecto `cuentos` → Settings → Environment Variables, Production y Preview) o a un archivo local.

1. ~~Clave del LLM de historia~~ (`ANTHROPIC_API_KEY`; `STORY_PROVIDER` ya no hace falta): añadida 13 oct, con workspace.
2. ~~Proveedor de imágenes~~ (`GEMINI_API_KEY`): añadida 13 oct.
3. ~~App de GitHub de Claude en el repo~~: hecha 13 oct (`git push` funciona desde la sesión).
4. ~~`SUPABASE_SERVICE_ROLE_KEY`~~: añadida 13 oct con ese nombre (antes estaba como `service_role`, que se puede borrar).
5. Más adelante: datos legales, Stripe, Resend, `NEXT_PUBLIC_CLARITY_ID`.

## 8. Registro de decisiones

- 8 oct: solo ocasiones felices; sin fotos del menor; avatar por rasgos.
- 9 oct: registro adulto en todo el sitio; estética editorial; Fraunces + Geist; verde botella como único acento.
- 9 oct: Clarity solo tras consentimiento; franja superior, no flotante.
- 9 oct (tarde): la v1 pasa de plantillas a motor de generación (historia única por LLM + ilustración por hoja de personaje) con gasto antes del pago acotado.
- 11 oct: motor de historia con `mock`; el proveedor real se activa por variable de entorno. Los nombres que el adulto escribe en los detalles cuentan como permitidos.
- 13 oct (Álvaro): el look de piezas queda plantilla y las combinaciones no cuadran; los padres tienen que poder hacer la historia que quieran con poco esfuerzo; calibrar con Nano Banana desde Higgsfield como si fuera la clave de Gemini.
- 13 oct: Fase 0 hecha y positiva (`docs/FASE0.md`).
- 13 oct (Álvaro): todo lo que ve el padre es ilustración generada, un estilo para salir y más estilos en el futuro; gratis = texto + hoja + portada + PDF casero; hasta ≈ 0,30 $ por lead antes del pago; página con imagen 3:2 y texto en banda; libro de muestra «Vera y Toby viajan a la Luna».
- Sustituidas por D1 (13 oct): «Clásico e Ilustrado comparten las figuras pintadas» (9 oct) y «las piezas se generan en el build» (9 oct).
