# Misión Hermes — assets del producto `cuentos`

Perfil `cuentos` en el Mac Mini. Objetivo: producir los presets (anclas, rasgos, hojas, escenas, arcos, plantillas) con puertas de aprobación por Telegram y topes de generación. Actualizada tras el PRD v0.2: **la Fase 0 (T1 reducido + T4 reducido) va primero y decide el producto ilustrado.**

## Reglas globales

- Raíz `~/cuentos/assets/`, todo registrado en `manifest.json` (id, ruta, prompt exacto, modelo, coste, estado).
- Modelo barato para orquestar; imagen vía API de OpenAI con la clave en `.env`, nunca en logs ni en el chat.
- Tope por tarea y tope global. Al llegar, parar y avisar. Nunca regenerar en bucle.
- Idempotente: si el archivo existe y está aprobado, saltar.
- Ninguna fase arranca sin aprobación de la anterior por Telegram.
- Prompts en inglés, en lenguaje natural descriptivo (ver `prompts/`).

## Fase 0 — Evidencia (primero, tope 30 generaciones)

**T1r · 1 ancla de estilo.** Estilo: acuarela (Prompt 1). Tope 2 intentos. Aprobación por Telegram.
**T3r · 1 hoja de personaje genérico** (Prompt 3) con el ancla como referencia. Tope 1.
**T4r · 12 escenas de cumpleaños** (los `scenePrompt` de `web/lib/arcs/cumpleanos.ts`), 2 candidatos por escena, ancla + hoja como referencias. Tope 24.
**T6r · Evaluación humana.** Hoja de contacto con la hoja de personaje y las 24 escenas; formulario para 3 evaluadores: "¿es claramente el mismo niño?" sí/no por escena. Informe `eval-report.md` con % y coste total real (incluido upscale ×3 de prueba en 2 escenas).
**Salida:** go/no-go. Criterio: ≥70 % "mismo niño" y coste por libro compatible con precio.

## Fase 1+ (solo si go)

**T0 · Infraestructura.** Carpetas por estilo, `manifest.json`, `prompts/` con plantillas y placeholders, kanban.
**T1 · Anclas de estilo.** 5 estilos restantes × 1 imagen. Tope 2 intentos por estilo.
**T2 · Catálogo de rasgos.** Por estilo: pelo, piel, ojos, gafas, outfits, accesorios, mascotas, familiares. Tope 1 por hoja. Recorte en PNG individuales + `traits.json`.
**T3 · Hojas de personaje de prueba.** 3 niños por estilo. Tope 1 por hoja.
**T4 · Banco de escenas.** Ocasiones nuevas × estilos. Confirmar presupuesto antes.
**T5 · Ornamentos.** 1 hoja transparente por estilo, recortada.
**T6 · Evaluación automática.** Script DINOv2/CLIP calibrado contra el juicio humano de T6r. Solo informa.
**T7 · Arcos narrativos.** Texto, barato. Siguiente ocasión del backlog (Navidad/Reyes), 2 franjas, formato de `cumpleanos.ts`.
**T8 · Biblioteca de prompts final.** Plantillas con `{traits}`, `{scene}`, `{expression}`.
**T9 · Plantillas POD.** 20×20 cm con sangrado 3 mm; PDF de prueba verificado por script.
**T10 · Impresión bajo demanda.** Gelato, Peecho, Lulu: tamaños, sangrado, coste tapa dura, envío a España, plazo. `print-options.md` + fecha límite real para Navidad.
**T11 · README de assets.**
**T12 · Informe de costes** al cierre de cada fase.

Orden: Fase 0 → (go) → T0 → T1 ⟂ T7 ⟂ T10 → T2 → T3 → T4 → T5 ⟂ T6 → T8 → T9 → T11.

## Prompts base

Ver conversación del 8 oct 2026 (Prompt 1 ancla, 2 rasgos, 3 hoja, 4 escena, 5 ornamentos). Copiarlos a `prompts/` en T0.
