import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/@me',
        destination: '/me',
      },
      {
        source: '/@me/:path*',
        destination: '/me/:path*',
      },
    ];
  },
};

export default nextConfig;
