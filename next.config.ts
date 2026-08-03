import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The Telegram webhook route (app/api/telegram/webhook) imports the BullMQ
  // producer. Keep these native-ish server deps out of the bundler so they load
  // via Node require at runtime.
  // `pino` ham shu ro'yxatda: u transport'ni dinamik `require` bilan yuklaydi,
  // bundler uni statik tahlil qila olmaydi va build'da "thread-stream" xatosi chiqadi.
  serverExternalPackages: ["bullmq", "ioredis", "pino"],
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

  // Security response headers applied to every route. These are intentionally
  // the "safe" set that never breaks rendering. A Content-Security-Policy is the
  // one high-value header left OFF here: the app renders base64 image data URLs
  // and heavy inline styles, so a strict CSP needs testing/nonces first. A
  // recommended starting policy is documented below — enable it after E2E test.
  async headers() {
    // Har ikki qoidada takrorlanadigan qism.
    const base = [
      // Force HTTPS for 2 years (ignored by browsers over plain HTTP).
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      // Stop MIME sniffing.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Leak only the origin (not the full path) on cross-origin navigations.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Drop powerful browser features the app does not use.
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ];

    return [
      {
        // `/telegram-app` DAN TASHQARI hamma yo'l — pastdagi izohga qarang.
        source: "/((?!telegram-app).*)",
        headers: [
          ...base,
          // Clickjacking protection — this ERP is never meant to be framed.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // Telegram Mini App ATAYIN freymlanadi: Telegram uni o'z sahifasida
        // iframe ichida ochadi. `X-Frame-Options: SAMEORIGIN` bu yerda ilovani
        // himoya qilmaydi — u shunchaki oynani BO'SH qoldiradi, chunki brauzer
        // boshqa domendagi freymda ko'rsatishni rad etadi.
        //
        // O'rniga `frame-ancestors`: XFO dan farqli, u kimga ruxsat berishni
        // ayta oladi, ya'ni himoya saqlanadi — sahifani faqat Telegram
        // freymlay oladi, boshqa hech kim emas. XFO qo'shilmaydi: ikkalasi
        // birga bo'lsa brauzerlar ko'proq cheklovchisini oladi va yana bo'sh
        // oyna chiqadi.
        source: "/telegram-app/:path*",
        headers: [
          ...base,
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://web.telegram.org https://*.telegram.org;",
          },
        ],
      },
      {
        // `/telegram-app` (ostki yo'lsiz) — yuqoridagi qoida uni qamramaydi.
        source: "/telegram-app",
        headers: [
          ...base,
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://web.telegram.org https://*.telegram.org;",
          },
        ],
      },
    ];
    // Recommended CSP once verified end-to-end (add to the headers array above):
    //   default-src 'self';
    //   script-src 'self' 'unsafe-inline';
    //   style-src 'self' 'unsafe-inline';
    //   img-src 'self' data: blob:;
    //   font-src 'self' data:;
    //   connect-src 'self';
    //   frame-ancestors 'none';
    //   base-uri 'self';
    //   form-action 'self';
  },
};

export default nextConfig;
