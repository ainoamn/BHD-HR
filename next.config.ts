import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/pending", destination: "/", permanent: false }];
  },
  // Keep pdf tooling external so webpack does not mangle pdfjs; only loaded when a PDF is uploaded.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
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
