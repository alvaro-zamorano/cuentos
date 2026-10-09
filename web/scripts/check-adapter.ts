/**
 * Comprobación sin coste del adaptador: dry-run completo + construcción (sin envío) de la petición openai-images.
 *   cd web && npx tsx scripts/check-adapter.ts
 */
import { buildOpenAIImageRequest, dryRunAdapter, getAdapter } from "../lib/generation/adapter";
import { sheetPrompt } from "../lib/generation/prompts";
import { STYLES } from "../lib/generation/styles";
import { buildBook, DEFAULT_DRAFT } from "../lib/story";
import { describeTraitsEn, randomTraits } from "../lib/traits";

async function main() {
  const draft = { ...DEFAULT_DRAFT, hero: { name: "Vera", age: 5, traits: randomTraits(42) }, companion: { kind: "perro" as const, name: "Toby", variant: "corgi" as const } };
  const traitsEn = describeTraitsEn(draft.hero.traits);
  console.log("adapter por defecto:", getAdapter().name);
  console.log("traitsEn:", traitsEn);
  const style = STYLES.find((s) => s.id === "acuarela")!;
  const sheet = await dryRunAdapter.generateSheet(traitsEn, style);
  console.log("sheet dry-run:", sheet.images.map((i) => i.placeholder), "coste", sheet.costCents);
  const page = buildBook(draft).pages[3];
  console.log("scenePrompt p4:", page.scenePrompt);
  const scene = await dryRunAdapter.generateScene({ path: sheet.images[0].placeholder! }, style, page.scenePrompt);
  console.log("scene dry-run:", scene.images.map((i) => i.placeholder), "coste", scene.costCents);
  const req = buildOpenAIImageRequest(sheetPrompt(traitsEn, style), [{ path: style.anchorPath }], 1);
  console.log("openai request (no enviada):", { url: req.url, model: req.model, size: req.size, n: req.n, refs: req.refs });
  let threw = false;
  try {
    buildOpenAIImageRequest("x", [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }], 1);
  } catch {
    threw = true;
  }
  console.log("rechaza >3 referencias:", threw);
}

main();
