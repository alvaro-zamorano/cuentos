"use client";

import { EmailForm } from "@/components/EmailForm";

export function GratisForm() {
  return (
    <EmailForm
      edition="classic"
      source="gratis"
      submitLabel="Descargar PDF"
      openUrl="/libro?demo=1&print=1"
      successMessage={
        <p className="text-sm text-ink" data-testid="gratis-ok">
          El cuento se ha abierto en una pestaña nueva. Si no aparece,{" "}
          <a className="link" href="/libro?demo=1&print=1" target="_blank">
            ábrelo aquí
          </a>
          .
        </p>
      }
    />
  );
}
