import type { Metadata } from "next";
import { Figtree, Lora, Patrick_Hand } from "next/font/google";
import { CookieConsent } from "@/components/CookieConsent";
import { Footer } from "@/components/Footer";
import { POSTHOG_ENABLED } from "@/lib/analytics";
import { siteUrl } from "@/lib/site";
import "./globals.css";

/** Estilo «La hora del cuento» (docs/ESTILO.md): Lora en titulares y cuento, Figtree en la interfaz, Patrick Hand en las notas a mano. */
const serif = Lora({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const hand = Patrick_Hand({ subsets: ["latin"], weight: "400", variable: "--font-hand-ui", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Cuento personalizado para niños · Érase su vez",
    template: "%s · Érase su vez",
  },
  applicationName: "Érase su vez",
  // con SITE_URL (dominio de la marca) las URL de las imágenes para compartir salen absolutas
  metadataBase: siteUrl() ? new URL(siteUrl()!) : undefined,
  openGraph: { siteName: "Érase su vez", locale: "es_ES", type: "website" },
  description:
    "Un cuento personalizado con tu hijo o tu hija como protagonista: su nombre, cómo es y quién le acompaña. Un regalo para leer juntos e imprimir en casa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${serif.variable} ${ui.variable} ${hand.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* medición con PostHog solo tras consentimiento (lib/analytics.ts) */}
        <CookieConsent enabled={POSTHOG_ENABLED} />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
