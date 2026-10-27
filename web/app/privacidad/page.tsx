import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/LegalPage";
import { holderLine, titular } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidad" };

/**
 * Lo mínimo que piden los arts. 13 y 14 RGPD y el 22.2 LSSI, sin nombrar proveedores ni contar cómo funciona por dentro
 * (decisión de Álvaro, 25 oct). Los proveedores van por categorías; la lista con nombres se da a quien la pida por email.
 */
export default function Privacidad() {
  const t = titular();
  return (
    <LegalPage title="Política de privacidad" updated="27 de octubre de 2026">
      <h2>1. Responsable</h2>
      <p>
        Responsable del tratamiento: {holderLine(t)}. Contacto para privacidad: <ContactEmail value={t.email} />.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Del niño o la niña protagonista</strong>: nombre, edad, cómo es y lo que nos cuentes para el cuento. No pedimos fotos,
          apellidos ni fecha de nacimiento.
        </li>
        <li>
          <strong>De otras personas o mascotas que añadas al cuento</strong>: nombre, relación y aspecto. Añádelos solo si tienes permiso.
        </li>
        <li>
          <strong>Datos de salud, solo si los cuentas tú</strong>: no los pedimos, pero los campos libres los admiten (por ejemplo, que lleva
          audífono o va en silla de ruedas). Si los pones, los usamos solo para escribir e ilustrar ese cuento y se borran con él.
        </li>
        <li>
          <strong>De quien crea o compra el libro</strong>: el email, si quiere recibir novedades y los datos del pedido. Los datos de la
          tarjeta los recoge la entidad de pago; nosotros no los vemos.
        </li>
        <li>
          <strong>Si compras el libro impreso</strong>: nombre y dirección de entrega y, si lo das, un teléfono.
        </li>
        <li>
          <strong>Si aceptas la medición</strong>: qué páginas ves y qué pasos das, el navegador, el dispositivo, la dirección IP y un
          identificador al azar guardado en una cookie. Nunca tu nombre, tu email ni lo que escribes.
        </li>
      </ul>
      <p>
        Quien crea el cuento declara ser madre, padre o tutor legal del menor, o contar con su autorización: al pedir que lo escribamos y,
        otra vez, en una casilla obligatoria antes de dibujarlo.
      </p>

      <h2>3. Para qué y con qué base</h2>
      <ul>
        <li>
          Crear el cuento y sus ilustraciones con inteligencia artificial, guardarlo, mandarte el enlace, cobrar, imprimir y entregar el libro, y
          contestar lo que nos escribes: ejecución del servicio que pides. Sin estos datos no podemos hacer el libro.
        </li>
        <li>
          Los datos de salud que cuentes del niño o la niña: solo para hacer ese libro y con tu consentimiento expreso (art. 9.2.a RGPD), que
          das al pedir que lo escribamos y en la casilla antes de dibujarlo. Puedes retirarlo escribiéndonos: borramos el libro.
        </li>
        <li>Conservar los pedidos: obligaciones contables y fiscales.</li>
        <li>
          Mejorar el servicio con los motivos por los que se piden otras versiones de una ilustración. A los 30 días quedan sin relación
          contigo: interés legítimo.
        </li>
        <li>
          Enviarte novedades: <strong>solo si lo marcas</strong> en una casilla opcional (consentimiento, art. 21 LSSI). Puedes darte de baja
          desde el propio email o escribiéndonos.
        </li>
        <li>
          Medir el uso de la web para mejorarla: <strong>solo si lo aceptas</strong> en el aviso de cookies (consentimiento, art. 22.2 LSSI).
          Si lo rechazas, no se carga nada. Puedes cambiar tu elección cuando quieras desde «Cookies», al pie de cada página.
        </li>
      </ul>
      <p>No tomamos decisiones automatizadas que te afecten.</p>

      <h2>4. Cuánto tiempo los guardamos</h2>
      <ul>
        <li>
          El libro (lo que pones en el formulario, el cuento y las ilustraciones) se <strong>borra a los 30 días</strong> de empezarlo; si lo
          compras, a los 30 días de la compra. Si has comprado el libro impreso, se guarda hasta que lo mandas a imprimir y, después, como mucho 30 días más. La dirección de envío,
          hasta que llega el paquete.
        </li>
        <li>
          El email se borra con el libro. Si compras, se queda con el pedido; si aceptas novedades, hasta que te des de baja.
        </li>
        <li>El pedido (email, importe y fecha), el plazo que exige la normativa fiscal y mercantil.</li>
        <li>Tus mensajes, el tiempo necesario para atenderte.</li>
        <li>
          Los datos de medición, un año. Las cookies de medición son propias de este sitio, duran como mucho un año y solo se instalan si
          aceptas.
        </li>
      </ul>

      <h2>5. Quién más trata los datos</h2>
      <p>
        Proveedores que trabajan por encargo nuestro, con contrato de encargo: alojamiento y base de datos, modelos de inteligencia artificial
        que escriben el cuento y crean las ilustraciones, envío de emails, cobro, medición de uso e impresión y envío del libro. Los proveedores
        de inteligencia artificial no usan estos datos para entrenar sus modelos.
      </p>
      <p>
        Con su propia responsabilidad: la entidad de pago, para prevenir el fraude y cumplir sus obligaciones legales, y el transportista,
        para entregar el libro.
      </p>
      <p>
        Algunos proveedores están fuera del Espacio Económico Europeo o pueden acceder a los datos desde fuera. En esos casos la transferencia se
        ampara en cláusulas contractuales tipo de la Comisión Europea o en el Marco de Privacidad de Datos UE-EE. UU. Puedes pedirnos la lista
        de proveedores y una copia de esas garantías en <ContactEmail value={t.email} />.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad, y retirar tu consentimiento cuando quieras,
        escribiendo a <ContactEmail value={t.email} />. Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia
        Española de Protección de Datos (aepd.es).
      </p>

      <p className="text-sm text-ink-soft">
        Ver también las <Link href="/condiciones" className="link">condiciones</Link> y el <Link href="/aviso-legal" className="link">aviso legal</Link>.
      </p>
    </LegalPage>
  );
}
