import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  return (
    <LegalPage title="Aviso legal" updated="9 de octubre de 2026">
      <h2>1. Titular (art. 10 LSSI)</h2>
      <ul>
        <li>Titular: <Pending>nombre y apellidos o razón social</Pending></li>
        <li>NIF: <Pending>NIF</Pending></li>
        <li>Domicilio: <Pending>dirección</Pending></li>
        <li>Email: <Pending>email de contacto</Pending></li>
        <li>Actividad: venta de libros personalizados. Epígrafe IAE <Pending>confirmar si el 899 cubre la venta de bienes</Pending></li>
      </ul>

      <h2>2. Uso de la web</h2>
      <p>La web permite crear cuentos personalizados y descargarlos o comprarlos. Quien la usa se compromete a no introducir datos de terceros sin autorización.</p>

      <h2>3. Propiedad intelectual</h2>
      <p>
        Los textos de los cuentos, las ilustraciones, los estilos y el diseño de la web son de <Pending>titular</Pending>. El cuento descargado o
        comprado es para uso personal y familiar; no se permite su venta ni su distribución comercial.
      </p>

      <h2>4. Responsabilidad</h2>
      <p>Trabajamos para que la web funcione sin interrupciones, pero no podemos garantizarlo en todo momento.</p>

      <p className="text-sm text-ink-soft">
        Ver también la <Link href="/privacidad" className="link">política de privacidad</Link> y las <Link href="/condiciones" className="link">condiciones</Link>.
      </p>
    </LegalPage>
  );
}
