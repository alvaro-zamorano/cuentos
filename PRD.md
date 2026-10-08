# PRD — Cuentos personalizados para imprimir

Nombre en clave: `cuentos` · Marca comercial: pendiente (separada de la marca personal)
Versión 0.2 · 8 oct 2026 · Autor: Álvaro Zamorano
Historial: v0.1 borrador → revisión independiente → v0.2 (cambios en §16)

---

## 0. Tesis en una frase

Un padre, madre, tío o abuelo crea en tres pantallas un cuento que no existía hasta hoy, con su niño como protagonista (avatar, no foto), para una ocasión feliz concreta, y lo imprime en casa o lo recibe en tapa dura. No competimos en "tu hijo en la portada" (saturado); competimos en "este cuento solo existe para él".

**Riesgo que decide el producto**: ilustrar con consistencia a un coste menor que el precio. Se valida con evidencia ANTES de construir nada que lo dé por hecho (§14, Fase 0).

---

## 1. Distribución (bloque confirmado 8 oct 2026)

```yaml
distro:
  audiencia: "Madre o padre en España, 30–45, con hijo de 2–8, que busca un regalo de cumpleaños o Navidad que no sea otro juguete; también abuelos y tíos regaladores"
  canal_primario: "Instagram Reels — Malasmadres, Mamás Molonas, cuentas de crianza; el producto es visual"
  canal_owned: "Web del producto con captura de email + Google (SEO/GEO) sobre 'cuento personalizado niño', 'regalo cumpleaños personalizado'"
  puente: "Lead magnet: un cuento de cumpleaños en PDF gratis para imprimir en casa, con avatar elegido por el usuario; en el reel 'el tuyo en el link'"
  formato: "Reel de 20–30 s: de los 3 clics al cuento impreso en casa, con las hojas en mano"
  cadencia: "3/semana × 30 días, ventana objetivo Navidad 2026"
  primera_pieza: "Semana 2: PDF de cumpleaños completo (1 estilo ancla aprobado, 12 ilustraciones) descargable desde la landing + 1 reel enseñándolo impreso en casa"
```

Avisos registrados: marca y cuenta propias en castellano, no mezclar con la marca personal (inglés, AI labs). SEO rinde a >30 días; para Navidad 2026 la palanca rápida son reels o anuncios (presupuesto: pendiente, §15).

### Checklist DISTRO

```
[x] Bloque distro: rellenado antes de construir
[x] Puente rented→owned definido (lead magnet PDF)
[ ] Primera pieza publicada ANTES del 50% del build (semana 2 de 6)
[ ] Automatización de paquete semanal activa
[x] Definición de "terminado" incluye un check de distribución
[ ] Fecha de revisión a 30 días en el calendario (8 nov 2026)
```

Definition of done con criterio de distribución verificable:
- `file_exists: public/lead-magnet/cumpleanos.pdf`
- `http_status: 200` de la URL de descarga en producción

---

## 2. Problema y trabajo a realizar (JTBD)

**Situación**: se acerca una ocasión feliz (cumpleaños, Navidad, primera bici, hermanito nuevo) y el regalador quiere algo que no sea otro juguete y que diga "esto es para ti".

**Alternativas actuales y por qué fallan**
- Wonderbly (editorial, +70 títulos, 12 idiomas, ~35 $): calidad alta, pero la historia es un título de catálogo con tu nombre.
- Hooray Heroes (emoción modular, 10–15 mini-historias, padre+hijo en cada página): fricción mínima, pero plantilla pura.
- Apps IA "sube una foto" (~50, 30–60 $): prometen personalización real y entregan plantilla con otra cara, con resultados inconsistentes.

**Trabajo**: "Quiero regalarle a Lucas un cuento sobre *su* cumpleaños, en el que salga él y su perro, que pueda tener impreso antes del sábado."

---

## 3. Segmentos

| Segmento | Quién | Disparador | Canal |
|---|---|---|---|
| Padre/madre | 30–45, hijo 2–8 | cumple, Navidad, hito | Instagram, Google |
| Regalador | tíos, abuelos, padrinos | cumple, Navidad | Google ("regalo original niño"), recomendación |
| Educador (v2) | profes de infantil | fin de curso, bienvenida | boca a boca, LinkedIn |

Niño objetivo: 2–8 años, dos franjas de texto (2–4: 1–2 frases/página; 5–8: 3–4 frases/página).

---

## 4. Posicionamiento y diferencial

| Eje | Wonderbly | Hooray Heroes | Apps IA foto | **Nosotros** |
|---|---|---|---|---|
| Historia | catálogo | módulos | plantilla | **única, con su mundo real** |
| Identidad | avatar | avatar | foto (inconsistente) | **avatar por rasgos, consistente** |
| Ocasión | genérica | emocional | genérica | **felices y concretas** |
| Idioma/cultura | traducción | inglés | inglés | **castellano nativo** |
| Continuidad | no | no | no | **serie / suscripción (v2)** |
| Calidad visual | ilustración humana | ilustración humana | slop | **estilos curados + hoja aprobada** |

