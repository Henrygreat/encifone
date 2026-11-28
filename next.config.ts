import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal self-contained server bundle for the Docker image
  // (see Dockerfile) instead of requiring the full node_modules tree.
  output: "standalone",
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/*": ["./src/modules/finance/fonts/*"] },
  // Cache Components (Next 16's PPR successor) defaults to on in a fresh
  // scaffold, but it's built for mostly-static pages with islands of
  // dynamic data. This app is session/tenant-scoped on almost every route
  // (see docs/ARCHITECTURE.md §4) — prerendering isn't the right model
  // here, so it's off rather than sprinkling `"use cache"` boundaries
  // through pages that are dynamic by design.
  cacheComponents: false,
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
