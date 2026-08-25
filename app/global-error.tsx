"use client";

import { useEffect } from "react";

/**
 * ILDIZ xato chegarasi — `app/layout.tsx` ning O'ZI yiqilganda ishlaydi.
 *
 * Guruh darajasidagi `error.tsx` fayllar ildiz layout ichida chiziladi,
 * shuning uchun layout yiqilsa (masalan `auth()` yoki shrift yuklovchisi)
 * ular ishlamaydi va foydalanuvchi Next'ning standart oq ekranini ko'radi.
 * Bu komponent o'z `<html>` va `<body>` ini chizadi — tokenlar mavjud
 * bo'lmasligi mumkin, shuning uchun ranglar shu yerda qat'iy yoziladi.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root] layout failed:", error);
  }, [error]);

  return (
    <html lang="uz">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F1116",
          color: "#D9DEE4",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            background: "#181C23",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 12,
            padding: 32,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Tizim ochilmadi
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#98A3AF", margin: "0 0 24px" }}>
            Sahifani yuklashda kutilmagan xatolik yuz berdi. Ma&apos;lumotlaringiz
            o&apos;zgarmadi.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#4FA3E3",
              color: "#06121C",
              border: "none",
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Qayta urinish
          </button>
          {error.digest && (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#727E8A", marginTop: 20 }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
