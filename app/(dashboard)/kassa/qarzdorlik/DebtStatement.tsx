"use client";

// HISOB-KITOB VARAQASI — "shu mijoz bilan ahvolimiz qanday?"
//
// Beshta ustun va ular bir-birini almashtira olmaydi:
//   Boshi      — davr boshidagi sof qoldiq
//   Hisoblandi — davr ichida yozilgan xizmat haqi
//   To'landi   — davr ichida kelgan pul
//   Qarz/Avans — davr oxiridagi holat
//
// NEGA "HISOBLANDI" ALOHIDA HISOBLANADI: ikki kesim farqi o'z-o'zicha
// hisoblanma emas — u ikki narsaning yig'indisi (xizmat haqi qarzni
// oshiradi, to'lov kamaytiradi). Faqat farqni ko'rsatgan variant
// 01.08→07.08 juftligida "Hisoblandi −420 mln" degan ma'nosiz raqam
// berardi. Endi: hisoblanma = (yopilish − ochilish) + to'langan.
//
// QARZ VA AVANS ATAYIN ALOHIDA USTUN. Bitta mijozda bir shartnomada qarz,
// boshqasida avans bo'lishi mumkin (Alfraganus: doimiy xizmatda 8 mln qarz,
// bir martalikda 20 mln avans). Qo'shib yuborish "bu mijoz avans bergan"
// degan yolg'on xulosa berardi, holbuki doimiy xizmat bo'yicha u QARZDOR.
//
// MIJOZ BO'YICHA GURUHLANGAN. Shartnoma darajasi 251 qator beradi va uni
// bir ekranda o'qib bo'lmaydi; rahbarning savoli esa MIJOZ haqida.
// Shartnoma tafsiloti qatorni bosganda ochiladi.

import React, { useEffect, useMemo, useState } from "react";
import { Pagination, pageSlice } from "@/components/ui";
import { usePageSize } from "@/hooks/usePageSize";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { Money, StatStrip, type StatItem } from "@/components/ui";
import { Scale, Search, AlertTriangle, ChevronRight } from "lucide-react";

type Kind = "BK" | "RK" | "unknown";

interface Line {
  contractNumber: string | null;
  contractRaw: string | null;
  kind: Kind;
  kindLabel: string;
  ownFirmName: string | null;
  opening: number;
  accrued: number;
  debt: number;
  advance: number;
}

interface Customer {
  customerName: string;
  companyId: string | null;
  companyInn: string | null;
  opening: number;
  accrued: number;
  paid: number;
  debt: number;
  advance: number;
  lines: Line[];
}

