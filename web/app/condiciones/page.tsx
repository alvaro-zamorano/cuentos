import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Condiciones" };

export default function Condiciones() {
  return (
    <LegalPage title="Condiciones de uso y de compra" updated="14 de octubre de 2026">
      <h2>1. Quién vende</h2>
      <p>
        <Pending>nombre o razón social</Pending>, NIF <Pending>NIF</Pending>, <Pending>dirección</Pending>, <Pending>email de contacto</Pending>. Datos completos en el{" "}
        <Link href="/aviso-legal" className="link">aviso legal</Link>.
      </p>

      <h2>2. Qué ofrecemos</h2>
      <ul>
        <li>
          <strong>Gratis</strong>: el cuento escrito, la hoja de personajes y la portada ilustrada, y un PDF para imprimir en casa con la portada y
          el texto. La hoja y la portada se pintan cuando nos das tu email.
        </li>
        <li>
          <strong>Libro ilustrado</strong>: las doce páginas ilustradas en un PDF A4. De pago; el precio final, con IVA, se indica antes de pagar.
        </li>
        <li><strong>Tapa dura</strong>: más adelante.</li>
      </ul>

      <h2>3. Cómo se hace el libro</h2>
      <ol className="list-decimal pl-5">
        <li>Cuentas la idea y cómo es el niño o la niña.</li>
        <li>Escribimos el cuento con IA. Puedes cambiar cualquier texto o pedir que se reescriba una página con una frase.</li>
        <li>Con tu email pintamos la hoja de personajes y la portada. Puedes pedir hasta dos cambios con palabras.</li>
        <li>Al pagar se pintan las doce páginas. Puedes pedir una versión más de cada página.</li>
        <li>Descargas el PDF.</li>
      </ol>

      <h2>4. Contenido hecho con IA</h2>
      <p>
        El cuento y las ilustraciones los generan modelos de inteligencia artificial y tú los revisas antes de pagar. Pueden salir detalles que no
        esperabas o pequeñas diferencias entre ilustraciones. Por eso puedes ver el cuento entero, la hoja y la portada antes de pagar, y pedir otra
        versión de cada página después.
      </p>

      <h2>5. Declaración de quien compra</h2>
      <p>
        Antes de pintar la hoja de personajes marcas una casilla obligatoria: «Declaro ser madre, padre o tutor legal del menor, o contar con su
        autorización». La autorización cubre el uso de su nombre y sus rasgos para crear el cuento.
      </p>

      <h2>6. Precio e impuestos</h2>
      <p>
        Los precios incluyen IVA. A los libros, también en formato electrónico, se les aplica el tipo superreducido del 4 %{" "}
        <Pending>confirmar con gestoría</Pending>. Los gastos de envío de la tapa dura se indicarán antes del pago.
      </p>

      <h2>7. Sin derecho de desistimiento</h2>
      <p>
        Los cuentos se confeccionan según las especificaciones de quien los encarga y están claramente personalizados. Por eso, de acuerdo con el{" "}
        <strong>art. 103.c) del Texto Refundido de la Ley General para la Defensa de los Consumidores y Usuarios</strong> (TRLGDCU), no se aplica
        el derecho de desistimiento. Lo aceptas expresamente antes de pagar <Pending>falta esa casilla en el paso del pago; necesaria antes de
        cobrar</Pending>. Esto no afecta a tus derechos si el producto llega defectuoso o
        no corresponde con lo pedido.
      </p>

      <h2>8. Garantía y reclamaciones</h2>
      <p>
        Si el PDF no se puede abrir, le falta alguna página o la tapa dura llega dañada, escríbenos a <Pending>email de contacto</Pending> en un
        plazo de <Pending>plazo</Pending> y lo reponemos. Hojas de reclamación disponibles a petición.
      </p>

      <h2>9. Guarda tu PDF</h2>
      <p>
        El libro se borra a los 30 días de empezarlo, también si lo has comprado. Descarga el PDF antes. Detalle en la{" "}
        <Link href="/privacidad" className="link">política de privacidad</Link>.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>Ley española. Para consumidores, los juzgados de su domicilio.</p>
    </LegalPage>
  );
}
