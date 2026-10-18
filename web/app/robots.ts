import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/site";

/** Producción con dominio (SITE_URL): todo salvo la API y los libros de cada familia. Lo demás, fuera de los buscadores. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  if (!indexable() || !base) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/crear?"] },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
