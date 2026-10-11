# Motor de historia

Escribe las 12 páginas de cada cuento a partir del esqueleto del cumpleaños y de los detalles reales que da el adulto.

## Flujo

1. `/crear`, paso 2: «Lo que solo tú sabes», 5 campos de una línea (≤ 140 caracteres), mínimo 2 para continuar. Se guardan en `draft.details`.
2. Paso 3: si `draft.story` no existe o su `inputHash` no coincide con el de las entradas actuales (nombre, edad, acompañante, detalle especial, detalles, semilla), el cliente llama a `POST /api/story` y enseña «Escribiendo el cuento de {nombre}».
3. La ruta limpia el borrador, construye la entrada (`lib/story/spec.ts`), busca en `cuentos_stories` por `input_hash` y proveedor (si hay Supabase), y si no hay nada genera: proveedor → JSON → `validateStory` → un reintento con los motivos → si vuelve a fallar, arco base (`fallback: true`, motivo en el log).
4. La historia se guarda en `draft.story`. `buildBook` la usa mientras el hash coincida; si no, el arco de siempre. `textOverrides` se aplica encima. `/libro`, la edición ilustrada y `/api/jobs` leen `buildBook`.
5. «Escribirlo de otra manera»: sube `storySeed` (entra en el hash), 2 veces por sesión. Al llegar la versión nueva se borran los textos editados; si falla, se mantiene la anterior.

## Variables de entorno (solo servidor)

| Variable | Uso |
|---|---|
| `STORY_PROVIDER` | `mock` (por defecto), `anthropic` u `openai`. Sin la clave del elegido se usa `mock` y la respuesta lo dice (`provider: "mock"`, `requestedProvider`). |
| `STORY_MODEL` | Modelo. Por defecto `claude-sonnet-4-5` (anthropic) o `gpt-4.1-mini` (openai), fijados solo en `DEFAULT_MODELS` de `lib/story/provider.ts`. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Clave del proveedor. Nunca llega al cliente ni a los logs. |
| `STORY_COST_CENTS_PER_1K_IN` / `_OUT` | Coste estimado por cuento (`costCents`). Sin ellas, 0 y `costEstimated: false`. |
| `STORY_RATE_PER_HOUR` | Límite por IP (20 por defecto) además de 1 por segundo. En memoria del proceso. |

Cambiar de proveedor: poner `STORY_PROVIDER` y la clave en Vercel (o `web/.env.local`) y redesplegar. No hay que tocar código.

## Qué valida (`lib/story/validate.ts`)

12 páginas numeradas 1–12; escena y expresión válidas; longitud por franja (2–4: 12–28 palabras y frases ≤ 9; 5–8: 35–65); título ≤ 6 palabras y dedicatoria ≤ 25; sin emojis, lista negra (miedo, muerte, enfermedad, castigos, tristeza…), diminutivos empalagosos, marcas no escritas por el adulto ni comparaciones con otros niños; nombres propios solo los del niño, el acompañante y los que aparecen en los detalles; al menos 3 detalles presentes (o todos si hay menos), por palabra de ≥ 5 letras que no sea vocabulario del propio cumpleaños; el detalle especial presente.

## Si falla

- Validación o error del proveedor dos veces: arco base con `fallback: true`; la interfaz dice «No hemos podido escribir una versión nueva; este es el cuento base».
- Red o 429 en el cliente: el paso 3 enseña el arco base con la misma nota; al volver al paso se reintenta.
- El mock (`lib/story/mock.ts`) es determinista, no gasta y siempre pasa la validación: es lo que corre en preview y en tests.

Tests: `npm run test:unit` (mock y validador) y `npm test` (Playwright, journey con historia).
