import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/pending", destination: "/", permanent: false }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
