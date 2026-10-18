import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/pending", destination: "/", permanent: false }];
  },
  // pdf-parse / pdfjs must not be webpack-bundled: the worker file and Node APIs break on Vercel otherwise.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/settings/hr": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "./node_modules/pdf-parse/**/*",
    ],
    "/*": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
  experimental: {
    // Visited and prefetched pages are reused from the client cache; every save clears it (refreshAll).
    staleTimes: {
      dynamic: 30,
      static: 120,
    },
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
