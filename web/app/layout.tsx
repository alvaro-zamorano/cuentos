import type { Metadata } from "next";
import { Figtree, Lora, Patrick_Hand } from "next/font/google";
import { CookieConsent } from "@/components/CookieConsent";
import { Footer } from "@/components/Footer";
import "./globals.css";

/** Estilo «La hora del cuento» (docs/ESTILO.md): Lora en titulares y cuento, Figtree en la interfaz, Patrick Hand en las notas a mano. */
const serif = Lora({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const hand = Patrick_Hand({ subsets: ["latin"], weight: "400", variable: "--font-hand-ui", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Cuento personalizado para niños · regalo de cumpleaños",
    template: "%s · cuentos",
  },
  description:
    "Un cuento personalizado con tu hijo o tu hija como protagonista: su nombre, cómo es y quién le acompaña. Un regalo para leer juntos e imprimir en casa.",
};

/** Microsoft Clarity: solo si NEXT_PUBLIC_CLARITY_ID existe en el entorno del build (nunca en el repo) y tras consentimiento (CookieConsent). */
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
const CLARITY_ID_OK = !!CLARITY_ID && /^[a-z0-9]{6,20}$/i.test(CLARITY_ID);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${serif.variable} ${ui.variable} ${hand.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <CookieConsent clarityId={CLARITY_ID_OK ? CLARITY_ID! : null} />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
