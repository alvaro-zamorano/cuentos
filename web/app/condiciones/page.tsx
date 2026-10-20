import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, Dato, LegalPage } from "@/components/LegalPage";
import { titular } from "@/lib/legal";

export const metadata: Metadata = { title: "Condiciones" };

export default function Condiciones() {
  const t = titular();
  return (
    <LegalPage title="Condiciones de uso y de compra" updated="18 de octubre de 2026">
      <h2>1. Quién vende</h2>
      <p>
        <Dato value={t.name}>nombre o razón social</Dato>, NIF <Dato value={t.nif}>NIF</Dato>, <Dato value={t.address}>dirección</Dato>, <ContactEmail value={t.email} />. Datos completos en el{" "}
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
        <li>Al pagar se pintan las doce páginas. Si una ilustración no te convence, nos dices qué cambiar y pintamos otra: hasta dos versiones más por página. Si aun así no queda bien, nos avisas desde esa página y la arreglamos nosotros.</li>
        <li>Descargas el PDF.</li>
        <li>
          Si has comprado el libro de tapa dura, lo revisas y pulsas «Mandar a imprimir». No lo imprimimos hasta entonces, y después ya no se
          puede cambiar.
        </li>
      </ol>

      <h2>4. Contenido hecho con IA</h2>
      <p>
        El cuento y las ilustraciones los generan modelos de inteligencia artificial y tú los revisas antes de pagar. Pueden salir detalles que no
        esperabas o pequeñas diferencias entre ilustraciones. Por eso puedes ver el cuento entero, la hoja y la portada antes de pagar, y pedir otras
        versiones de cada página después.
      </p>

      <h2>5. Declaración de quien compra</h2>
      <p>
        Antes de pintar la hoja de personajes marcas una casilla obligatoria: «Declaro ser madre, padre o tutor legal del menor, o contar con su
        autorización». La autorización cubre el uso de su nombre y sus rasgos para crear el cuento.
      </p>

      <h2>6. Precio e impuestos</h2>
      <p>
        Los precios incluyen IVA. A los libros, también en formato electrónico, se les aplica el tipo superreducido del 4 %. El precio del libro de tapa dura incluye el envío a la Península y Baleares; de momento no
        enviamos a Canarias, Ceuta, Melilla ni fuera de España.
      </p>

      <h2>7. Sin derecho de desistimiento</h2>
      <p>
        Los cuentos se confeccionan según las especificaciones de quien los encarga y están claramente personalizados. Por eso, de acuerdo con el{" "}
        <strong>art. 103.c) del Texto Refundido de la Ley General para la Defensa de los Consumidores y Usuarios</strong> (TRLGDCU), no se aplica
        el derecho de desistimiento. Lo mismo dice el art. 103.m) para el contenido digital que empieza a prepararse en cuanto pagas. Lo
        aceptas expresamente antes de pagar, en una casilla junto al botón de pago, y queda registrado con el pago. Esto no afecta a tus derechos si el producto llega defectuoso o
        no corresponde con lo pedido.
      </p>

      <h2>8. Libro impreso: plazos y entrega</h2>
      <p>
        El libro de tapa dura (20×20 cm) se imprime cuando pulsas «Mandar a imprimir». Suele llegar en una o dos semanas desde entonces; el plazo
        es orientativo y te escribimos con el seguimiento cuando sale de la imprenta. Revisa bien la dirección: si el transportista no puede
        entregarlo por un error en ella, el nuevo envío corre por tu cuenta.
      </p>

      <h2>9. Garantía y reclamaciones</h2>
      <p>
        Si el libro impreso llega dañado o con un fallo de impresión, escríbenos con una foto en los 14 días siguientes a recibirlo y lo
        volvemos a imprimir sin coste. Si el PDF no se abre o le falta alguna página, escríbenos a <ContactEmail value={t.email} /> y lo reponemos sin coste. Esto no limita la
        garantía legal que te corresponde como consumidor. Hojas de reclamación disponibles a petición.
      </p>

      <h2>10. Guarda tu PDF</h2>
      <p>
        El libro se borra a los 30 días de empezarlo, también si lo has comprado. Descarga el PDF antes. Detalle en la{" "}
        <Link href="/privacidad" className="link">política de privacidad</Link>.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>Ley española. Para consumidores, los juzgados de su domicilio.</p>
    </LegalPage>
  );
}
