import type { Metadata } from "next";
import Script from "next/script";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Un cuento que no existía hasta hoy",
  description:
    "Crea en tres pantallas un cuento personalizado con tu hijo como protagonista, para una ocasión feliz, y imprímelo en casa.",
};

/** Microsoft Clarity: solo si NEXT_PUBLIC_CLARITY_ID existe en el entorno del build (nunca en el repo). */
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
const CLARITY_ID_OK = !!CLARITY_ID && /^[a-z0-9]{6,20}$/i.test(CLARITY_ID);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
        {CLARITY_ID_OK && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`}
          </Script>
        )}
      </body>
    </html>
  );
}
