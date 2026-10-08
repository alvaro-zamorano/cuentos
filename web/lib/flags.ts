/** Pago simulado para recorrer la edición ilustrada sin Stripe. Se fija en el build (NEXT_PUBLIC_*). */
export const DRY_RUN_PAYMENT = process.env.NEXT_PUBLIC_DRY_RUN_PAYMENT === "1";
