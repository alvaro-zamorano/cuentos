# Planificador de historias (B1) — 13 oct 2026

La ficha del padre se convierte en el «plan» del libro: título, dedicatoria, 12 páginas con texto y qué se verá, lugares y objetos recurrentes y, si hace falta, personajes recurrentes inventados. Código: `web/lib/plan/` (ficha, ideas de arranque, moderación, reglas, prompt, validador, mock, planificador) y `web/lib/llm.ts`. Rutas: `POST /api/plan` y `POST /api/plan/page` (cambiar una página con una frase).

## Cómo funciona

1. **Moderación local** de todo el texto libre antes de llamar a nadie: palabras que no van en un cuento (armas, violencia, sexo, drogas, insultos, muerte), con excepción de frases hechas («muerta de risa»), y datos de contacto (email, teléfono, enlaces). Coste 0.
2. **LLM** (`claude-sonnet-5-5`, razonamiento mínimo, esfuerzo medio) con el prompt de `lib/plan/prompt.ts`. Si la idea no se puede adaptar, devuelve `refusal`.
3. **Normalización y validación** (`lib/plan/validate.ts`): 12 páginas; protagonista en ≥ 10 imágenes; ≤ 3 personajes por imagen; lugares, objetos y reparto que existan; nada de contar en la imagen («cinco velas») ni letras («un cartel con su nombre»); sin marcas ni personajes con derechos; nombres propios solo de la ficha; longitud por edad; detalles reales presentes.
4. **Una corrección** en la misma conversación si hay algo grave, faltan detalles o aparecen nombres inventados. Las longitudes se aceptan con aviso, sin otra vuelta.

Cambiar una página: misma moderación, el modelo reescribe solo esa página con el libro como contexto, y se valida esa página (con los nombres que el padre escriba en su petición como permitidos).

## Prueba con 10 fichas (`lib/plan/evalCases.ts`, `/api/dev?task=plan&case=N`, preview)

| # | Ficha | Resultado | Tiempo | Intentos | Coste |
|---|---|---|---|---|---|
| 1 | Vera, 6, Luna con Toby, 3 detalles | «Vera y el cohete de cartón»; inventa un dino lunar (detalle de los dinosaurios) | 22 s | 1 | 3,7 c |
| 2 | Hugo, 3, primer día de cole | «Hugo y la mochila de dinosaurio»; frases cortas; la seño y una compañera como recurrentes | 37 s | 2 | 8,2 c |
| 3 | Lucía, 8, pistas de la abuela Carmen, 4 detalles | «Lucía y el tesoro de la abuela»; los 4 detalles (piedras, arqueóloga, guisantes, torrijas) | 48 s | 2 | 10,0 c |
| 4 | Mateo, 5, «Sorpréndeme», gata Misu | «Mateo y la torre de nubes»; inventa la nube Algodón | 43 s | 2 | 9,5 c |
| 5 | Daniela, 4, Nochebuena con su hermano Leo | «Daniela y el ruido del tejado»; Papá Noel como recurrente | 27 s | 1 | 4,3 c |
| 6 | Álex, 7, género sin indicar, «quiere ser Spiderman» | «Álex y el ladrón de columpios»; Spiderman sustituido y avisado al padre | 35 s | 1 | 5,3 c |
| 7 | Martina, 4, llega su hermano Pablo, dedicatoria propia | «Martina y el mundo de Pablo»; dedicatoria copiada tal cual | 28 s | 1 | 4,5 c |
| 8 | Nico, 2, miedo a la oscuridad, para dormir | «Nico y las sombras amigas»; texto muy corto y rítmico | 17 s | 1 | 3,2 c |
| 9 | Inés, 9, detective de calcetines | «Inés y el misterio de los calcetines»; inventa al Calcetinero | 33 s | 1 | 5,1 c |
| 10 | Pau, 6, Ratoncito Pérez con el abuelo Juan | «Pau y el Ratoncito Pérez»; corrigió por un detalle que faltaba | 45 s | 2 | 9,7 c |

**10 de 10 libros válidos.** Los casos 2–4 se hicieron antes de dejar de corregir por longitudes (por eso dos intentos); con la regla actual, 7 de 10 salen a la primera. Media ≈ 33 s y ≈ 6 c por libro.

Lo que se vio al leerlos y ya está corregido en el prompt:
- Con género «sin indicar» se escapó algún participio («se quedó helado»).
- Títulos con mayúsculas a la inglesa («El Misterio de los Calcetines»).
- Una escena decía quién no salía («Misu no aparece») y otra contradecía su lugar.
- Mamá y papá como extras en varias páginas (riesgo de que cambien de cara): ahora pasan al reparto si hay hueco o repiten la misma descripción.

Pendiente: leerlos juntos (criterio de B1). Para leer uno en la preview: `/api/dev?task=plan&case=N` (de pago, ≈ 5 c) o hacer el recorrido en `/crear`.

## Modelos y tiempos

- Los modelos 5.x razonan por defecto y con `max_tokens` 6000 se quedaban sin texto (Haiku 5.5: parada por `max_tokens`; Sonnet 5.5: más de 120 s). Se fija `thinking` mínimo y `effort` por tarea (`PLAN_*`, `ART_*`, `QC_*` en el entorno).
- `temperature` no se admite en los 5.x («deprecated for this model»).
- Precios (platform.claude.com, 13 oct): Sonnet 5.5 a 2 $/10 $ el millón de tokens de entrada/salida; Haiku 5.5 a 0,10 $/0,50 $.
