/**
 * Borrar a quien lo pide por su email (derecho de supresión; menores de la auditoría 26 oct). Lo lanza Álvaro en local,
 * con las claves de Supabase en .env.local. Qué borra y qué se queda: lib/forget.ts.
 *
 * Uso (en web/):
 *   node --import tsx scripts/borrar-email.mts ana@example.com                → solo cuenta lo que borraría
 *   node --import tsx scripts/borrar-email.mts ana@example.com --de-verdad    → lo borra
 *   … --aunque-no-se-haya-impreso   también una tapa dura pagada que aún no ha ido a la imprenta (hablarlo antes)
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";
import { forgetEmail, supabaseForgetDb } from "../lib/forget";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
if (!email) {
  console.error("Falta el email: node --import tsx scripts/borrar-email.mts ana@example.com [--de-verdad]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const dryRun = !args.includes("--de-verdad");
const report = await forgetEmail(supabaseForgetDb(db), email, { dryRun, evenIfNotPrinted: args.includes("--aunque-no-se-haya-impreso") });
console.log(JSON.stringify(report, null, 2));
if (report.skippedPrint.length) console.log(`Tapas duras pagadas sin imprimir que no se han tocado: ${report.skippedPrint.join(", ")}.`);
console.log(dryRun ? "Solo contado. Para borrarlo, repite con --de-verdad." : "Hecho. Los pedidos pagados se quedan (email, importe y fecha) por la normativa fiscal.");