Diferenciales (de mayor a menor peso): historia única con detalles reales · ocasiones felices concretas · castellano nativo · consistencia visual como métrica · serie (v2) · coautoría con el niño (v2).

---

## 5. Casos de uso (ocasiones felices)

v1 (Fase 1): **1. Cumpleaños**.
Backlog por orden: Navidad/Reyes · Primera bici · Hermanito/a nuevo · Primer día de cole · Mascota nueva · Primer diente · Vacaciones de verano · Visita de los abuelos · Aprender a nadar.

Cada ocasión = arco de 12 dobles páginas por franja de edad, en castellano, con huecos para nombre, edad, 1 personaje secundario (v1: mascota o abuelo/a de lista cerrada) y 1 "detalle especial" de lista cerrada (peluche, comida favorita, color favorito, superpoder soñado…). Texto libre: no en v1 (evita moderación y deriva).

Carga real de escritura: 24 dobles páginas por ocasión. Las 10 ocasiones son 240; se escriben de una en una, cada una después de vender la anterior.

---

## 6. Journey (el producto es el flujo)

| Paso | Pantalla | Input | Default | Salida |
|---|---|---|---|---|
| 0 | Landing | — | — | CTA "Crea su cuento", lead magnet |
| 1 | **Quién** | nombre, edad, avatar (pelo, piel, ojos, gafas, outfit) | avatar aleatorio coherente | `Character` |
| 2 | **Su mundo** | ocasión (v1: cumpleaños), 1 acompañante opcional, 1 detalle especial (listas cerradas) | sin acompañante | `occasionId`, `companion`, `special` |
| 3 | **Preview** | 12 páginas en modo Clásico (SVG, instantáneo, sin coste); editar texto por página | — | `Book` |
| 4 | **Elegir edición** | Clásico PDF (gratis con email) · Ilustrado PDF · Tapa dura | Clásico | pedido |
| 5 | **Pago** (solo ediciones de pago) | Stripe | — | pedido pagado |
| 6 | **Ilustración** (solo tras pago) | estilo (1 de N aprobados) → hoja de personaje → aprobar → páginas con progreso | — | `Book` ilustrado |
| 7 | **Entrega** | descarga PDF con sangrado / seguimiento envío | — | PDF / pedido POD |

Reglas:
- **Nada con coste antes del pago.** El preview es SVG. La ilustración es un servicio post-pago con una hoja de personaje aprobada como primer paso.
- Todo tiene default; se llega al preview escribiendo solo el nombre.
- El selector de estilo vive en el paso 6, no en el 2: en el preview Clásico no cambia nada y añade fricción.
- Fotos: fuera de v1. Si entra después, solo como foto→rasgos, sin persistencia.

---

## 7. Requisitos funcionales por módulo

### 7.1 Personaje
- RF-1 Avatar por rasgos discretos con catálogo cerrado (`traits.json`). Render SVG determinista en cliente.
- RF-2 (v2) Foto→rasgos: visión devuelve JSON de rasgos; sin embedding facial; foto no se persiste.
- RF-3 Acompañante: 1 por libro en v1 (mascota o abuelo/a), máx. 2 personajes por página.
- RF-4 Hoja de personaje ilustrada (turnaround + 6 expresiones), aprobada por el usuario antes de generar páginas. Solo post-pago.

### 7.2 Historia
- RF-5 Arcos por ocasión × franja de edad en JSON (12 dobles páginas: beat, texto, personajes, escena).
- RF-6 v1: interpolación de plantillas (nombre, acompañante, detalle). LLM para relleno: v2, con eval previa.
- RF-7 Edición de texto por página en preview (límite de caracteres por franja).
- RF-8 Moderación: innecesaria en v1 (listas cerradas + nombre). Vuelve si entra texto libre.

### 7.3 Ilustración (post-pago)
- RF-9 Adaptador con interfaz única `generateScene(sheet, styleAnchor, scenePrompt)`; implementación GPT-image; sustituible.
- RF-10 Cada página con ancla de estilo + hoja como referencias, máx. 3 referencias por llamada (acompañante con su propia hoja solo si entra en una 3.ª), rasgos redeclarados en el prompt.
- RF-11 2 candidatos por página, selección por puntuación automática contra la hoja (DINOv2 o CLIP sobre el recorte del personaje) **calibrada en la Fase 0 con humanos**: si la métrica no correlaciona con el juicio humano, se sustituye por aprobación manual del usuario página a página.
- RF-12 Modo Clásico: composición SVG (avatar + escena vectorial de la ocasión). Es el preview y un producto completo gratuito.
- RF-13 Reescalado: GPT-image entrega ~1.536 px de lado; una doble página 20×20 + sangrado a 300 dpi son ~4.866×2.433 px. Paso obligatorio de upscale ×3 (Real-ESRGAN en el Mac Mini o upscaler del proveedor). Cuenta en el coste.

