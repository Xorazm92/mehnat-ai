"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Dashboard hududi uchun xato chegarasi.
 *
 * Bungacha har bir kabinet o'z ma'lumotini `.catch(() => nol qiymatlar)` bilan
 * yutib yuborardi — ya'ni baza yiqilganda ekran to'la nol ko'rsatardi, buxgalterga
 * esa `percent: 100` — "hammasi topshirilgan" deb YOLG'ON aytardi. Muddatlarni
 * nazorat qiladigan tizim uchun bu ma'lumot yo'qligidan battar: foydalanuvchi
 * "o'tib ketgan muddat yo'q" bilan "so'rov ishlamadi"ni ajrata olmasdi.
 *
 * Endi xato yuqoriga chiqadi va shu yerda ko'rinadi.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render failed:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div
        className="w-full max-w-md rounded-xl p-8 text-center"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          <AlertTriangle size={26} />
        </div>

        <h1
          className="text-lg font-semibold tracking-tight mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Ma&apos;lumot yuklanmadi
        </h1>

        <p
          className="text-body font-medium mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Ko&apos;rsatkichlarni olishda xatolik yuz berdi. Ekrandagi raqamlar
          to&apos;liq bo&apos;lmasligi mumkin, shuning uchun ular ko&apos;rsatilmadi —
          qayta urinib ko&apos;ring.
        </p>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-meta font-bold uppercase tracking-widest transition-all"
          style={{ background: "var(--brand)", color: "var(--on-brand, #fff)" }}
        >
          <RotateCw size={15} />
          Qayta urinish
        </button>

        {error.digest && (
          <p
            className="font-mono text-micro mt-5"
            style={{ color: "var(--text-muted)" }}
          >
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
