/**
 * PDF de imprenta del libro de muestra (B8), en local y sin coste: sirve public/muestra y maqueta la tapa dura de 20×20
 * con la cubierta estimada. Uso: node --conditions=react-server --import tsx scripts/print-sample.mts <salida.pdf>
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { renderPrintPdf } from "../lib/pdf/print";
import { estimatedCover } from "../lib/print/gelato";
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
const size = { trimWidth: 200, trimHeight: 200, bleed: 4 };
const { pdf, pages } = await renderPrintPdf(
  { plan, heroName: "Vera", from: "los abuelos", coverUrl: img(0), sheetUrl: `http://127.0.0.1:${port}/muestra/hoja-vera.webp`, pageUrls, date: new Date() },
  size,
  estimatedCover(size),
);
fs.writeFileSync(out, pdf);
console.log(`${out}: ${pages} páginas, ${(pdf.length / 1e6).toFixed(2)} MB`);
server.close();
