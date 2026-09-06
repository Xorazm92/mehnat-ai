"use client";

// =====================================================
// SUHBATDA YARATILGAN TAVSIYALAR (M5.3)
// =====================================================
// Bu ro'yxat QAROR QABUL QILMAYDI — ataylab. Qabul/rad ikki narsani talab
// qiladi: direktor darvozasi (`canDirectorCockpit`) va MAJBURIY sabab.
// Ikkalasini yordamchi panelida takrorlash "qaror qabul qilinadigan ikkinchi
// joy" yaratardi, va u albatta birinchisidan farq qila boshlardi (M4 da
// darvoza allaqachon bir marta ikkiga bo'linib ketgan edi). Shuning uchun
// bu yerda faqat "navbatga nima tushdi" ko'rsatiladi va kokpitga havola
// beriladi.
//
// `created: false` — takror: shu firma va tur bo'yicha pending tavsiya
// allaqachon bor. Bu XATO EMAS, shuning uchun qizil rang berilmaydi —
// foydalanuvchiga "yangi qo'shilmadi" deb aytish kifoya.
import Link from "next/link";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import type { CreatedRecommendation } from "@/lib/ai/tools";

export default function RecommendationList({ items }: { items: CreatedRecommendation[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2 space-y-1.5" style={{ borderTop: "1px solid var(--card-border)" }}>
      <p className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Navbatga qo&apos;yilgan tavsiya
      </p>
      {items.map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
          style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
        >
          <ClipboardCheck size={13} className="mt-0.5 shrink-0" style={{ color: "var(--accent-purple)" }} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {r.label}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}> · {r.companyName}</span>
            </span>
            <span className="block text-micro" style={{ color: "var(--text-secondary)" }}>
              {r.rationale}
            </span>
            {!r.created && (
              <span className="block text-micro" style={{ color: "var(--text-muted)" }}>
                Allaqachon navbatda edi — yangi tavsiya qo&apos;shilmadi.
              </span>
            )}
          </span>
        </div>
      ))}
      <Link
        href="/dashboard?tab=kokpit"
        className="inline-flex items-center gap-1 text-micro font-semibold"
        style={{ color: "var(--accent-blue)" }}
      >
        Kokpitda qaror qabul qilish <ArrowRight size={11} />
      </Link>
    </div>
  );
}
