import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Chromium y puppeteer se cargan desde node_modules en tiempo de ejecución (PDF en servidor), no se empaquetan
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  partialPrefetching: true,
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
