import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Dato, LegalPage, Pending } from "@/components/LegalPage";
import { titular } from "@/lib/legal";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  const t = titular();
  return (
    <LegalPage title="Aviso legal" updated="16 de octubre de 2026">
      <h2>1. Titular (art. 10 LSSI)</h2>
      <ul>
        <li>Titular: <Dato value={t.name}>nombre y apellidos o razón social</Dato></li>
        <li>NIF: <Dato value={t.nif}>NIF</Dato></li>
        <li>Domicilio: <Dato value={t.address}>dirección</Dato></li>
        <li>Email: <ContactEmail value={t.email} /></li>
        <li>Actividad: venta de libros personalizados. Epígrafe IAE <Pending>confirmar si el 899 cubre la venta de bienes</Pending></li>
      </ul>

      <h2>2. Uso de la web</h2>
      <p>
        La web permite crear cuentos personalizados, escritos e ilustrados con inteligencia artificial, y descargarlos o comprarlos. Quien la usa
        se compromete a no introducir datos de terceros sin autorización.
      </p>

      <h2>3. Propiedad intelectual</h2>
      <p>
        El diseño de la web, su marca, sus textos y el libro de muestra son de <Dato value={t.name}>titular</Dato>. El libro que creas es para uso personal
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
