import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage } from "@/components/LegalPage";
import { titular, titularLine } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  const t = titular();
  return (
    <LegalPage title="Política de privacidad" updated="20 de octubre de 2026">
      <h2>1. Responsable</h2>
      <p>
        Responsable del tratamiento: {titularLine(t)}. Contacto para privacidad: <ContactEmail value={t.email} />.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos del niño o la niña protagonista</strong>: nombre, edad, si es niño o niña (solo para la concordancia del texto), aspecto
          (pelo, piel, ojos, gafas, algún rasgo que le hace único), ropa habitual, la idea del cuento y los detalles que escribas. Aunque no
          pedimos fotos, son datos personales de un menor y los tratamos como tales.
        </li>
        <li>
          <strong>Otras personas o mascotas del cuento</strong>: el nombre, la relación y una línea de aspecto de quienes añadas al reparto, y lo
          que escribas sobre ellos en la idea o en los detalles. Añádelos solo si tienes permiso.
        </li>
        <li>
          <strong>Datos de quien crea o compra el libro</strong>: el email, si quieres o no recibir novedades y, si compras, los datos del
          pedido. Los datos de la tarjeta los recoge Stripe; nosotros no los vemos.
        </li>
        <li>
          <strong>Si te apuntas a la lista de espera</strong>: el email y, si llegas desde la página de una ocasión (Navidad, cumpleaños…),
          cuál era.
        </li>
        <li>
          <strong>Si compras el libro impreso</strong>: el nombre y la dirección de quien lo recibe y, si lo das, un teléfono para el
          transportista.
        </li>
        <li>No pedimos fotos, apellidos ni fecha de nacimiento. No usamos reconocimiento facial.</li>
      </ul>

      <h2>3. Cómo usamos la inteligencia artificial</h2>
      <ul>
        <li>
          El cuento lo escribe un modelo de IA de Anthropic (Claude) a partir de lo que pones en el formulario, incluido el nombre del niño.
        </li>
        <li>
          Las ilustraciones las pinta un modelo de IA de Google (Gemini) a partir de una descripción en inglés del aspecto de los personajes y de
          cada escena, con sus nombres. Un modelo de Anthropic revisa cada imagen antes de enseñártela.
        </li>
        <li>
          La hoja de personajes y la portada se pintan cuando nos das tu email, antes de pagar. Las doce páginas, solo después del pago.
        </li>
        <li>
          Anthropic y Google tratan estos datos por encargo nuestro. Ninguno de los dos los usa para entrenar ni mejorar sus modelos. Anthropic los
          borra en 30 días y Google los guarda 55 días solo para detectar abusos.
        </li>
      </ul>

      <h2>4. Declaración de quien crea el cuento</h2>
      <p>
        Antes de pintar la hoja de personajes, quien crea el cuento marca una casilla obligatoria: «Declaro ser madre, padre o tutor legal del
        menor, o contar con su autorización».
      </p>

      <h2>5. Para qué y con qué base</h2>
      <ul>
        <li>Escribir el cuento, pintar las ilustraciones y entregarte el libro (ejecución del servicio que pides).</li>
        <li>Guardarte un enlace para volver a tu libro durante 30 días y mandártelo por email (ejecución del servicio que pides).</li>
        <li>Cobrar y conservar el pedido (ejecución del contrato y obligaciones contables y fiscales).</li>
        <li>Imprimir el libro y enviártelo a la dirección que indiques (ejecución del contrato).</li>
        <li>Contestar lo que nos escribes (ejecución del contrato si es sobre un pedido; si no, tu consentimiento al escribirnos).</li>
        <li>
          Cuando pides otra versión de una ilustración, guardamos el motivo y lo que escribas para pintarla mejor y para saber qué falla
          (ejecución del servicio y, después, interés legítimo en mejorarlo).
        </li>
        <li>
          Enviarte novedades: <strong>solo si lo marcas</strong> en una casilla separada y opcional (consentimiento, art. 21 LSSI). Puedes retirarlo
          en cualquier momento desde el propio email o escribiéndonos.
        </li>
        <li>
          Avisarte cuando abramos y enviarte novedades, si te apuntas a la lista de espera y lo aceptas en su casilla (consentimiento, art. 21
          LSSI). Cada email lleva cómo darte de baja.
        </li>
        <li>
          Medición de uso de la web (Microsoft Clarity) en forma agregada: <strong>solo si lo aceptas</strong> en el aviso de cookies
          (consentimiento, art. 22.2 LSSI). Si lo rechazas, no se carga y no se instala ninguna cookie de medición. Puedes cambiar tu elección
          borrando los datos de este sitio en tu navegador.
        </li>
      </ul>

      <h2>6. Dónde se guardan y cuánto tiempo</h2>
      <ul>
        <li>
          El libro (lo que pones en el formulario, el cuento y las ilustraciones) se guarda en nuestro servidor y se <strong>borra a los 30 días</strong>{" "}
          de empezarlo. El cuento escrito también se guarda 30 días para no tener que escribirlo dos veces. Mientras lo creas, una copia se queda
          además en tu navegador.
        </li>
        <li>
          Si lo compras, a los 30 días se borran igualmente el formulario, el cuento y las ilustraciones. Conservamos el pedido (email, importe y
          fecha) el plazo que exige la normativa fiscal y mercantil.
        </li>
        <li>
          Si compras el libro impreso, no lo borramos mientras no lo mandes a imprimir: sin las ilustraciones no se puede imprimir. La dirección
          de envío se borra con el libro, salvo que el paquete siga de camino; entonces, cuando llega.
        </li>
        <li>
          El email que nos das para recibir el enlace del libro se borra a los 30 días, con el libro, si no has aceptado recibir novedades. Si
          compras, se queda con el pedido. Si aceptas novedades, lo guardamos hasta que te des de baja.
        </li>
        <li>El email de la lista de espera lo guardamos hasta que te des de baja.</li>
        <li>Si nos escribes, guardamos tu mensaje el tiempo necesario para atenderte y, si es sobre un pedido, con el pedido.</li>
        <li>
          El motivo de «otra versión» y lo que escribas se guardan con el libro. A los 30 días se borra lo que escribiste y el motivo se
          queda sin relación con el libro ni contigo.
        </li>
      </ul>

      <h2>7. Proveedores</h2>
      <p>
        Estos proveedores tratan datos por encargo nuestro, con un contrato de encargo (DPA) que forma parte de sus condiciones. Cuando los datos
        salen del Espacio Económico Europeo, la transferencia se ampara en cláusulas contractuales tipo de la Comisión Europea y, cuando el
        proveedor está certificado, en el Marco de Privacidad de Datos UE-EE. UU.:
      </p>
      <ul>
        <li>Alojamiento web: Vercel Inc. (EE. UU.), con los servidores de la web en Dublín (UE), cláusulas tipo y Marco de Privacidad.</li>
        <li>
          Base de datos y archivos: Supabase Pte. Ltd. (Singapur), con los datos alojados en Irlanda (UE) y
          cláusulas tipo.
        </li>
        <li>Texto del cuento y revisión de las imágenes: Anthropic Ireland, Limited, con la API de Claude, y cláusulas tipo.</li>
        <li>Ilustraciones: Google Cloud EMEA Limited (Irlanda), con la API de pago de Gemini, cláusulas tipo y Marco de Privacidad.</li>
        <li>
          Envío y recepción de emails: Resend (Plus Five Five, Inc., EE. UU.), con cláusulas tipo y Marco de Privacidad. Lo que nos escribes a
          nuestra dirección pasa por Resend antes de llegar a nuestro buzón.
        </li>
        <li>Cobro: Stripe Payments Europe, Limited (Irlanda), con cláusulas tipo y Marco de Privacidad.</li>
        <li>
          Impresión y envío del libro de tapa dura: Gelato (Noruega, en el Espacio Económico Europeo),
          que encarga la impresión a una imprenta de su red, normalmente cerca de tu casa. Recibe el libro, el nombre, la dirección, el email y,
          si lo das, el teléfono.
        </li>
      </ul>
      <p>Y estos los tratan como responsables independientes, con su propia política de privacidad:</p>
      <ul>
        <li>
          Stripe, para prevenir el fraude y cumplir sus obligaciones legales (por ejemplo, contra el blanqueo de capitales).{" "}
          <a href="https://stripe.com/es/privacy" className="link" target="_blank" rel="noopener noreferrer">
            Política de Stripe
          </a>
          .
        </li>
        <li>
          El transportista que entrega el libro impreso: recibe tu nombre, la dirección y, si lo das, el teléfono para hacer la entrega.
        </li>
        <li>
          Microsoft (Clarity), solo si aceptas la medición: recoge cómo navegas por la web y puede usar esos datos para sus propios fines. No graba
          lo que escribes sobre el niño ni el cuento.{" "}
          <a href="https://privacy.microsoft.com/es-es/privacystatement" className="link" target="_blank" rel="noopener noreferrer">
            Declaración de privacidad de Microsoft
          </a>
          .
        </li>
      </ul>

      <h2>8. Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <ContactEmail value={t.email} />.
        Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
      </p>

      <p className="text-sm text-ink-soft">
        Ver también las <Link href="/condiciones" className="link">condiciones</Link> y el <Link href="/aviso-legal" className="link">aviso legal</Link>.
      </p>
    </LegalPage>
  );
}
