import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./telegram-app.css";

export const metadata: Metadata = {
  title: "ASRO",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/**
 * Telegram Mini App shell.
 *
 * Deliberately outside the (dashboard) group: no sidebar, no topbar. The screen
 * is ~380px wide inside Telegram and every pixel of app chrome is a pixel not
 * spent on the task.
 *
 * `telegram-web-app.js` injects both `window.Telegram.WebApp` (the handshake
 * reads `initData` from it) and the `--tg-theme-*` variables the stylesheet
 * builds on, so the app follows whatever theme the user set in Telegram rather
 * than fighting it.
 *
 * Strategiya `afterInteractive`: `beforeInteractive` faqat ILDIZ layout'da
 * ishlaydi, bu yerda yozilsa Next uni baribir kechiktirib yuklaydi — ya'ni
 * "kafolat" xayoliy bo'lardi. Shuning uchun handshake SDK'ni kutadi
 * (`waitForWebApp`) va bu yerda haqiqiy strategiya yoziladi.
 */
export default function TelegramAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tg-root">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      {children}
    </div>
  );
}
