"use client";

// KASSALAR JADVALI — auditning markaziy jadvali.
//
// Har kassa bo'yicha: ochilish → kirim → chiqim → yopilish. Manba jurnal
// (server/kassaReport.ts), ya'ni raqamlar balans bilan bir joydan keladi.
//
// UCH XIL KASSA UCH XIL TABDA. Ilgari hammasi bitta ro'yxatda edi va 46 ta
// xodim kartasi bank hisoblarini ko'mib tashlardi — foydalanuvchi "nega
// buncha 0 so'mlik kassa bor?" deb so'rardi. Endi:
//   · Asosiy kassalar — bank hisoblari, naqd seyf, plastik terminal
//   · Xodim kartalari — tranzit (pul berilgan, lekin hali xarajat emas)
//   · Kanalsiz       — eski yozuvlar, pul qaysi kassada ekani noma'lum
//
// "Kanali ko'rsatilmagan" qatori ATAYIN yo'qolmaydi va JAMI QOLDIQ har doim
// hamma kanalni qamrab oladi: uni yashirish jadvalni chiroyli, lekin yolg'on
// qilardi — jami balansga to'g'ri kelmasdi.
//
// Harakatsiz kassalar (ochilish/kirim/chiqim/qoldiq — hammasi nol) standart
// holatda YASHIRIN, chunki ular hech qanday ma'lumot bermaydi. Ular soni
// tugmada ko'rinib turadi, ya'ni yashiringani sir emas.

import React, { useMemo, useState } from "react";
import { formatNum } from "@/lib/format";
import { Wallet, AlertTriangle, Eye, EyeOff } from "lucide-react";

interface Row {
  channelId: string | null;
  label: string;
  type?: string | null;
  typeLabel: string;
  detail: string | null;
  opening: number;
  income: number;
  outflow: number;
  closing: number;
  isActive: boolean;
  transitBalance: number | null;
}

interface Props {
  report: {
    period: string;
    rows: Row[];
    totals: { opening: number; income: number; outflow: number; closing: number };
    unassigned: number;
  };
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

type TabKey = "main" | "cards" | "orphan";

/** Qatorda umuman harakat va qoldiq yo'qmi. */
const isDormant = (r: Row) =>
  r.opening === 0 && r.income === 0 && r.outflow === 0 && r.closing === 0;

const sumOf = (rows: Row[]) => ({
  opening: rows.reduce((s, r) => s + r.opening, 0),
  income: rows.reduce((s, r) => s + r.income, 0),
  outflow: rows.reduce((s, r) => s + r.outflow, 0),
  closing: rows.reduce((s, r) => s + r.closing, 0),
});

export default function CashDeskTable({ report }: Props) {
  const { rows, totals } = report;
  const [tab, setTab] = useState<TabKey>("main");
  const [showDormant, setShowDormant] = useState(false);

  const groups = useMemo(() => {
    const main: Row[] = [];
    const cards: Row[] = [];
    const orphan: Row[] = [];
    for (const r of rows) {
      if (r.channelId === null) orphan.push(r);
      else if (r.type === "employee_card") cards.push(r);
      else main.push(r);
    }
    return { main, cards, orphan };
  }, [rows]);

  const tabs: { key: TabKey; label: string; rows: Row[] }[] = [
    { key: "main", label: "Asosiy kassalar", rows: groups.main },
    { key: "cards", label: "Xodim kartalari", rows: groups.cards },
    ...(groups.orphan.length > 0
      ? [{ key: "orphan" as TabKey, label: "Kanalsiz", rows: groups.orphan }]
      : []),
  ];

  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  const dormantCount = active.rows.filter(isDormant).length;
  const visible = showDormant ? active.rows : active.rows.filter((r) => !isDormant(r));
  const subtotal = sumOf(active.rows);

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-2">
          <Wallet size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Kassalar — {report.period}
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Har kassa bo&apos;yicha ochilish, harakat va qoldiq · manba: ikki tomonlama jurnal
            </p>
          </div>
        </div>
        {/* JAMI QOLDIQ har doim HAMMA kanal bo'yicha — tab tanlovi uni
            o'zgartirmaydi, aks holda raqam balansga to'g'ri kelmasdi. */}
        <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--text)" }}>
          Jami qoldiq (hamma kassa): {formatNum(totals.closing)} so&apos;m
        </span>
      </div>

