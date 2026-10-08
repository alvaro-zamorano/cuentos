import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Un cuento que no existía hasta hoy",
  description:
    "Crea en tres pantallas un cuento personalizado con tu hijo como protagonista, para una ocasión feliz, y imprímelo en casa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