### 7.4 Maquetación e impresión
- RF-14 Plantillas HTML/CSS: A4 apaisado (casero) y 20×20 cm (tapa dura), sangrado 3 mm, zona de texto fija, fuentes con licencia.
- RF-15 El texto nunca lo pinta el modelo de imagen.
- RF-16 Export PDF: print CSS en cliente (casero); Puppeteer en servidor para POD. Verificación de dimensiones por script.
- RF-17 Pedido POD vía API (decidir proveedor en T10 de Hermes), con fecha límite real de pedido para Navidad según plazo de envío a España.

### 7.5 Cuenta, pago, entrega
- RF-18 Sin registro. Borrador en `localStorage`; email solo para descargar el Clásico (lead magnet) o recuperar el borrador.
- RF-19 Pago con Stripe Checkout (v1: Payment Link manual vale).
- RF-20 Entrega: descarga PDF; seguimiento POD por email.

---

## 8. Arquitectura

- **Web**: Next.js (App Router) + Tailwind, Vercel. Journey como máquina de estados en cliente.
- **Datos (v1)**: sin base de datos. Borrador en `localStorage`. Emails a un proveedor de email (Resend/Buttondown). Supabase entra con los pedidos ilustrados (Fase 2).
- **Generación (Fase 2)**: rutas API en Next (`/api/sheet`, `/api/scene`) → adaptadores. Claves solo en entorno servidor. Upscale y Puppeteer en el Mac Mini como worker (cola en Supabase).
- **Assets**: style packs, traits, arcos y plantillas en `/assets`, producidos por la misión Hermes y versionados en el repo.
- **Pago**: Stripe. **POD**: API del proveedor elegido.

Contrato de datos:

```ts
Character { id, name, age, role: 'hero'|'companion', kind?: 'pet'|'grandparent', traits: Traits }
Traits { hair: {shape, color}, skin, eyes, glasses?: string, outfit: string }
Book { id, occasionId, ageBand: '2-4'|'5-8', hero, companion?, special?, title, pages: Page[12], edition: 'classic'|'illustrated'|'hardcover', status }
Page { n, text, scenePrompt, characters: id[], imageUrl?, candidates?: string[], score? }
```

---

## 9. Requisitos no funcionales

- **Consistencia**: umbral y métrica fijados en la Fase 0 con evidencia (12 escenas, 1 estilo, juicio humano sobre 3 evaluadores). Criterio de abandono: si <70 % de escenas son "claramente el mismo niño" para los evaluadores, el producto ilustrado no se lanza y se sigue solo con Clásico + tapa dura Clásica.
- **Privacidad de menores**: nombre, edad, rasgos, acompañante y detalle son datos personales del niño, no solo el avatar. Medidas: (a) quien compra declara ser padre/madre/tutor o contar con su autorización, con casilla obligatoria y texto legal; (b) consentimiento de marketing separado (LSSI) de la descarga; (c) proveedores de IA y email con DPA y cláusulas de transferencia (SCC/DPF) documentadas; (d) datos del niño se borran a los 30 días del pedido salvo que el usuario pida conservar el libro; (e) sin fotos en v1. Revisión por abogado antes de cobrar el primer euro.
- **Coste**: coste de generación por libro ilustrado (incl. hoja, candidatos y upscale) medido en Fase 0; precio fijado para que sea < 15 % del precio de venta. Tope duro de generaciones por libro.
- **Tiempo**: preview Clásico instantáneo; hoja < 60 s; libro ilustrado < 10 min con progreso visible y aviso por email al terminar.
- **Impresión**: PDF con sangrado, 300 dpi, sRGB, verificado por script.
- **Móvil**: journey usable al 100 % en móvil.

---

## 10. Modelo de negocio (hipótesis, sin validar)

| Producto | Precio (?) | Coste (?) |
|---|---|---|
| Clásico PDF | gratis con email | ~0 € |
| Ilustrado PDF | a fijar tras Fase 0 (ref. 14,90–19,90 €) | generación + upscale, medido en Fase 0 |
| Tapa dura ilustrada | a fijar tras T10 (ref. 34,90–44,90 €) | POD + envío a España (T10) + generación |
| Serie mensual (v2) | — | — |

Fiscal y legal (pendiente de confirmar con gestor/abogado): IVA del 4 % para libros, incluidos electrónicos; los bienes personalizados están excluidos del derecho de desistimiento (art. 103.c TRLGDCU) y hay que decirlo en condiciones; comprobar que el epígrafe IAE 899 cubre la venta de bienes o si hace falta alta adicional.

