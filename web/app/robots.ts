import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/site";
import { appOpen } from "@/lib/appOpen";

/** Producción con dominio (SITE_URL): todo salvo la API, los libros de cada familia y su seguimiento. Lo demás, fuera de los buscadores. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  if (!indexable() || !base) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: appOpen() ? ["/api/", "/crear?", "/seguimiento/"] : ["/api/", "/crear", "/seguimiento/"] },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
