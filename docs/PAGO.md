# Pago, emails y segundo plano (B5) — 13 oct 2026

Código: `web/lib/stripe.ts`, `web/lib/mail.ts`, `web/lib/book/background.ts`, `web/lib/book/service.ts` (`recordStripePayment`, `checkoutInfo`, `notifyBookReady`, `pendingPageJobs`), rutas `/api/libro/checkout`, `/api/stripe/webhook` y `after()` en `/api/libro/{start,sheet,pages}`. Tests: `web/tests/unit/b5.test.ts` (8) y las comprobaciones de checkout y webhook en `tests/crear.spec.ts`.

## Cómo funciona

1. **Paso 4 (email).** `/api/libro/start` guarda el libro y responde. Después, con `after()`, el servidor pinta la hoja y la portada y, si el libro es nuevo, manda por Resend el enlace para volver (`/crear?b=…`). El enlace también se ve en pantalla en los pasos 4 y 5, haya email o no.
2. **Pago.** El botón del paso 5 llama a `/api/libro/checkout`, que crea una sesión de Stripe Checkout (14,90 €, `metadata.bookId`) y manda al padre a Stripe. Al pagar, Stripe le devuelve a `/crear?b=…&pagado=1` y la página enseña «Confirmando el pago…» hasta que llega el webhook.
3. **Webhook.** `/api/stripe/webhook` comprueba la firma (`STRIPE_WEBHOOK_SECRET`, 5 min de tolerancia) y registra el pedido de `checkout.session.completed` o `checkout.session.async_payment_succeeded` una sola vez: si Stripe reintenta, no se duplica. Después de responder a Stripe, encola las 12 páginas, las pinta y, al terminar, manda «tu libro está listo» (una vez).
4. **Navegador abierto.** Si el padre sigue en la página, su navegador tira de los mismos jobs. El bloqueo optimista de `runJob` evita pintar dos veces, y el navegador espera hasta 6 minutos a los que está pintando el servidor.
5. **Modo de pago** (`/api/libro/view` → `payment`, y `/api/health`):
   - `stripe` si están `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`;
   - si no, `dry-run` con `NEXT_PUBLIC_DRY_RUN_PAYMENT=1`, **nunca en producción**;
   - si no, «muy pronto».
6. **Límite.** El segundo plano para a los ≈ 225 s para no dejar jobs a medias cuando Vercel corta a los 300 s. Lo que falte se pinta cuando el padre vuelve con su enlace, y en ese caso el email de «listo» no sale (E13).

## Comprobado

| Prueba | Resultado |
|---|---|
| Unitarios (sin red) | Firma buena, otro secreto, payload tocado, más de 5 min, cabecera rota y sin secreto. Cuerpo del checkout. Modo de pago (también en producción). Hoja y portada en segundo plano. Pedido registrado una vez. 12 páginas y email de «listo» una sola vez. Un email que falla no se da por enviado |
| Local con claves falsas de Stripe | Firma mala → 400. Firma buena → 200 y libro pagado. Repetido → 200 sin duplicar. 12 páginas pintadas sin que nadie pidiera nada. Checkout con clave falsa → Stripe responde 401 → 502 `stripe` |
| Interfaz en local (modo Stripe) | Botón «Pagar 14,90 €». Vuelta con `?pagado=1` → «Confirmando el pago…» → webhook → libro completo y botón del PDF, sin errores en la página |
| Preview en Vercel (Supabase, imágenes sin coste) | `start` → hoja y portada hechas por el servidor en unos segundos. Pago de prueba + `pages` → 12 páginas hechas sin cliente. Checkout sin claves → 501 |

## Lo que tiene que hacer Álvaro

Ninguna clave por el chat. En Vercel, proyecto `cuentos` → Settings → Environment Variables, en **Preview** para probar y en **Production** cuando toque. Las variables nuevas solo entran en un despliegue nuevo: Deployments → Redeploy, o un push.

**Stripe (modo test primero)**

1. Crear la cuenta en dashboard.stripe.com y dejar activado el modo de prueba.
2. Developers → API keys → la «Secret key» (`sk_test_…`) → `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint:
   - URL: `https://cuentos-git-feat-fase-1-journey-clasico-wcoach24s-projects.vercel.app/api/stripe/webhook`. Es el alias fijo de la rama; la protección de despliegues está desactivada en el proyecto, así que Stripe puede llegar.
   - Eventos: `checkout.session.completed` y `checkout.session.async_payment_succeeded`.
4. En ese endpoint, el «Signing secret» (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
5. Para producción: lo mismo con las claves «live» y el endpoint en el dominio definitivo.

**Resend**

1. Crear la cuenta y verificar el dominio de envío (registros DNS que indica Resend).
2. API Keys → crear una con permiso de envío → `RESEND_API_KEY`.
3. `MAIL_FROM` con ese dominio, por ejemplo `Cuentos <hola@tudominio.es>`.

**Otras**

- `SITE_URL` en producción (`https://tudominio.es`, sin barra final) para los enlaces de los emails y la vuelta de Stripe. En la preview no hace falta.

**Comprobar** (Claude puede hacerlo en cuanto estén):

1. `/api/health` → `payment.mode: "stripe"` y `mail.enabled: true`.
2. Hacer un libro en la preview con un email propio → llega el email con el enlace.
3. Pagar con la tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.
4. Vuelve a `/crear`, se pintan las 12 páginas y llega «tu libro está listo».
5. Mirar en Stripe → Webhooks que el evento salió con 200.
