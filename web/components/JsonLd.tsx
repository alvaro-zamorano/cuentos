/** Datos estructurados (schema.org) en una etiqueta script. Escapa «<» para que el JSON no pueda cerrar la etiqueta. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
