import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad" updated="9 de octubre de 2026">
      <h2>1. Responsable</h2>
      <p>
        Responsable del tratamiento: <Pending>nombre y apellidos o razón social</Pending>, NIF <Pending>NIF</Pending>, domicilio{" "}
        <Pending>dirección</Pending>. Contacto para privacidad: <Pending>email de contacto</Pending>.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos del niño o la niña protagonista</strong>: nombre, edad, rasgos del avatar (pelo, piel, ojos, gafas, ropa), acompañante y
          «detalle especial». Aunque no pedimos fotos, estos datos son datos personales de un menor y los tratamos como tales.
        </li>
        <li>
          <strong>Datos de quien crea o compra el cuento</strong>: email y, en ediciones de pago, los datos necesarios para el pago y el envío.
        </li>
        <li>No pedimos fotos. No usamos reconocimiento facial.</li>
      </ul>

      <h2>3. Declaración de quien crea el cuento</h2>
      <p>
        Para descargar o comprar un cuento, quien lo crea marca una casilla obligatoria: «Declaro ser madre, padre o tutor legal del menor, o
        contar con su autorización».
      </p>

      <h2>4. Para qué y con qué base</h2>
      <ul>
        <li>Crear, guardar y entregar el cuento (ejecución del servicio solicitado).</li>
        <li>Guardarte un enlace para recuperar el cuento durante 30 días (ejecución del servicio solicitado).</li>
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

      <h2>5. Cuánto tiempo</h2>
      <p>
        Los datos del cuento (incluidos los del niño) se <strong>borran a los 30 días</strong> de su creación o del pedido, salvo que pidas
        expresamente conservar el libro. Mientras creas el cuento, el borrador se queda en tu navegador. El email para novedades se conserva
        hasta que te des de baja. Los datos de facturación se conservan el plazo que exige la normativa fiscal.
      </p>

      <h2>6. Proveedores (encargados del tratamiento)</h2>
      <p>Trabajamos con proveedores que firman un contrato de encargo (DPA). Cuando hay transferencia fuera del EEE, se basa en cláusulas contractuales tipo (SCC) o en el Marco de Privacidad de Datos UE-EE. UU. (DPF):</p>
      <ul>
        <li>Alojamiento web: Vercel <Pending>DPA y mecanismo de transferencia</Pending>.</li>
        <li>Base de datos y almacenamiento: Supabase <Pending>región y DPA</Pending>.</li>
        <li>Generación de ilustraciones (solo ediciones de pago, sin datos de identificación directa: rasgos del avatar): <Pending>proveedor de IA, DPA y SCC/DPF</Pending>.</li>
        <li>Envío de emails: <Pending>proveedor de email y DPA</Pending>.</li>
        <li>Pagos: <Pending>Stripe, DPA</Pending>. Impresión y envío de tapa dura: <Pending>proveedor POD</Pending>.</li>
        <li>Analítica: Microsoft Clarity <Pending>DPA</Pending>.</li>
      </ul>

      <h2>7. Tus derechos</h2>
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
