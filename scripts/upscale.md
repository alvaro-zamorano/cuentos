# Upscale ×3 de las escenas ilustradas (RF-13) — pendiente

Estado: **no implementado**. Se ejecuta en el Mac Mini después de que el worker deje los candidatos elegidos en el bucket privado `cuentos`.

## Por qué

GPT-image entrega 1536×1024 px. La impresión pide 300 dpi con 3 mm de sangrado por lado.

| Formato | Medida con sangrado | px a 300 dpi | Factor sobre 1536 px de ancho |
|---|---|---|---|
| Doble página tapa dura 20×20 cm (40×20 cm abierta) | 406 × 206 mm | **4795 × 2433 px** | ×3,12 |
| Página A4 apaisada (casero, ilustración ~66 % del ancho) | ~196 × 147 mm | ~2315 × 1736 px | ×1,5 |

Cálculo: px = mm / 25,4 × 300. 406 mm → 4795 px; 206 mm → 2433 px. (El PRD redondea a ~4866×2433 contando 20×2 cm + sangrado; con 3 mm por lado son 4795 px de ancho.)

Conclusión: ×3 cubre el A4 casero de sobra y se queda justo en la doble página de tapa dura (1536×3 = 4608 px < 4795 px). Para tapa dura: upscale ×4 y recorte, o ×3 aceptando ~288 dpi efectivos. Decidir con la prueba de imprenta (T9/T10).

## Paso propuesto

1. Herramienta: Real-ESRGAN (`realesrgan-ncnn-vulkan`, binario para macOS con Metal/Vulkan), modelo `realesrgan-x4plus` o `realesrgan-x4plus-anime` (probar los dos con un estilo plano y uno pictórico).
2. Comando por imagen:
   ```bash
   realesrgan-ncnn-vulkan -i in.png -o out.png -n realesrgan-x4plus -s 3
   ```
3. Integración: nuevo `kind = 'upscale'` en `cuentos_generation_jobs` (o paso final del worker tras `chosen`), guardando `books/<book_id>/print/<page>.png`.
4. Verificación por script: comprobar dimensiones ≥ objetivo y perfil sRGB antes de maquetar (RF-16).
5. Coste: local (Mac Mini) = 0 € por llamada; anotar tiempo por imagen. Alternativa: upscaler del proveedor (con coste por imagen, contarlo en el tope por libro).

## Pendiente de decidir

- ×3 o ×4 para tapa dura.
- Modelo de Real-ESRGAN por estilo.