      {report.unassigned !== 0 && (
        <div
          className="px-3 py-2 flex items-start gap-2 text-micro"
          style={{
            background: "var(--input-bg)",
            borderBottom: "1px solid var(--card-border)",
            color: "var(--text-muted)",
          }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            {/* ILGARI BU OGOHLANTIRISH XATO DEB O'QILARDI. Aslida bu summaning
                deyarli hammasi SHARTNOMA TO'LOVLARI: `upsertPayment` pul qaysi
                hisobga tushganini bilmaydi (unda faqat `paymentMethod` bor),
                shuning uchun jurnalga kanalsiz yoziladi — bu kutilgan holat,
                buzilish emas (`lib/ledger.ts` ACCOUNT_SPEC izohi). */}
            {formatNum(report.unassigned)} so&apos;m kanalsiz yozilgan — asosan
            shartnoma to&apos;lovlari: ular qaysi hisobga tushgani jurnalda
            ko&apos;rsatilmaydi. Bu buzilish emas; kanal backfilli tugagach
            kamayadi.
          </span>
        </div>
      )}

      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-2.5 py-1 rounded-lg text-micro font-semibold whitespace-nowrap"
              style={
                t.key === active.key
                  ? { background: "var(--accent-blue)", color: "#fff" }
                  : { background: "var(--input-bg)", color: "var(--text-secondary)" }
              }
            >
              {t.label} ({t.rows.length})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
            Bo&apos;lim qoldig&apos;i: <b style={{ color: "var(--text)" }}>{formatNum(subtotal.closing)}</b>
          </span>
          {dormantCount > 0 && (
            <button
              onClick={() => setShowDormant((v) => !v)}
              className="flex items-center gap-1 text-micro"
              style={{ color: "var(--text-muted)" }}
            >
              {showDormant ? <EyeOff size={12} /> : <Eye size={12} />}
              {showDormant ? "Harakatsizlarni yashirish" : `Harakatsiz ${dormantCount} ta`}
            </button>
          )}
        </div>
      </div>

      {tab === "cards" && (
        <p className="px-3 py-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
          Kartadagi pul hali XARAJAT EMAS — u tranzit qoldig&apos;i. Xarajatga aylantirish
          uchun /kassa/chiqim bo&apos;limidagi &quot;Xarajat yozish&quot; ishlatiladi.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-meta">
          <thead>
            <tr style={{ background: "var(--table-header-bg)" }}>
              {["Kassa", "Turi", "Ochilish", "Kirim", "Chiqim", "Qoldiq"].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${
                    i >= 2 ? "text-right" : "text-left"
                  }`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center" style={{ color: "var(--text-muted)" }}>
                  {active.rows.length === 0
                    ? "Bu bo'limda kassa yo'q."
                    : "Hamma kassa harakatsiz — ko'rish uchun yuqoridagi tugmani bosing."}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const orphan = r.channelId === null;
                // Karta uchun jurnal va tranzit daftari MUSTAQIL ikki o'lchov.
                // Farq bo'lsa — karta xarajati kassaga bog'lanmagan.
                const mismatch =
                  r.transitBalance !== null && Math.abs(r.transitBalance - r.closing) > 1;
                return (
                  <tr
                    key={r.channelId ?? "none"}
                    style={{
                      borderTop: "1px solid var(--card-border)",
                      background: orphan ? "var(--warning-bg)" : undefined,
                      opacity: r.isActive || orphan ? 1 : 0.55,
                    }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold" style={{ color: "var(--text)" }}>
                        {r.label}
                        {!r.isActive && !orphan && (
                          <span className="ml-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
                            (muzlatilgan)
                          </span>
                        )}
                      </div>
                      {r.detail && (
                        <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                          {r.detail}
                        </div>
                      )}
                      {mismatch && (
                        <div className="text-micro" style={{ color: "var(--danger)" }}>
                          Tranzit daftari: {formatNum(r.transitBalance ?? 0)} — farq{" "}
                          {formatNum((r.transitBalance ?? 0) - r.closing)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {r.typeLabel}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatNum(r.opening)}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: "var(--success)" }}
                    >
                      {r.income ? "+" + formatNum(r.income) : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: "var(--danger)" }}
                    >
                      {r.outflow ? "−" + formatNum(r.outflow) : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: r.closing < 0 ? "var(--danger)" : "var(--text)" }}
                    >
                      {formatNum(r.closing)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr
              style={{ borderTop: "2px solid var(--card-border)", background: "var(--table-header-bg)" }}
            >
              <td className="px-3 py-2 font-semibold" style={{ color: "var(--text)" }} colSpan={2}>
                {active.label} — jami
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatNum(subtotal.opening)}
              </td>
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold"
                style={{ color: "var(--success)" }}
              >
                +{formatNum(subtotal.income)}
              </td>
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold"
                style={{ color: "var(--danger)" }}
              >
                −{formatNum(subtotal.outflow)}
              </td>
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold"
                style={{ color: "var(--text)" }}
              >
                {formatNum(subtotal.closing)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
