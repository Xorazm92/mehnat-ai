"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Info } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Bosiladigan "risk darajasi" yorlig'i + izohlagich oyna.
//
// Foydalanuvchi yorliqni bosganda: risk darajasi NIMANI anglatishi,
// QAYSI belgilar shu darajani keltirib chiqargani va firmaning hozirgi
// holati tushunarli qilib ochib beriladi ("qop-qorong'i" bo'lmasligi uchun).
//
// MUHIM: risk darajasi — nazoratchi/admin qo'lda belgilaydigan maydon
// (firma tahriridan). U tranzaksiyalar tarixiga bog'lanmagan, shu bois
// bu yerda faqat mavjud, haqqoniy signallar ko'rsatiladi.
// ─────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

const RISK_META: Record<RiskLevel, { label: string; emoji: string; color: string; bg: string; border: string; desc: string }> = {
  low: {
    label: "Past risk",
    emoji: "🟢",
    color: "var(--success)",
    bg: "var(--success-bg)",
    border: "var(--success-border)",
    desc: "Firma barqaror: jiddiy qarzdorlik yoki kartoteka yo'q, hisobotlar o'z vaqtida topshirilyapti. Nazorat talab etmaydi.",
  },
  medium: {
    label: "O'rta risk",
    emoji: "🟡",
    color: "var(--warning)",
    bg: "var(--warning-bg)",
    border: "var(--warning-border)",
    desc: "E'tibor talab qilinadi: faoliyat vaqtincha to'xtatilgan yoki ba'zi ko'rsatkichlar yomonlashgan. Kuzatuvda tutish kerak.",
  },
  high: {
    label: "Yuqori risk",
    emoji: "🔴",
    color: "var(--danger)",
    bg: "var(--danger-bg)",
    border: "var(--danger-border)",
    desc: "Jiddiy muammo: qarzdorlik, kartoteka yoki muammoli status aniqlangan. Zudlik bilan ko'rib chiqish talab etiladi.",
  },
};

const STATUS_UZ: Record<string, string> = {
  active: "Faol",
  suspended: "To'xtatilgan",
  debtor: "Qarzdor",
  problem: "Muammoli",
  kartoteka: "Kartotekada",
};

/** Saqlangan riskLevel + companyStatus'dan amaldagi risk darajasini aniqlaydi
 *  (OrganizationModule.getRiskIndicator bilan bir xil mantiq). */
export function resolveRisk(riskLevel?: string | null, companyStatus?: string | null): RiskLevel {
  if (riskLevel === "high" || companyStatus === "problem" || companyStatus === "debtor") return "high";
  if (riskLevel === "medium" || companyStatus === "suspended") return "medium";
  return "low";
}

/** Shu darajaga OLIB KELGAN sabab (agar status bo'lsa — status, aks holda qo'lda belgilangan). */
function riskReason(level: RiskLevel, companyStatus?: string | null): string {
  if (companyStatus === "problem") return "Firma statusi «Muammoli» deb belgilangan.";
  if (companyStatus === "debtor") return "Firma statusi «Qarzdor» deb belgilangan.";
  if (companyStatus === "kartoteka") return "Firma hisobi kartotekada.";
  if (companyStatus === "suspended") return "Firma faoliyati vaqtincha to'xtatilgan.";
  if (level === "low") return "Muammoli status yo'q; risk nazoratchi tomonidan «past» deb baholangan.";
  return "Risk darajasi nazoratchi/admin tomonidan qo'lda belgilangan.";
}

interface Props {
  riskLevel?: string | null;
  companyStatus?: string | null;
  companyName?: string;
  /** Kichik (ixcham) yorliq — jadval/karta ichida. */
  compact?: boolean;
  className?: string;
}

const RiskBadge: React.FC<Props> = ({ riskLevel, companyStatus, companyName, compact, className }) => {
  const [open, setOpen] = useState(false);
  const level = resolveRisk(riskLevel, companyStatus);
  const meta = RISK_META[level];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Risk darajasi nimani anglatadi? — bosing"
        className={`inline-flex items-center gap-1 font-black uppercase tracking-widest rounded-lg shrink-0 transition-transform hover:scale-[1.03] ${compact ? "text-[9px] px-2 py-1" : "text-[10px] px-2.5 py-1.5"} ${className || ""}`}
        style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
      >
        <span>{meta.emoji}</span>
        <span>{meta.label}</span>
        <Info size={compact ? 10 : 12} style={{ opacity: 0.7 }} />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-auto rounded-2xl shadow-2xl"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--card-border)" }}>
              <div className="min-w-0">
                <h3 className="text-sm font-black flex items-center gap-2" style={{ color: "var(--text)" }}>
                  <span>{meta.emoji}</span> Risk darajasi: {meta.label}
                </h3>
                {companyName && (
                  <p className="text-[11px] font-bold mt-0.5 truncate" style={{ color: "var(--text-3, var(--text-muted))" }}>{companyName}</p>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70 shrink-0" style={{ color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Amaldagi daraja izohi */}
              <div className="rounded-xl px-4 py-3" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                <p className="text-[12px] leading-relaxed font-medium" style={{ color: "var(--text)" }}>{meta.desc}</p>
              </div>

              {/* Nima uchun shu daraja */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Nima uchun shu daraja?</p>
                <div className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-secondary, var(--text-2))" }}>
                  <Info size={14} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                  <span>{riskReason(level, companyStatus)}</span>
                </div>
                {companyStatus && companyStatus !== "active" && (
                  <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                    Hozirgi status: <span className="font-bold" style={{ color: meta.color }}>{STATUS_UZ[companyStatus] || companyStatus}</span>
                  </p>
                )}
              </div>

              {/* Barcha darajalar shkalasi */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Darajalar shkalasi</p>
                <div className="space-y-2">
                  {(["low", "medium", "high"] as RiskLevel[]).map((lv) => {
                    const m = RISK_META[lv];
                    const active = lv === level;
                    return (
                      <div key={lv} className="flex items-start gap-2.5 rounded-lg px-3 py-2" style={{ background: active ? m.bg : "var(--surface-2, var(--input-bg))", border: active ? `1px solid ${m.border}` : "1px solid transparent", opacity: active ? 1 : 0.75 }}>
                        <span className="text-[13px] leading-none mt-0.5">{m.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: m.color }}>{m.label}</p>
                          <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary, var(--text-2))" }}>{m.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[10px] leading-relaxed pt-1" style={{ color: "var(--text-muted)" }}>
                Risk darajasini nazoratchi yoki admin firma ma'lumotlaridan belgilaydi. «Qarzdor», «Muammoli» yoki «Kartoteka» statuslari darajani avtomatik oshiradi.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default RiskBadge;
