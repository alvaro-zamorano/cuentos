import type { MetadataRoute } from "next";
import { indexable, PUBLIC_PATHS, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!indexable() || !base) return [];
  return PUBLIC_PATHS.map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: p === "/" ? "weekly" : "monthly", priority: p === "/" ? 1 : p === "/crear" ? 0.8 : 0.3 }));
}
