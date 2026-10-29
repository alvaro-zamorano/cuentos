/**
 * Miniaturas del paso 2 de /crear (pelo, gafas, ropa, mascotas) a partir del catálogo gouache ya existente
 * (public/catalog/gouache). Salida: public/crear/<grupo>/<id>.webp, ~10–20 KB cada una.
 * Las personas de «Quién más sale» salen de assets/crear/person (generadas con Nano Banana Pro el 26 oct, no son del
 * catálogo de piezas).
 * Uso: node scripts/crear-thumbs.mjs [grupo]   (sin grupo, todas; si cambian los peinados, después:
 * python3 scripts/crear_hair_masks.py desde la raíz)
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "public/catalog/gouache";
const OUT = "public/crear";
const jobs = [];
const square = (group, from, id = path.basename(from, ".png")) => jobs.push({ group, from, id, kind: "square" });
const tall = (group, from, id = path.basename(from, ".png")) => jobs.push({ group, from, id, kind: "tall" });

for (const f of fs.readdirSync(`${SRC}/hair`)) square("hair", `${SRC}/hair/${f}`);
for (const f of fs.readdirSync(`${SRC}/glasses`)) square("glasses", `${SRC}/glasses/${f}`);
square("glasses", `${SRC}/eyes/redondos.png`, "no"); // el mismo niño sin gafas
for (const f of fs.readdirSync(`${SRC}/outfit`)) tall("outfit", `${SRC}/outfit/${f}`);
for (const f of fs.readdirSync(`${SRC}/pet`)) square("pet", `${SRC}/pet/${f}`);
for (const f of fs.readdirSync("../assets/crear/person")) square("person", `../assets/crear/person/${f}`);

const only = process.argv[2];
if (only) jobs.splice(0, jobs.length, ...jobs.filter((j) => j.group === only));

let total = 0;
for (const j of jobs) {
  const img = sharp(j.from).flatten({ background: "#ffffff" });
  const { width, height } = await img.metadata();
  let pipe;
  if (j.kind === "square") {
    const side = Math.min(width, height);
    // cabeza arriba: recorte cuadrado centrado en horizontal y pegado arriba
    pipe = img.extract({ left: Math.floor((width - side) / 2), top: 0, width: side, height: side }).resize(240, 240);
  } else {
    pipe = img.resize({ height: 300 });
  }
  const dir = `${OUT}/${j.group}`;
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${j.id}.webp`;
  await pipe.webp({ quality: 82 }).toFile(file);
  total += fs.statSync(file).size;
}
console.log(`${jobs.length} miniaturas, ${(total / 1024).toFixed(0)} KB`);
