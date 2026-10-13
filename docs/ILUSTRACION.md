# Ilustración del flujo nuevo (B3–B4) — 13 oct 2026

Del plan escrito a la hoja de personajes, la portada y las 12 páginas, con Gemini `gemini-nano-banana-2.1` (D4) y control de calidad. Código: `web/lib/plan/art.ts` (dirección de arte y prompts), `web/lib/book/service.ts` (hoja, portada, cambios con palabras, pago de prueba, páginas, vista), `web/lib/generation/service.ts` (`runJob` con la marca `v2`: JPEG y control de calidad), `web/lib/plan/qc.ts`, `web/lib/pdf/book2.ts`. Rutas: `/api/libro/{start,sheet,approve,plan,pay,pages,page,view,pdf}` y `/api/generate/run`.

## Cómo funciona

1. **Dirección de arte** (Haiku 5.5, una llamada al pasar al paso 4): traduce al inglés el reparto (identidad sin ropa + ropa habitual), los lugares, los objetos y la portada. Los rasgos de los chips del protagonista no pasan por el LLM: se escriben tal cual (pelo, piel, ojos, gafas) y el LLM solo añade lo libre (marcas, cara). Lo que el niño lleva siempre (la gorra del revés) entra en la ropa de la hoja.
2. **Hoja de reparto** 3:2 a 1K (protagonista en 4 vistas + 4 expresiones; recurrentes abajo en 2 vistas) con el ancla de estilo como referencia. **Portada** 3:2 a 2K con la hoja + ancla, el tercio superior despejado para el título.
3. **Cambios con palabras** («que lleve siempre su gorra roja del revés»): el LLM corrige la descripción del reparto y se pintan hoja y portada nuevas. Máximo 2 (`MAX_SHEETS` = 3 versiones).
4. **Tras el pago**: dirección de arte de las 12 páginas (otra llamada a Haiku) y 12 páginas a 2K con la hoja aprobada + ancla. Cada página redeclara la identidad, cambia solo la ropa si la escena lo pide y dice qué personajes de la hoja no salen. Una versión más por página.
5. **Control de calidad** (Sonnet 5.5 con visión, tolerante): texto pintado, rasgos clave cambiados, personajes de más o de menos, anatomía rota. Si falla, se repite una vez antes de enseñarla.
6. Las imágenes se guardan en JPEG (calidad 88) en el bucket privado `cuentos`; el PDF (A4 vertical, imagen 3:2 + banda de texto) se monta con Chromium en Vercel.

## Prueba real en la preview (13 oct, `/api/dev`, Gemini explícito)

| Niño | Ficha | Hoja | Portada | Notas |
|---|---|---|---|---|
| Lucía, 8 | Abuela Carmen + gato inventado | 1K, bien a la primera | 2K, bien | El primer intento falló porque el ancla no estaba en la función (arreglado: `outputFileTracingIncludes`) |
| Mateo, 5 | Gata Misu + nube Pelusa inventada | 1K, bien | 2K, bien; torre con piezas de aspecto Lego | Cambio con palabras «que lleve siempre su gorra roja del revés»: hoja y portada nuevas correctas, bloques de madera sin tetones |
| Inés, 9 | Hermano + duende de los calcetines | 1K, bien | 2K, bien | Gafas, pelo y gabardina iguales en todas las vistas |

**Libro completo de Mateo** (12 páginas a 2K): Mateo, Misu y Pelusa idénticos en las 12; 11 páginas pasaron el control a la primera y la página 1 se repitió porque se coló la gata (ya corregido en el prompt). PDF en Vercel: 15 páginas A4, 6,75 MB, 8,4 s con Chromium en 2,4 s.

Tiempos: hoja ≈ 30 s, portada y página ≈ 30–35 s (con el control de calidad). Con tres a la vez, el libro tarda unos 2–3 minutos.

## Coste medido

| Concepto | Coste | Fuente |
|---|---|---|
| Hoja 1K | 4 c | tabla de precios de Gemini (0,0336 $) + entrada |
| Portada o página 2K | 6 c | 0,0504 $ + entrada de dos referencias |
| Antes del pago (hoja + portada) | 10 c; con dos cambios, 30 c | = D2 |
| Libro pagado (12 páginas + ~1 repetición) | ≈ 78 c de imágenes | Mateo: 12 × 6 + 6 |
| Plan (Sonnet 5.5) | 4–11 c | `/api/dev` |
| Dirección de arte (Haiku 5.5) | < 0,2 c por llamada | 0,10 $/0,50 $ por millón |
| Control de calidad (Sonnet 5.5) | ≈ 0,3–0,4 c por imagen | estimado por tokens |
| **Total de la prueba** (3 planes, 3 hojas + 1 cambio, 4 portadas, 13 páginas, controles) | **≈ 1,7 $** | `cuentos_spend` + llamadas |

Por libro vendido a 14,90 €: ≈ 0,10 $ (plan) + 0,10 $ (hoja y portada) + 0,80 $ (páginas) + 0,05 $ (controles) ≈ **1 $**.

## Lo que se arregló con la prueba

- El ancla de estilo no viajaba a la función (en Vercel `public/` no está en disco).
- El prompt de la hoja repetía los rasgos, duplicaba nombres («Carmen, Carmen») y dejaba personajes y lugares en castellano: ahora se pide un elemento por cada id y se limpia lo que vuelve.
- El control de calidad con Haiku rechazaba hojas correctas: pasa a Sonnet y a «en caso de duda, vale».
- Haiku a veces devolvía dos objetos JSON: el extractor toma el primero equilibrado y la llamada se repite una vez.
- `GENERATION_COST_CENTS_PER_IMAGE` (7 c en Vercel, del flujo antiguo) se imponía a la tabla por resolución: ahora manda la resolución.

## Pendiente

- Activar las imágenes de verdad en la interfaz de la preview: `GENERATION_PROVIDER=gemini-images` en Vercel (Preview).
- Ancla de estilo propia (regla 7): probar una de nuestras páginas en lugar de `gouache.jpg`, con cuidado de que no arrastre personajes.
- Personajes inventados con aspecto de personaje conocido (el duende verde de orejas grandes): vigilarlo en el control de calidad.