export interface DebtStatementData {
  openingAsOf: string | null;
  closingAsOf: string | null;
  availableDates: string[];
  customers: Customer[];
  totals: { opening: number; accrued: number; paid: number; debt: number; advance: number };
  byKind: { kind: Kind; label: string; count: number; debt: number; advance: number; accrued: number }[];
  hasPayments: boolean;
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

const KIND_TONE: Record<Kind, string> = {
  BK: "var(--accent-blue)",
  RK: "var(--accent-green)",
  unknown: "var(--text-muted)",
};

export default function DebtStatement({ statement: s }: { statement: DebtStatementData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("debt");

  const setDate = (which: "dan" | "gacha", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(which, value.slice(0, 10));
    router.push(`${pathname}?${next.toString()}`);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.customers.filter((c) => {
      if (kind !== "all" && !c.lines.some((l) => l.kind === kind)) return false;
      if (!needle) return true;
      return (
        c.customerName.toLowerCase().includes(needle) ||
        (c.companyInn ?? "").includes(needle) ||
        c.lines.some((l) => (l.contractNumber ?? "").toLowerCase().includes(needle))
      );
    });
  }, [s.customers, q, kind]);

  const shown = pageSlice(rows, page, pageSize);
  // Qidiruv yoki kesim ro'yxatni qisqartirsa joriy sahifa yo'qolishi mumkin.
  useEffect(() => { setPage(1); }, [q, kind]);

  if (!s.closingAsOf) {
    return (
      <div className="rounded-xl p-4 text-meta" style={{ ...card, color: "var(--text-muted)" }}>
        Qarzdorlik kesimi hali import qilinmagan.
        <div className="text-micro mt-1">
          1C faylini <b>kassa/</b> ga qo&apos;ying va{" "}
          <b>npx tsx scripts/import-debt-snapshot.ts --apply</b> ni ishga tushiring.
        </div>
      </div>
    );
  }

  // RANG PUL YO'NALISHINI BILDIRADI (`components/ui/Money` izohi):
  // qarz — bizga kelishi kerak bo'lgan pul (chiqim tomoni emas, lekin
  // undirilmagani uchun "out" ohangida), avans va to'lov — kirgan pul.
  const cols: StatItem[] = [
    { label: "Boshi", value: s.totals.opening, tone: "neutral", hint: "Davr boshidagi sof qoldiq" },
    { label: "Hisoblandi", value: s.totals.accrued, tone: "auto", hint: "Davr ichida yozilgan xizmat haqi" },
    ...(s.hasPayments
      ? [{ label: "To'landi", value: s.totals.paid, tone: "in" as const, hint: "Davr ichida kelgan pul" }]
      : []),
    { label: "Qarz", value: s.totals.debt, tone: "out", hint: "Davr oxirida bizga qarzdor" },
    { label: "Avans", value: s.totals.advance, tone: "in", hint: "Davr oxirida oldindan to'langan" },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div className="flex items-center gap-2">
          <Scale size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Hisob-kitob varaqasi
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              {s.customers.length} mijoz · manba: 1C qarzdorlik kesimi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
          <select
            value={s.openingAsOf?.slice(0, 10) ?? ""}
            onChange={(e) => setDate("dan", e.target.value)}
            className="px-2 py-1 rounded-lg"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
          >
            {s.availableDates.map((d) => (
              <option key={d} value={d.slice(0, 10)}>{formatUzDate(d)}</option>
            ))}
          </select>
          <ChevronRight size={12} />
          <select
            value={s.closingAsOf.slice(0, 10)}
            onChange={(e) => setDate("gacha", e.target.value)}
            className="px-2 py-1 rounded-lg"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
          >
            {s.availableDates.map((d) => (
              <option key={d} value={d.slice(0, 10)}>{formatUzDate(d)}</option>
            ))}
          </select>
        </div>
      </div>

      <StatStrip items={cols} minWidth={130} />

      {s.totals.accrued < 0 && (
        <div
          className="px-3 py-2 flex items-start gap-2 text-micro"
          style={{ background: "var(--warning-bg)", color: "var(--warning)", borderBottom: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Hisoblanma manfiy. Bu odatda tanlangan ikki kesim bir davrga tegishli emasligini bildiradi —
            sanalarni tekshiring.
          </span>
        </div>
      )}

      {/* Filtr */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <button
          onClick={() => setKind("all")}
          className="px-2.5 py-1 rounded-lg text-micro font-semibold"
          style={kind === "all"
            ? { background: "var(--accent-blue)", color: "#fff" }
            : { background: "var(--input-bg)", color: "var(--text-secondary)" }}
        >
          Hammasi
        </button>
        {s.byKind.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k.kind)}
            className="px-2.5 py-1 rounded-lg text-micro font-semibold"
            style={kind === k.kind
              ? { background: KIND_TONE[k.kind], color: "#fff" }
              : { background: "var(--input-bg)", color: "var(--text-secondary)" }}
            title={`qarz ${formatNum(k.debt)} · avans ${formatNum(k.advance)}`}
          >
            {k.label} ({k.count})
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mijoz, STIR yoki shartnoma"
            className="px-2 py-1 rounded-lg text-micro w-56"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="table-sticky-head w-full text-meta">
          <thead>
            <tr style={{ background: "var(--input-bg)" }}>
              <th className="text-left p-2">Mijoz</th>
              <th className="text-right p-2">Boshi</th>
              <th className="text-right p-2">Hisoblandi</th>
              {s.hasPayments && <th className="text-right p-2">To&apos;landi</th>}
              <th className="text-right p-2">Qarz</th>
              <th className="text-right p-2">Avans</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const id = c.companyId ?? c.customerName;
              const isOpen = open === id;
              return (
                <React.Fragment key={id}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--input-bg)]"
                    style={{ borderTop: "1px solid var(--card-border)", background: isOpen ? "var(--input-bg)" : undefined }}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight
                          size={13}
                          style={{
                            color: "var(--text-muted)",
                            transform: isOpen ? "rotate(90deg)" : undefined,
                            transition: "transform .15s",
                          }}
                        />
                        <span className="truncate max-w-[280px]" title={c.customerName}>{c.customerName}</span>
                        {c.companyInn ? (
                          <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {c.companyInn}
                          </span>
                        ) : (
                          <span className="text-micro" style={{ color: "var(--warning)" }} title="Bazadagi firmaga bog'lanmagan">
                            ●
                          </span>
                        )}
                        {c.lines.length > 1 && (
                          <span className="text-micro" style={{ color: "var(--text-muted)" }}>
                            {c.lines.length} shartnoma
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right"><Money value={c.opening} tone="muted" dashIfZero /></td>
                    <td className="p-2 text-right"><Money value={c.accrued} tone="auto" dashIfZero /></td>
                    {s.hasPayments && (
                      <td className="p-2 text-right"><Money value={c.paid} tone="in" dashIfZero /></td>
                    )}
                    <td className="p-2 text-right"><Money value={c.debt} tone="out" dashIfZero bold /></td>
                    <td className="p-2 text-right"><Money value={c.advance} tone="in" dashIfZero bold /></td>
                  </tr>

                  {isOpen &&
                    c.lines.map((l, i) => (
                      <tr key={i} style={{ background: "var(--input-bg)" }}>
                        <td className="py-1.5 pl-9 pr-2">
                          <span style={{ color: "var(--text-secondary)" }}>{l.contractNumber ?? "Shartnomasiz"}</span>
                          <span
                            className="ml-1.5 px-1.5 py-0.5 rounded text-micro"
                            style={{ background: "var(--card-bg)", color: KIND_TONE[l.kind] }}
                          >
                            {l.kindLabel}
                          </span>
                          {l.ownFirmName && (
                            <span className="ml-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
                              {l.ownFirmName}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right text-micro"><Money value={l.opening} tone="muted" dashIfZero /></td>
                        <td className="py-1.5 px-2 text-right text-micro"><Money value={l.accrued} tone="muted" dashIfZero /></td>
                        {s.hasPayments && <td className="py-1.5 px-2 text-right text-micro" style={{ color: "var(--text-muted)" }}>—</td>}
                        <td className="py-1.5 px-2 text-right text-micro"><Money value={l.debt} tone="muted" dashIfZero /></td>
                        <td className="py-1.5 px-2 text-right text-micro"><Money value={l.advance} tone="muted" dashIfZero /></td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-micro"
        style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        <span>● belgisi bazadagi firmaga bog&apos;lanmaganini bildiradi</span>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        unit="mijoz"
      />
    </div>
  );
}