---

## 11. Métricas (objetivos iniciales marcados como hipótesis)

- Activación: % que llega al preview (?).
- Calidad: % hojas aprobadas al primer intento; % páginas regeneradas.
- Conversión: email → Clásico descargado; Clásico → Ilustrado; Ilustrado → tapa dura. Sin cifras objetivo hasta tener 100 descargas.
- Coste: € de generación por libro; € por libro vendido; CAC si hay anuncios.
- Distribución: emails por reel; descargas; emails → pedido.

---

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Inconsistencia visual | decide el producto | Fase 0 con evidencia antes de construir ilustración; criterio de abandono |
| Coste de generación antes del pago | alto | nada con coste antes del pago; preview SVG |
| Resolución insuficiente para imprimir | alto | upscale ×3 obligatorio, verificado por script |
| ToS de proveedores con menores | alto | avatar, no rostro; adaptador sustituible |
| Privacidad / consentimiento con regaladores | alto | declaración del comprador, borrado a 30 días, DPA, revisión legal |
| Calidad narrativa | medio | arcos escritos a mano, 1 ocasión cada vez |
| Navidad 2026 sin tráfico | alto | primera pieza en semana 2; reels desde semana 2; presupuesto de anuncios a decidir |
| POD lento/caro a España | medio | T10 compara 3; fecha límite real; PDF casero como producto completo |
| Polish infinito | alto | cada fase exige una pieza pública |

---

## 13. Fuera de alcance v1

Foto→rasgos · 6 estilos (v1: 1 ancla) · 9 ocasiones · texto libre · LLM para relleno · moderación · Supabase · app nativa · audio · ocasiones difíciles · otros idiomas · coautoría con ramas · suscripción.

---

## 14. Plan de build

**Fase 0 — Evidencia (semana 1, en paralelo con Fase 1)**
- Hermes T1 reducido: 1 ancla de estilo aprobada.
- 1 hoja de personaje genérico + 12 escenas de cumpleaños con GPT-image, 2 candidatos cada una, **a mano, con tope de 30 generaciones**.
- 3 personas puntúan "¿es el mismo niño?" en cada escena. Se calcula coste real por libro incluido upscale.
- Salida: go/no-go para el producto ilustrado y precio.

**Fase 1 — Journey Clásico y primera pieza (semanas 1–2)**
- Landing · Quién · Su mundo · Preview SVG · edición Clásico con email · PDF casero por print CSS.
- Arco de cumpleaños, 2 franjas, interpolación de plantillas.
- Las 12 escenas de la Fase 0 montadas en la plantilla = **primera pieza**: PDF descargable + reel impreso en casa.
- Pedidos ilustrados iniciales a mano (formulario + Stripe Payment Link) mientras no hay pipeline.

**Fase 2 — Ilustración automatizada (semanas 3–4, solo si Fase 0 es go)**
- Hoja por usuario, escenas con selección, upscale, Stripe Checkout, PDF ilustrado.

**Fase 3 — Tapa dura (semanas 5–6)**
- Puppeteer, POD, seguimiento, fecha límite Navidad publicada.

Regla: ninguna fase empieza sin una pieza pública de la anterior.

---

## 15. Decisiones pendientes

1. Nombre de marca y dominio.
2. Presupuesto de anuncios para Navidad (si los reels no arrancan en 2 semanas).
3. Proveedor POD y fecha límite real de pedido (T10).
4. Precios (tras Fase 0 y T10).
5. Revisión legal: consentimiento, condiciones, desistimiento, IVA, IAE.
6. Proveedor de email para el lead magnet.

---

## 16. Cambios v0.1 → v0.2 (tras revisión independiente)

- Coste de ilustración movido detrás del pago; el preview pasa a SVG (modo Clásico).
- Nueva Fase 0: validar consistencia y coste con 12 escenas reales antes de construir el pipeline. Criterio de abandono explícito.
- Upscale ×3 añadido como paso obligatorio y coste.
- Privacidad reescrita: datos del niño ≠ avatar; declaración del comprador; borrado a 30 días; DPA/SCC; consentimiento de marketing separado; revisión legal antes de cobrar.
- Primera pieza coherente con el plan: PDF casero impreso en casa, 1 ancla aprobada, semana 2.
- Alcance v1 recortado: 1 ocasión, 1 estilo, 1 acompañante de lista cerrada, sin texto libre, sin LLM, sin base de datos.
- Selector de estilo movido del paso 2 al paso post-pago.
- Números de §10 y §11 marcados como hipótesis; añadidos IVA, desistimiento e IAE a decisiones pendientes.
- Carga de escritura de arcos hecha explícita (24 dobles páginas por ocasión).
