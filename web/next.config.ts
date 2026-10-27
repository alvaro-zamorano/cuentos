import type { NextConfig } from "next";
import { brandRedirects } from "./lib/site";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Chromium y puppeteer se cargan desde node_modules en tiempo de ejecución (PDF en servidor), no se empaquetan
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  // las anclas de estilo viajan como referencia a Gemini desde las funciones: public/ no se empaqueta por defecto
  outputFileTracingIncludes: {
    "/api/generate/**": ["./public/styles/*.jpg"],
    "/api/libro/**": ["./public/styles/*.jpg"],
    "/api/stripe/**": ["./public/styles/*.jpg"],
    "/api/dev": ["./public/styles/*.jpg"],
  },
  partialPrefetching: true,
  // flujo antiguo (16 oct, Álvaro): todo a /crear con 307, reversible; el código se queda. Su API (/api/pdf, /api/lead,
  // /api/books, /api/generate/sample…) responde 404 en el proxy también con la app abierta (lib/appOpen.ts, 26 oct)
  // desde el libro y el seguimiento, a otras páginas y webs solo va el dominio: la URL lleva la llave del libro o del
  // pedido (auditoría 26 oct, I22)
  headers() {
    const strict = [{ key: "Referrer-Policy", value: "strict-origin" }];
    return Promise.resolve([
      { source: "/crear", headers: strict },
      { source: "/seguimiento/:path*", headers: strict },
    ]);
  },
  redirects() {
    // los alias de vercel.app de producción, al dominio (lib/site.ts, I21); van primero
    return [...brandRedirects(), ...["/clasico", "/ilustrado", "/libro", "/gratis"].map((source) => ({ source, destination: "/crear", permanent: false }))];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
