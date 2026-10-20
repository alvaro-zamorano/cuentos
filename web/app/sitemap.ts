import type { MetadataRoute } from "next";
import { indexable, sitemapPaths, siteUrl } from "@/lib/site";
import { appOpen } from "@/lib/appOpen";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!indexable() || !base) return [];
  return sitemapPaths(appOpen()).map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : p === "/crear" ? 0.8 : 0.3 }));
}
