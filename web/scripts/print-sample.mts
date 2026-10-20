/**
 * PDF del libro de muestra, en local y sin coste: sirve public/muestra y maqueta la tapa dura apaisada (280×210) con la
 * cubierta estimada y, al lado, los dos PDF que se descargan (A4 apaisado).
 * Uso: node --conditions=react-server --import tsx scripts/print-sample.mts <salida.pdf>
 *   → <salida>.pdf (imprenta), <salida>-full.pdf y <salida>-free.pdf
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { renderPrintPdf } from "../lib/pdf/print";
import { DEFAULT_PRINT_SIZE, estimatedCover } from "../lib/print/gelato";
import { renderBook2Pdf } from "../lib/pdf/book2";
import { MUESTRA } from "../lib/muestra";
import { mockPlan } from "../lib/plan/mock";
import { normalizeFicha } from "../lib/plan/ficha";
import { EVAL_CASES } from "../lib/plan/evalCases";

const out = process.argv[2] ?? "muestra-imprenta.pdf";
const root = path.resolve("public");
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (!file.startsWith(root) || !fs.existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": file.endsWith(".webp") ? "image/webp" : "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
const img = (n: number) => `http://127.0.0.1:${port}/muestra/luna-${String(n).padStart(2, "0")}.webp`;

const base = mockPlan(normalizeFicha(EVAL_CASES[0]));
const plan = { ...base, title: MUESTRA.title, dedication: MUESTRA.dedication, pages: base.pages.map((p, i) => ({ ...p, text: MUESTRA.pages[i] })) };
const pageUrls = Object.fromEntries(plan.pages.map((p) => [p.n, img(p.n)]));
const size = DEFAULT_PRINT_SIZE;
const input = { plan, heroName: "Vera", from: "los abuelos", coverUrl: img(0), sheetUrl: `http://127.0.0.1:${port}/muestra/hoja-vera.webp`, pageUrls, date: new Date() };
const { pdf, pages } = await renderPrintPdf(input, size, estimatedCover(size));
fs.writeFileSync(out, pdf);
console.log(`${out}: ${pages} páginas, ${(pdf.length / 1e6).toFixed(2)} MB`);
for (const kind of ["full", "free"] as const) {
  const file = out.replace(/\.pdf$/, "") + `-${kind}.pdf`;
  const b = await renderBook2Pdf({ ...input, kind });
  fs.writeFileSync(file, b);
  console.log(`${file}: ${(b.length / 1e6).toFixed(2)} MB`);
}
server.close();
