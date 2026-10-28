import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { BajaForm } from "./BajaForm";

export const metadata: Metadata = { title: "Darte de baja de las novedades", robots: { index: false } };

/**
 * /baja?t=… — la baja de las novedades por email (menores de la auditoría 26 oct). La página no da de baja al abrirse
 * (los antivirus abren los enlaces de los correos): hace falta pulsar el botón.
 */
export default function BajaPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-xl flex-1 content-center gap-5 px-4 py-16 sm:px-6" data-testid="baja">
        <h1 className="display text-[34px] leading-tight sm:text-[42px]">Novedades por email</h1>
        <Suspense fallback={null}>
          <BajaForm />
        </Suspense>
      </main>
    </>
  );
}
