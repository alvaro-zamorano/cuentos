import type { MetadataRoute } from "next";
import { appEnabled } from "@/lib/launch";
import { OCASIONES, OCASIONES_PATH, ocasionPath } from "@/lib/ocasiones";
import { indexable, PUBLIC_PATHS, siteUrl } from "@/lib/site";

/** Con la app cerrada (lib/launch.ts), /crear redirige a la lista de espera y no entra; la lista no se indexa. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!indexable() || !base) return [];
  const open = appEnabled();
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.filter((p) => open || p !== "/crear").map((p) => ({
    url: `${base}${p === "/" ? "" : p}`,
    changeFrequency: p === "/" ? "weekly" : "monthly",
    priority: p === "/" ? 1 : p === "/crear" ? 0.8 : 0.3,
  }));
  const ocasiones: MetadataRoute.Sitemap = [
    { url: `${base}${OCASIONES_PATH}`, changeFrequency: "monthly", priority: 0.8 },
    ...OCASIONES.map((o) => ({ url: `${base}${ocasionPath(o.slug)}`, changeFrequency: "monthly" as const, priority: 0.9 })),
  ];
  return [...pages, ...ocasiones];
}
