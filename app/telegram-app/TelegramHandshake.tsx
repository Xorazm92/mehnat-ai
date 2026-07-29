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
      const webApp = window.Telegram?.WebApp;
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
