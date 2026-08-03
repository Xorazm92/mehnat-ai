"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

/** Telegram Mini App SDK'ning bizga kerak bo'lgan qismi. */
interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * `telegram-web-app.js` yuklanishini kutadi.
 *
 * Skript `layout.tsx` da `beforeInteractive` bilan qo'yilgan, LEKIN Next.js bu
 * strategiyani faqat ILDIZ layout'da qo'llaydi — ichki layout'da u kechiktirib
 * yuklanadi. Ya'ni bu effekt `window.Telegram` hali yo'q paytda ishga tushishi
 * mumkin va foydalanuvchi Telegram ichida turib "Telegramda oching" xabarini
 * olardi. Shuning uchun mavjudligini tekshiramiz, taxmin qilmaymiz.
 */
async function waitForWebApp(timeoutMs = 5000): Promise<TelegramWebApp | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // `initData` bo'sh satr bo'lishi ham mumkin (Telegramdan tashqarida
    // ochilgan) — shuning uchun SDK'ning o'zi paydo bo'lishini kutamiz.
    if (window.Telegram?.WebApp) return window.Telegram.WebApp;
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.Telegram?.WebApp;
}

/**
 * Bir martalik almashuv: Telegram bergan `initData` NextAuth "telegram"
 * provider'iga uzatiladi, u imzoni tekshirib odatdagi sessiya cookie'sini
 * qo'yadi. Shundan keyin qolgan ekranlar oddiy himoyalangan sahifalar.
 *
 * Bu ekran hech qachon uzoq turmasligi kerak — ko'rinsa, demak kirish
 * muvaffaqiyatsiz tugagan va sabab yozilgan.
 */
export default function TelegramHandshake({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Butun oqim bitta async funksiyada: shu tufayli holat hech qachon effekt
    // tanasida sinxron o'rnatilmaydi (kaskadli render sababi).
    const run = async () => {
      const webApp = await waitForWebApp();
      if (cancelled) return;
      webApp?.ready?.();
      webApp?.expand?.();

      const initData = webApp?.initData;
      if (!initData) {
        if (!cancelled) {
          setError("Bu sahifa Telegram ichida ochilishi kerak. Botdagi tugmadan foydalaning.");
        }
        return;
      }

      try {
        const res = await signIn("telegram", { initData, redirect: false });
        if (cancelled) return;
        if (res?.error || res?.ok === false) {
          // Bitta umumiy xabar: qaysi bosqichda to'xtagani (imzo/muddat/
          // bog'lanmagan) oshkor qilinmaydi.
          setError("Kirib bo'lmadi. Avval botda /start bosib, telefon raqamingizni yuboring.");
          return;
        }
        window.location.replace(next);
      } catch {
        if (!cancelled) setError("Tarmoq xatosi. Qayta urinib ko'ring.");
      }
    };

    void Promise.resolve().then(run);
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="tg-center">
      {error ? (
        <>
          <div className="tg-h1">Kirish amalga oshmadi</div>
          <p className="tg-hint">{error}</p>
        </>
      ) : (
        <>
          <div className="tg-h1">ASRO</div>
          <p className="tg-hint">Kirilmoqda…</p>
        </>
      )}
    </div>
  );
}
