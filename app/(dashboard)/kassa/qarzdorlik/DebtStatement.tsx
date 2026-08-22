"use client";

// HISOB-KITOB VARAQASI — "shu mijoz bilan ahvolimiz qanday?"
//
// Besh ustun, va ular bir-birini almashtira olmaydi:
//   Boshi      — oy boshidagi sof qoldiq
//   Hisoblandi — shu oyning xizmat haqi
//   Qarz       — oy oxirida bizga qarzdor
//   Avans      — oy oxirida oldindan to'langan
//   Sof        — qarz − avans
//
// QARZ VA AVANS ATAYIN ALOHIDA. Bitta mijozda bir shartnomada qarz,
// boshqasida avans bo'lishi mumkin (Alfraganus: doimiy xizmatda 8 mln qarz,
// bir martalikda 20 mln avans). Ularni bitta raqamga qo'shib yuborish
// "bu mijoz bizga 12 mln avans bergan" degan yolg'on xulosa berardi,
// holbuki doimiy xizmat bo'yicha u QARZDOR va uni undirish kerak.
//
// SHARTNOMA TURI ham alohida ko'rsatiladi: BK — doimiy oylik xizmat,
// RK — bir martalik ish (masalan buxgalteriyani tartibga solish). Ikkalasini
// qo'shib "tushum" deb ko'rsatish oylik barqaror daromadni ko'p ko'rsatardi.

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { formatNum, formatUzDate } from "@/lib/format";
import { Scale, Search, AlertTriangle } from "lucide-react";

type Kind = "BK" | "RK" | "unknown";

interface Line {
  customerName: string;
  companyInn: string | null;
  companyId: string | null;
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

interface Props {
  statement: {
    openingAsOf: string | null;
    closingAsOf: string | null;
    availableDates: string[];
    lines: Line[];
    totals: { opening: number; accrued: number; debt: number; advance: number };
    byKind: { kind: Kind; label: string; count: number; debt: number; advance: number; accrued: number }[];
  };
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

const KIND_TONE: Record<Kind, string> = {
  BK: "var(--accent-blue)",
  RK: "var(--accent-green)",
  unknown: "var(--text-muted)",
};

export default function DebtStatement({ statement: s }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");

  const setDate = (which: "dan" | "gacha", value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(which, value.slice(0, 10));
    router.push(`${pathname}?${next.toString()}`);
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.lines.filter(
      (l) =>
        (kind === "all" || l.kind === kind) &&
        (!needle ||
          l.customerName.toLowerCase().includes(needle) ||
          (l.contractNumber ?? "").toLowerCase().includes(needle))
    );
  }, [s.lines, q, kind]);

  const shown = rows.slice(0, 200);
  const net = s.totals.debt - s.totals.advance;

  if (!s.closingAsOf) {
    return (
      <div className="rounded-xl p-4 text-meta" style={{ ...card, color: "var(--text-muted)" }}>
        Qarzdorlik kesimi hali import qilinmagan.
        <br />
        <span className="text-micro">
          1C dan olingan faylni <b>kassa/</b> papkasiga qo&apos;ying va{" "}
          <b>npx tsx scripts/import-debt-snapshot.ts --apply</b> ni ishga tushiring.
        </span>
      </div>
    );
  }

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
              Manba: 1C qarzdorlik kesimi · shartnoma darajasida
            </p>
          </div>
        </div>
        <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--text)" }}>
          Sof qoldiq: {formatNum(net)} so&apos;m
        </span>
      </div>

