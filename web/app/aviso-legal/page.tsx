import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/LegalPage";
import { BRAND, titular } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso legal", alternates: { canonical: "/aviso-legal" } };

export default function AvisoLegal() {
  const t = titular();
  return (
    <LegalPage title="Aviso legal" updated="20 de octubre de 2026">
      <h2>1. Titular (art. 10 LSSI)</h2>
      <ul>
        <li>Titular: {t.name ?? BRAND}</li>
        {t.nif && <li>NIF: {t.nif}</li>}
        {t.address && <li>Domicilio: {t.address}</li>}
        <li>Email: <ContactEmail value={t.email} /></li>
        <li>Actividad: venta de libros personalizados.</li>
      </ul>

      <h2>2. Uso de la web</h2>
      <p>
        La web permite crear cuentos personalizados, escritos e ilustrados con inteligencia artificial, y descargarlos o comprarlos. Está pensada para
        personas adultas (madres, padres y familiares) que crean un cuento para un niño o una niña, y no está dirigida a menores. Quien la usa se
        compromete a no introducir datos de terceros sin autorización.
      </p>

      <h2>3. Propiedad intelectual</h2>
      <p>
        El diseño de la web, su marca, sus textos y el libro de muestra son de {t.name ?? BRAND}. El libro que creas es para uso personal
        y familiar; no se permite su venta ni su distribución comercial.
      </p>

      <h2>4. Responsabilidad</h2>
      <p>Trabajamos para que la web funcione sin interrupciones, pero no podemos garantizarlo en todo momento.</p>

      <p className="text-sm text-ink-soft">
        Ver también la <Link href="/privacidad" className="link">política de privacidad</Link> y las <Link href="/condiciones" className="link">condiciones</Link>.
      </p>
    </LegalPage>
  );
}
