import type { MetadataRoute } from "next";
import { indexable, sitemapPaths, siteUrl } from "@/lib/site";
import { appOpen } from "@/lib/appOpen";
import { OCASIONES, OCASIONES_PATH, ocasionPath } from "@/lib/ocasiones";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!indexable() || !base) return [];
  const pages: MetadataRoute.Sitemap = sitemapPaths(appOpen()).map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : p === "/crear" ? 0.8 : 0.3 }));
  // páginas de ocasión (SEO y GEO): el índice y una por ocasión
  const ocasiones: MetadataRoute.Sitemap = [
    { url: `${base}${OCASIONES_PATH}`, changeFrequency: "monthly", priority: 0.8 },
    ...OCASIONES.map((o) => ({ url: `${base}${ocasionPath(o.slug)}`, changeFrequency: "monthly" as const, priority: 0.9 })),
  ];
  return [...pages, ...ocasiones];
}
