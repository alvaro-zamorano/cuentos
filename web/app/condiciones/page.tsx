import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Condiciones" };

export default function Condiciones() {
  return (
    <LegalPage title="Condiciones de uso y de compra" updated="9 de octubre de 2026">
      <h2>1. Quién vende</h2>
      <p>
        <Pending>nombre o razón social</Pending>, NIF <Pending>NIF</Pending>, <Pending>dirección</Pending>, <Pending>email de contacto</Pending>. Datos completos en el{" "}
        <Link href="/aviso-legal" className="link">aviso legal</Link>.
      </p>

      <h2>2. Qué ofrecemos</h2>
      <ul>
        <li><strong>Clásico · PDF</strong>: gratuito a cambio de un email. Se imprime desde el navegador.</li>
        <li><strong>Ilustrado · PDF</strong> y <strong>Tapa dura</strong>: de pago, cuando estén disponibles. Precio final con IVA indicado antes de pagar.</li>
      </ul>

      <h2>3. Declaración de quien compra</h2>
      <p>
        Antes de descargar o pagar, marcas una casilla obligatoria: «Declaro ser madre, padre o tutor legal del menor, o contar con su
        autorización». La autorización cubre el uso de su nombre y sus rasgos para crear el cuento.
      </p>

      <h2>4. Precio e impuestos</h2>
      <p>
        Los precios incluyen IVA. A los libros, también en formato electrónico, se les aplica el tipo superreducido del 4 %{" "}
        <Pending>confirmar con gestoría</Pending>. Los gastos de envío de la tapa dura se indican antes del pago.
      </p>

      <h2>5. Proceso de la edición ilustrada</h2>
      <p>
        Tras el pago eliges el estilo, apruebas una hoja de personaje y después se ilustran las doce páginas. Puedes pedir otra versión de una
        página dentro de los límites indicados en pantalla.
      </p>

      <h2>6. Sin derecho de desistimiento</h2>
      <p>
        Los cuentos se confeccionan según las especificaciones de quien los encarga y están claramente personalizados. Por eso, de acuerdo con el{" "}
        <strong>art. 103.c) del Texto Refundido de la Ley General para la Defensa de los Consumidores y Usuarios</strong> (TRLGDCU), no se aplica
        el derecho de desistimiento. Lo aceptas expresamente antes de pagar. Esto no afecta a tus derechos si el producto llega defectuoso o
        no corresponde con lo pedido.
      </p>

      <h2>7. Garantía y reclamaciones</h2>
      <p>
        Si el PDF no se puede abrir o la tapa dura llega dañada, escríbenos a <Pending>email de contacto</Pending> en un plazo de <Pending>plazo</Pending>
        y lo reponemos. Hojas de reclamación disponibles a petición.
      </p>

      <h2>8. Datos personales</h2>
      <p>
        Los datos del cuento se borran a los 30 días salvo que pidas conservarlo. Detalle en la{" "}
        <Link href="/privacidad" className="link">política de privacidad</Link>.
      </p>

      <h2>9. Ley aplicable</h2>
      <p>Ley española. Para consumidores, los juzgados de su domicilio.</p>
    </LegalPage>
  );
}
