# Proveedores: contratos, transferencias y datos

Verificado el 16 oct 2026 en las páginas oficiales de cada proveedor (Gelato, el 18 oct; PostHog, el 21 oct). Respalda la sección 7 de `/privacidad`. El estado del Marco de Privacidad de Datos UE-EE. UU. (DPF) se comprobó en dataprivacyframework.gov. No es asesoramiento legal: lo revisa quien revise los legales.

| Proveedor | Contrato de encargo (DPA) | Transferencia | Papel | Notas |
|---|---|---|---|---|
| Vercel | Incluido en sus Términos (§10.1); no se firma aparte | DPF (Vercel Inc. activo) y cláusulas tipo de 2021 | Encargado | Funciones en dub1 (Dublín) desde el 18 oct. Se puede fijar fra1, cdg1, dub1 o arn1 en cualquier plan (Hobby, una región). **Hobby no permite uso comercial** |
| Supabase | Forma parte de sus Términos; aceptarlos equivale a firmar las cláusulas tipo | Cláusulas tipo (importador: Supabase Pte. Ltd., Singapur). No está en el DPF | Encargado | La región se elige al crear el proyecto y no se cambia. UE: Fráncfort, Irlanda, París, Estocolmo. **Proyecto en eu-west-1 (Irlanda), comprobado el 18 oct** |
| Anthropic (API) | Incluido en las Commercial Terms | Cláusulas tipo. No está en el DPF | Encargado; en el EEE contrata Anthropic Ireland, Limited | No entrena con los datos. Borra entradas y salidas en 30 días (hasta 2 años si detecta un incumplimiento) |
| Google (API de Gemini, de pago) | «Data Processing Addendum for Products Where Google is a Data Processor», que incluye Gemini API Paid Services | DPF (Google LLC activo) y cláusulas tipo | Encargado; con facturación en la EMEA contrata Google Cloud EMEA Limited | De pago: no mejora sus productos con los datos y los guarda 55 días para detectar abusos. Gratuito: sí los usa para entrenar. En el EEE solo se puede ofrecer el de pago. **Sus términos prohíben usarla en servicios dirigidos a menores de 18 años o a los que probablemente accedan** |
| Resend | Prefirmado al crear la cuenta; copia en Settings → Documents | DPF (activo, recertificación en revisión) y cláusulas tipo | Encargado (envía y, desde el 18 oct, recibe el correo de `@erasesuvez.com`) | Guarda los datos en EE. UU. Los correos recibidos se quedan en su panel; su documentación no dice cuánto tiempo |
| Gelato (B8, 18 oct) | «Data Processing Terms» (actualizados el 29 nov 2024), que forman parte del contrato | Gelato es noruega (EEE). Sus subencargados fuera del EEE, con DPF o cláusulas tipo | Encargado (imprime y envía el libro de tapa dura) | Las imprentas de su red son subencargados; los transportistas, responsables independientes. Contrata Gelato ASA (Dronning Eufemias Gate 8, Oslo), según sus términos de la API (consultados el 20 oct); comprobarlo en la cuenta |
| Stripe | Incluido en el Services Agreement, con el Data Transfers Addendum | DPF (Stripe, LLC activo) y cláusulas tipo | Encargado del cobro; responsable independiente para fraude, blanqueo y cumplimiento legal | En España contrata Stripe Payments Europe, Limited |
| PostHog (21 oct) | Se genera y se firma desde la cuenta (página Legal, PandaDoc), también en el plan gratuito; no va incluido en las condiciones | DPF (según su DPA) y cláusulas tipo (módulo 2) | Encargado (PostHog, Inc., San Francisco) | EU Cloud en AWS eu-central-1 (Fráncfort). Solo tras consentimiento, sin grabaciones de sesión. Retención de eventos: 1 año en el plan gratuito, 7 en los de pago (no se puede acortar) |
| ~~Microsoft Clarity~~ | Quitado el 21 oct (Álvaro): solo PostHog | | | Era responsable independiente y podía usar los datos para sus fines |

## Lo que tiene que hacer el titular

1. ~~**Supabase:** región~~ eu-west-1 (Irlanda), comprobado el 18 oct.
2. **Vercel:** funciones en Dublín (hecho, 18 oct). Plan Pro antes de abrir al público (Hobby no permite uso comercial).
3. **Gemini:** clave de un proyecto de Google Cloud con facturación activa; registro de AI Studio apagado; decidir sobre la cláusula de menores.
4. **PostHog:** firmar el DPA desde la cuenta. ~~Clarity~~ quitado el 21 oct.
5. **Resend:** descargar el DPA firmado (Settings → Documents).
6. **Gelato:** la entidad es Gelato ASA según sus términos de la API (ya en `/privacidad` §7, 20 oct). Falta comprobarlo en la cuenta y descargar sus Data Processing Terms.
7. Guardar un PDF con fecha de cada DPA.

## Fuentes

- Vercel: vercel.com/legal/dpa · vercel.com/legal/terms · vercel.com/docs/functions/configuring-functions/region
- Supabase: supabase.com/legal/dpa · supabase.com/docs/guides/platform/regions · supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z
- Anthropic: anthropic.com/legal/data-processing-addendum · anthropic.com/legal/commercial-terms · privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Google: ai.google.dev/gemini-api/terms (actualizados el 28 abr 2026) · business.safety.google/processorterms · cloud.google.com/terms/google-entity
- Resend: resend.com/legal/dpa · resend.com/docs/knowledge-base/downloading-documents
- Stripe: stripe.com/legal/dpa · stripe.com/es/legal/ssa · stripe.com/privacy
- PostHog: posthog.com/dpa · posthog.com/blog/posthog-cloud-eu · posthog.com/docs/data/events-retention
- Gelato: gelato.com/legal/data-processing-terms · gelato.com/legal/api-terms
- Lista DPF: dataprivacyframework.gov/list
