import "server-only";
import { supabaseAdmin } from "../supabase/server";
import { getAdapter, type GenerationAdapter } from "./adapter";
import { memoryStore, supabaseStore, type GenStore } from "./store";
import { dryRunPaymentAllowed } from "../stripe";

/**
 * Almacén y adaptador para /api/generate/*. Con service role: Supabase. Sin él, solo con dry-run: memoria del proceso
 * (desarrollo, tests y preview sin Supabase). Con un proveedor de pago y sin Supabase no hay almacén (503): no se
 * gasta sin poder guardar la imagen ni registrar el gasto.
 */
export function generationContext(): { store: GenStore; adapter: GenerationAdapter } | { error: string } {
  let adapter: GenerationAdapter;
  try {
    adapter = getAdapter();
  } catch {
    return { error: "provider" };
  }
  const db = supabaseAdmin();
  if (db) return { store: supabaseStore(db), adapter };
  if (adapter.name === "dry-run") return { store: memoryStore(), adapter };
  return { error: "storage_unavailable" };
}

/** Pago de prueba: con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 y nunca en producción (VERCEL_ENV). */
export const DRY_RUN_PAYMENT_SERVER = () => dryRunPaymentAllowed();
