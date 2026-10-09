/* eslint-disable @next/next/no-head-element -- documento HTML estático, fuera de Next */
/**
 * Hoja de contacto de todos los rasgos del avatar SVG (verificación visual).
 *   cd web && npx tsx scripts/avatar-sheet.tsx > /tmp/avatares.html
 * Cada fila varía un rasgo sobre una base fija; incluye acompañantes (mascotas y abuelos).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "../components/Avatar";
import { Companion } from "../components/Companion";
import {
  ACCESSORIES,
  DEFAULT_TRAITS,
  EYE_SHAPES,
  EYES,
  GARMENTS,
  GLASSES,
  GRANDPARENTS,
  HAIR_COLORS,
  HAIR_SHAPES,
  OUTFITS,
  PETS,
  SKINS,
} from "../lib/traits";
import type { Traits } from "../lib/types";

const base: Traits = { ...DEFAULT_TRAITS, hair: { shape: "corto", color: "castano" } };

const rows: { title: string; items: { label: string; node: React.ReactNode }[] }[] = [
  { title: "Pelo (12)", items: HAIR_SHAPES.map((h) => ({ label: h.id, node: <Avatar traits={{ ...base, hair: { ...base.hair, shape: h.id } }} size={110} /> })) },
  { title: "Color de pelo (5)", items: HAIR_COLORS.map((c) => ({ label: c.id, node: <Avatar traits={{ ...base, hair: { shape: "rizos-media", color: c.id } }} size={110} /> })) },
  { title: "Piel (8)", items: SKINS.map((s) => ({ label: s.id, node: <Avatar traits={{ ...base, skin: s.id }} size={110} /> })) },
  { title: "Ojos (6)", items: EYE_SHAPES.map((e) => ({ label: e.id, node: <Avatar traits={{ ...base, eyeShape: e.id }} size={110} /> })) },
  { title: "Color de ojos (4)", items: EYES.map((e) => ({ label: e.id, node: <Avatar traits={{ ...base, eyes: e.id, eyeShape: "redondos" }} size={110} /> })) },
  { title: "Gafas (6 + no)", items: GLASSES.map((g) => ({ label: g.id, node: <Avatar traits={{ ...base, glasses: g.id }} size={110} /> })) },
  { title: "Ropa (8)", items: GARMENTS.map((g) => ({ label: g.id, node: <Avatar traits={{ ...base, garment: g.id }} size={110} /> })) },
  { title: "Color de ropa (6)", items: OUTFITS.map((o) => ({ label: o.id, node: <Avatar traits={{ ...base, outfit: o.id }} size={110} /> })) },
  { title: "Accesorio (8 + no)", items: ACCESSORIES.map((a) => ({ label: a.id, node: <Avatar traits={{ ...base, accessory: a.id }} size={110} /> })) },
  {
    title: "Mascotas (perro/gato en el journey)",
    items: PETS.filter((p) => p.kind).map((p) => ({ label: p.id, node: <Companion companion={{ kind: p.kind!, variant: p.id }} size={110} /> })),
  },
  { title: "Abuelos (8)", items: GRANDPARENTS.map((g) => ({ label: g.id, node: <Companion companion={{ kind: g.kind, variant: g.id }} size={110} /> })) },
  {
    title: "Expresiones",
    items: (["feliz", "risa", "sorpresa", "curioso", "sueno", "orgullo"] as const).map((x) => ({ label: x, node: <Avatar traits={{ ...base, glasses: "redondas" }} expression={x} size={110} /> })),
  },
];

const html = renderToStaticMarkup(
  <html lang="es">
    <head>
      <meta charSet="utf-8" />
      <title>Avatares</title>
      <style>{`body{font-family:system-ui,sans-serif;background:#fff8ec;margin:16px;color:#2b2118}
h2{font-size:14px;margin:14px 0 4px}.row{display:flex;flex-wrap:wrap;gap:6px}
.cell{background:#fff;border:1px solid #ecdcc3;border-radius:10px;padding:4px;text-align:center;font-size:11px;width:118px}`}</style>
    </head>
    <body>
      {rows.map((r) => (
        <section key={r.title}>
          <h2>{r.title}</h2>
          <div className="row">
            {r.items.map((i) => (
              <div className="cell" key={i.label}>
                {i.node}
                <div>{i.label}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </body>
  </html>,
);
process.stdout.write("<!doctype html>" + html);
