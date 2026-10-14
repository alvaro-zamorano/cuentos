import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad" updated="14 de octubre de 2026">
      <h2>1. Responsable</h2>
      <p>
        Responsable del tratamiento: <Pending>nombre y apellidos o razón social</Pending>, NIF <Pending>NIF</Pending>, domicilio{" "}
        <Pending>dirección</Pending>. Contacto para privacidad: <Pending>email de contacto</Pending>.
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
          Estos proveedores tratan los datos por encargo nuestro y no para sus propios fines <Pending>confirmar en los términos de la API de
          Anthropic y de la API de pago de Gemini que no usan los datos para entrenar</Pending>.
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
        <li>
          Enviarte novedades: <strong>solo si lo marcas</strong> en una casilla separada y opcional (consentimiento, art. 21 LSSI). Puedes retirarlo
          en cualquier momento desde el propio email o escribiéndonos.
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
          El email que nos das para recibir el enlace del libro se conserva <Pending>plazo (E18)</Pending>. Si marcas recibir novedades, hasta
          que te des de baja.
        </li>
      </ul>

      <h2>7. Proveedores (encargados del tratamiento)</h2>
      <p>
        Trabajamos con proveedores que firman un contrato de encargo (DPA). Cuando hay transferencia fuera del Espacio Económico Europeo, se basa
        en cláusulas contractuales tipo (SCC) o en el Marco de Privacidad de Datos UE-EE. UU. (DPF):
      </p>
      <ul>
        <li>Alojamiento web: Vercel <Pending>DPA y mecanismo de transferencia</Pending>.</li>
        <li>Base de datos y almacenamiento: Supabase <Pending>región y DPA</Pending>.</li>
        <li>Texto del cuento y revisión de las imágenes: Anthropic <Pending>DPA y SCC/DPF</Pending>.</li>
        <li>Ilustraciones: Google, API de Gemini <Pending>DPA y SCC/DPF</Pending>.</li>
        <li>Envío de emails: Resend <Pending>DPA y SCC/DPF</Pending>.</li>
        <li>Pagos: Stripe <Pending>DPA</Pending>.</li>
        <li>Analítica, solo con tu consentimiento: Microsoft Clarity <Pending>DPA</Pending>.</li>
      </ul>

      <h2>8. Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <Pending>email de contacto</Pending>.
        Si crees que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).
      </p>

      <p className="text-sm text-ink-soft">
        Ver también las <Link href="/condiciones" className="link">condiciones</Link> y el <Link href="/aviso-legal" className="link">aviso legal</Link>.
      </p>
    </LegalPage>
  );
}