      {/* Qaysi ikki kesim solishtirilyapti — ATAYIN ko'rinadigan joyda.
          Noto'g'ri juftlikda "hisoblandi" manfiy chiqadi va buni faqat
          sanalar ko'rinib tursagina sezish mumkin. */}
      <div
        className="px-3 py-2 flex items-center gap-2 flex-wrap text-micro"
        style={{ borderBottom: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        <span>Solishtirilmoqda:</span>
        <select
          value={s.openingAsOf?.slice(0, 10) ?? ""}
          onChange={(e) => setDate("dan", e.target.value)}
          className="px-2 py-1 rounded-lg text-micro"
          style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
        >
          {s.availableDates.map((d) => (
            <option key={d} value={d.slice(0, 10)}>
              {formatUzDate(d)}
            </option>
          ))}
        </select>
        <span>→</span>
        <select
          value={s.closingAsOf.slice(0, 10)}
          onChange={(e) => setDate("gacha", e.target.value)}
          className="px-2 py-1 rounded-lg text-micro"
          style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
        >
          {s.availableDates.map((d) => (
            <option key={d} value={d.slice(0, 10)}>
              {formatUzDate(d)}
            </option>
          ))}
        </select>
        {s.totals.accrued < 0 && (
          <span className="flex items-center gap-1" style={{ color: "var(--warning)" }}>
            <AlertTriangle size={12} />
            Hisoblanma manfiy — sanalar juftligi noto&apos;g&apos;ri bo&apos;lishi mumkin
          </span>
        )}
      </div>

      {/* Jamilar */}
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderBottom: "1px solid var(--card-border)" }}>
        {[
          { label: "Boshi", value: s.totals.opening, tone: "var(--text-secondary)" },
          { label: "Hisoblandi", value: s.totals.accrued, tone: "var(--accent-blue)" },
          { label: "Qarz", value: s.totals.debt, tone: "var(--accent-red)" },
          { label: "Avans", value: s.totals.advance, tone: "var(--accent-green)" },
        ].map((c) => (
          <div key={c.label} className="px-3 py-2" style={{ borderRight: "1px solid var(--card-border)" }}>
            <div className="text-micro font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {c.label}
            </div>
            <div className="text-meta font-semibold tabular-nums" style={{ color: c.tone }}>
              {formatNum(c.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Shartnoma turi */}
      <div className="px-3 py-2 flex flex-wrap gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <button
          onClick={() => setKind("all")}
          className="px-2.5 py-1 rounded-lg text-micro font-semibold"
          style={
            kind === "all"
              ? { background: "var(--accent-blue)", color: "#fff" }
              : { background: "var(--input-bg)", color: "var(--text-secondary)" }
          }
        >
          Hammasi ({s.lines.length})
        </button>
        {s.byKind.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKind(k.kind)}
            className="px-2.5 py-1 rounded-lg text-micro font-semibold"
            style={
              kind === k.kind
                ? { background: KIND_TONE[k.kind], color: "#fff" }
                : { background: "var(--input-bg)", color: "var(--text-secondary)" }
            }
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
            placeholder="Mijoz yoki shartnoma"
            className="px-2 py-1 rounded-lg text-micro"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-meta">
          <thead>
            <tr style={{ background: "var(--input-bg)" }}>
              <th className="text-left p-2">Mijoz</th>
              <th className="text-left p-2">Shartnoma</th>
              <th className="text-left p-2">Firma</th>
              <th className="text-right p-2">Boshi</th>
              <th className="text-right p-2">Hisoblandi</th>
              <th className="text-right p-2">Qarz</th>
              <th className="text-right p-2">Avans</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={`${l.customerName}-${l.contractRaw}-${l.ownFirmName}-${i}`} style={{ borderTop: "1px solid var(--card-border)" }}>
                <td className="p-2 max-w-[240px] truncate" title={l.customerName}>
                  {l.customerName}
                  {l.companyInn ? (
                    <span className="ml-1.5 text-micro tabular-nums" style={{ color: "var(--text-muted)" }} title="Bog'langan firmaning STIRi">
                      {l.companyInn}
                    </span>
                  ) : (
                    <span className="ml-1 text-micro" style={{ color: "var(--warning)" }} title="Bazadagi firmaga bog'lanmagan">
                      ●
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">
                  <span style={{ color: "var(--text-secondary)" }}>{l.contractNumber ?? "—"}</span>
                  <span
                    className="ml-1.5 px-1.5 py-0.5 rounded text-micro"
                    style={{ background: "var(--input-bg)", color: KIND_TONE[l.kind] }}
                  >
                    {l.kindLabel}
                  </span>
                </td>
                <td className="p-2 max-w-[150px] truncate" style={{ color: "var(--text-muted)" }} title={l.ownFirmName ?? ""}>
                  {l.ownFirmName ?? "—"}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {l.opening ? formatNum(l.opening) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums" style={{ color: l.accrued < 0 ? "var(--warning)" : "var(--text-secondary)" }}>
                  {l.accrued ? formatNum(l.accrued) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums font-semibold" style={{ color: l.debt ? "var(--accent-red)" : "var(--text-muted)" }}>
                  {l.debt ? formatNum(l.debt) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums font-semibold" style={{ color: l.advance ? "var(--accent-green)" : "var(--text-muted)" }}>
                  {l.advance ? formatNum(l.advance) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length && (
        <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)" }}>
          {rows.length} qatordan {shown.length} tasi ko&apos;rsatildi — qidiruvdan foydalaning.
        </p>
      )}
      <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}>
        Nom yonidagi raqam — bog&apos;langan firmaning STIRi. ● belgisi bog&apos;lanmaganini bildiradi.
      </p>
    </div>
  );
}
