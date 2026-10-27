import type { Metadata } from "next";
import Link from "next/link";
import { Sparkle } from "@/components/brand";
import { SiteHeader } from "@/components/SiteHeader";
import { appOpen } from "@/lib/appOpen";

export const metadata: Metadata = { title: "Esta página no existe", robots: { index: false } };

/**
 * 404 en castellano (auditoría 26 oct, mirada de usuario). Antes salía «404: This page could not be found.» sobre blanco
 * y quien abría un enlace mal copiado pensaba que la web era falsa.
 */
export default function NotFound() {
  const open = appOpen();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-xl flex-1 content-center gap-5 px-4 py-16 text-center sm:px-6" data-testid="not-found">
        <Sparkle className="mx-auto" size={22} color="var(--accent)" />
        <h1 className="display text-[36px] leading-tight sm:text-[44px]">Esta página no existe</h1>
        <p className="text-[17px] text-ink-soft">
          Igual el enlace está incompleto. Si te lo han mandado por email o por mensaje, prueba a copiarlo entero. Si era el enlace de tu libro, búscalo en el
          email que te mandamos.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-ghost">
            Ir al inicio
          </Link>
          <Link href={open ? "/crear" : "/#pronto"} className="btn-primary">
            {open ? "Crear su cuento" : "Ver cómo funciona"}
          </Link>
        </div>
      </main>
    </>
  );
}
