# cuentos — instrucciones para Claude

Libros infantiles personalizados, escritos e ilustrados con IA. App Next.js 16 en `web/`, Supabase y Vercel.

## Al empezar

1. Lee `docs/INDICE.md` (mapa, accesos, cómo probar, trampas) y `docs/ESTADO.md` (foco, decisiones, próxima sesión).
2. Lee el resto solo si la tarea lo pide (`docs/PLAN.md`, `docs/PAGO.md`, `docs/ILUSTRACION.md`, `docs/PLANIFICADOR.md`).

## Reglas duras

- Castellano, directo y conciso.
- **Claves:** nunca pedirlas por el chat, ni leerlas, imprimirlas o commitearlas. Las pone Álvaro en Vercel o en `.env.local`.
- **Git:** rama `feat/fase-1-journey-clasico` + PR #1. Nada directo a `main` ni `--force`.
- No decir que algo funciona sin haberlo comprobado:
  - Código: `npx tsc --noEmit`, `npx eslint`, `npm run test:unit`, build y Playwright (comandos en `docs/INDICE.md` §6).
  - Lo visual: mirarlo en una captura.
- **Generaciones de pago** (Gemini, Claude): pocas tomas y apuntar el coste. `/api/dev` cuesta dinero.
- Nada sensible, destructivo o externo (producción, borrar datos, variables de Vercel) sin el visto bueno de Álvaro.

## Al terminar

- Apuntar en `docs/ESTADO.md`: decisiones (§2, append-only), hallazgos, preguntas y «Próxima sesión».
- Actualizar `docs/INDICE.md` si entran o cambian documentos.
- Subir las copias al Project «Cuentos niños» (`claude/00-INDICE.md`, `claude/00-ESTADO.md` y los documentos que hayan cambiado).
