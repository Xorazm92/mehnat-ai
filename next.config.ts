import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Allow Next.js dev-only endpoints (incl. the HMR WebSocket) to be reached
  // through the Cloudflare quick tunnel. Without this, Next blocks cross-origin
  // requests to /_next/webpack-hmr and the tunnel returns a 502 on WS upgrade.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
