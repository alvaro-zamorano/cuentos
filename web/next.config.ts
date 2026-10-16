import type { NextConfig } from "next";

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
  // flujo antiguo (16 oct, Álvaro): todo a /crear con 307, reversible; el código se queda. /api/pdf y /api/lead, del
  // mismo flujo, siguen respondiendo pero nada de la web nueva los llama
  redirects() {
    return ["/clasico", "/ilustrado", "/libro", "/gratis"].map((source) => ({ source, destination: "/crear", permanent: false }));
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
