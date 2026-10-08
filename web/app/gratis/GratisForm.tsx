"use client";

import { EmailForm } from "@/components/EmailForm";

export function GratisForm() {
  return (
    <EmailForm
      edition="classic"
      source="gratis"
      submitLabel="Descargar en PDF"
      openUrl="/libro?demo=1&print=1"
      successMessage={
        <p className="text-sm font-bold text-leaf" data-testid="gratis-ok">
          Se ha abierto el cuento en una pestaña nueva. Si no,{" "}
          <a className="underline" href="/libro?demo=1&print=1" target="_blank">
            ábrelo aquí
          </a>
          .
        </p>
      }
    />
  );
}
