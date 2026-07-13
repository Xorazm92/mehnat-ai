import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Skrinshot dalillari (base64) Server Action orqali yuboriladi — standart 1MB
  // chegara ba'zi rasmlar uchun kam bo'lishi mumkin, shuning uchun oshiramiz.
  // Klient tomonda rasm siqiladi, bu faqat zaxira uchun keng chegara.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // Allow Next.js dev-only endpoints (incl. the HMR WebSocket) to be reached
  // through the Cloudflare quick tunnel. Without this, Next blocks cross-origin
  // requests to /_next/webpack-hmr and the tunnel returns a 502 on WS upgrade.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
