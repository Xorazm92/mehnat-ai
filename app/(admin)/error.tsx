"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Admin hududi uchun xato chegarasi.
 *
 * Bungacha `(admin)` guruhida chegara YO'Q edi: bu yerdagi xato butun
 * ildizga ko'tarilib, Next'ning standart ingliz tilidagi xato ekranini
 * chiqarardi — o'zbek tilidagi tizimda, hech qanday qaytish yo'lisiz.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] render failed:", error);
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

        <h1 className="text-lg font-semibold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
          Admin sahifasi ochilmadi
        </h1>

        <p className="text-body font-medium mb-6" style={{ color: "var(--text-secondary)" }}>
          Sozlamalarni olishda xatolik yuz berdi. Hech narsa o&apos;zgartirilmadi —
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
          <p className="font-mono text-micro mt-5" style={{ color: "var(--text-muted)" }}>
            {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
