import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, Geist } from "next/font/google";
import { Footer } from "@/components/Footer";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Cuento personalizado para niños · regalo de cumpleaños",
    template: "%s · cuentos",
  },
  description:
    "Un cuento personalizado con tu hijo o tu hija como protagonista: su nombre, cómo es y quién le acompaña. Un regalo de cumpleaños para imprimir en casa o recibir en tapa dura.",
};

/** Microsoft Clarity: solo si NEXT_PUBLIC_CLARITY_ID existe en el entorno del build (nunca en el repo). */
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;
const CLARITY_ID_OK = !!CLARITY_ID && /^[a-z0-9]{6,20}$/i.test(CLARITY_ID);

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${serif.variable} ${ui.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
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
