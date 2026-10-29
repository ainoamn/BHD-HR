import type { NextConfig } from "next";

/** Allow the live identity script, catalog, and icons (docs/BHD-CURSOR-PRODUCT-WIRE.md). */
const IDENTITY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://id.bhd-om.com",
  "connect-src 'self' https://id.bhd-om.com https://*.bhd-om.com https: wss:",
  "img-src 'self' data: blob: https://id.bhd-om.com https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/pending", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: IDENTITY_CSP }],
      },
    ];
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
