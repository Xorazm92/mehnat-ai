"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import CollectionQueue from "./CollectionQueue";
import DebtStatement, { type DebtStatementData } from "./DebtStatement";
import { Tabs, StatStrip, type TabItem } from "@/components/ui";
import { useTabParam, useUrlParam } from "@/hooks/useTabParam";
import { QARZDORLIK_TAB_IDS, QARZDORLIK_DEFAULT_TAB, type QarzdorlikTab } from "@/lib/qarzdorlikTabs";
import { DEBT_AGING_STAGES, debtAgingStage, type DebtAgingStage } from "@/lib/debtAging";
import { useRouter } from "next/navigation";
import KassaModule from "@/components/KassaModule";
import { upsertPayment, deletePayment } from "@/server/kassa";
import type { Company, Payment } from "@/types";

/** companyId → serverda hisoblangan qarz (`lib/debt.ts`). Klient hech narsa
    hisoblamaydi, faqat ko'rsatadi. */
type DebtByCompany = Record<string, { dueNow: number; overdue: number; outstanding: number }>;

interface DebtRow {
  key: string;
  customer: string;
  contract: string | null;
  ownFirm: string | null;
  debt1C: number;
  debtAsro: number | null;
  diff: number | null;
  linked: boolean;
}

interface PlanFactRow {
  period: string;
  metric: string;
  plan: string | number | null;
  fact: string | number | null;
}

interface ReconCheck {
  key: string;
  title: string;
  status: "ok" | "warn" | "error";
  value: number;
  detail: string;
  action?: string;
}

/** To'lamagan firma — `lib/debt.ts` `DebtorRow` ning serializatsiyalangan shakli. */
interface DebtorRow {
  companyId: string;
  name: string;
  inn: string;
  contractAmount: number;
  charged: number;
  paid: number;
  outstanding: number;
  overdue: number;
  dueNow: number;
  monthsOverdue: number;
  /** Eng eski to'lanmagan hisob muddatidan beri o'tgan kunlar (`lib/debt.ts`). */
  overdueDays: number;
  lastPaidPeriod: string | null;
  accountantName: string | null;
  supervisorName: string | null;
  contactedAt?: string | null;
  nextContactAt?: string | null;
  contactNote?: string | null;
}

interface Props {
  debt: {
    asOf: string | null;
    rows: DebtRow[];
    totals: { debt1C: number; debtAsro: number; diff: number };
    unlinked: number;
  };
  /** To'lamagan firmalar — direktorning kunlik hisoboti bilan bir manbadan. */
  debtors: {
    rows: DebtorRow[];
    totals: {
      companies: number;
      overdue: number;
      dueNow: number;
      outstanding: number;
      overdueCompanies: number;
      neverPaid: number;
    };
  };
  /** `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun). */
  initialTab?: QarzdorlikTab;
  /** `?bosqich=` / `?kesim=` / `?q=` — ular ham SERVERDA o'qiladi. */
  initialStage?: string;
  initialFocus?: string;
  initialQuery?: string;
  /** "Bugun gaplashish kerak" navbati — `getCollectionQueue`. */
  queue: {
    rows: DebtorRow[];
    totals: { companies: number; overdue: number; dueNow: number; neverContacted: number };
  };
  /** Firmalar bo'yicha oylik to'lovlar — `/kassa` dan ko'chirildi. */
  companies: Company[];
  payments: Payment[];
  debtByCompany: DebtByCompany;
  planFact: PlanFactRow[];
  /** Hisob-kitob varaqasi — 1C kesimlaridan. */
  statement?: DebtStatementData | null;
  /** Sverka — moliyaviy invariantlar. Faqat adminda to'ladi. */
  recon?: ReconCheck[];
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

/**
 * Bosqich ta'rifi `lib/debtAging.ts` da — ekran, `lib/debt.ts` va
 * direktorning kunlik hisoboti bir manbadan o'qiydi. Ilgari chegaralar
 * shu faylda QAYTA yozilgan edi va izoh "aynan bir xil bo'lishi kerak"
 * deb ogohlantirardi; ogohlantirish kerak bo'lishining o'zi ajralib
 * ketish xavfi edi.
 */

export default function QarzdorlikClient({
  debt,
  debtors,
  queue,
  companies,
  payments,
  debtByCompany,
  planFact,
  recon = [],
  statement,
  initialTab = QARZDORLIK_DEFAULT_TAB,
  initialStage = "",
  initialFocus = "",
  initialQuery = "",
}: Props) {
  const router = useRouter();

  // TAB — sahifada to'qqizta blok bor edi va ularning hammasi bir vertikalda
  // turardi. Foydalanuvchi "kim qarzdor?" degan savol bilan kelib, undirish
  // ro'yxatiga yetish uchun sverka, reja/fakt va 1C solishtiruvidan o'tishi
  // kerak edi. Endi har tab BITTA savolga javob beradi.
  // `components/ui/Tabs` — WAI-ARIA naqshi bilan. Qo'lda yozilgan tugmalar
  // qatorida `role="tablist"` bo'lmaydi: ekran o'quvchi ularni oddiy tugma
  // deb o'qiydi va strelka bilan yurib bo'lmaydi.
  // Yorliq URL'da: nazoratchi "undirish kerak bo'lganlarni ko'r" deb
  // `/kassa/qarzdorlik?tab=undirish` havolasini yuborishi mumkin va F5
  // bosilganda holat yo'qolmaydi. Ilgari bu oddiy `useState` edi.
  const [tab, setTab] = useTabParam<QarzdorlikTab>("tab", QARZDORLIK_TAB_IDS, initialTab);
  const TAB_ITEMS: TabItem<QarzdorlikTab>[] = [
    { id: "undirish", label: "Undirish", hint: "Bugun kim bilan gaplashish kerak", count: queue.rows.length || undefined },
    { id: "holat", label: "Hisob-kitob", hint: "1C kesimi bilan yonma-yon solishtirish" },
    { id: "tolovlar", label: "To'lovlar", hint: "Firmalar bo'yicha oylik to'lovlar" },
    { id: "tekshiruv", label: "Tekshiruv", hint: "Import nomuvofiqliklari va 1C solishtiruvi" },
  ];
  useAutoRefresh();
  const [query, setQuery] = useState("");
  // Farqi bor qatorlar tepada — aynan ular e'tibor talab qiladi.
  const [onlyDiff, setOnlyDiff] = useState(false);
  // FILTR VA QIDIRUV URL'DA. Ilgari ikkalasi ham lokal `useState` edi:
  // "11-30 kunlik qarzdorlarni ko'r" deb havola yuborib bo'lmasdi va F5
  // bosilganda tanlov yo'qolardi. Yorliq allaqachon URL'da edi — ya'ni
  // holatning yarmi ulashiladigan, yarmi yo'q edi.
  const [debtorQuery, setDebtorQuery] = useUrlParam("q", initialQuery);
  // Bosqich filtri — kartani bosganda jadval o'sha bosqichga qisqaradi.
  const [stageParam, setStageParam] = useUrlParam("bosqich", initialStage);
  const stageFilter = (DEBT_AGING_STAGES.some((x) => x.key === stageParam) ? stageParam : null) as DebtAgingStage | null;
  const setStageFilter = (next: DebtAgingStage | null) => setStageParam(next ?? "");

  /**
   * "Muddati o'tgan" va "Hech to'lamagan" ko'rsatkichlari ham FILTR.
   * Ta'riflar `getDebtors` dagi jamlar bilan AYNAN bir xil — aks holda
   * bosilgan raqam va chiqqan ro'yxat mos kelmasdi.
   */
  const [focusParam, setFocusParam] = useUrlParam("kesim", initialFocus);
  const focus = focusParam === "overdue" || focusParam === "neverPaid" ? focusParam : null;
  const toggleFocus = (next: "overdue" | "neverPaid") => setFocusParam(focus === next ? "" : next);

  // Matritsa FAQAT muddati o'tganlardan quriladi: "bu oy yig'iladi" hali
  // kechikish emas va uni bosqichga qo'yish soxta signal berardi.
  const aging = useMemo(() => {
    const acc: Record<DebtAgingStage, { count: number; amount: number }> = {
      normal: { count: 0, amount: 0 },
      warning: { count: 0, amount: 0 },
      suspension: { count: 0, amount: 0 },
      critical: { count: 0, amount: 0 },
    };
    for (const r of debtors.rows) {
      if (r.overdue <= 0) continue;
      const bucket = acc[debtAgingStage(r.overdueDays)];
      bucket.count++;
      bucket.amount += r.overdue;
    }
    return acc;
  }, [debtors.rows]);

  const debtorRows = useMemo(() => {
    const q = debtorQuery.trim().toLowerCase();
    return debtors.rows
      .filter((r) => (stageFilter ? r.overdue > 0 && debtAgingStage(r.overdueDays) === stageFilter : true))
      .filter((r) =>
        focus === "overdue" ? r.overdue > 0
        : focus === "neverPaid" ? r.overdue > 0 && r.paid === 0
        : true,
      )
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.inn.includes(q) ||
          (r.accountantName ?? "").toLowerCase().includes(q)
      );
  }, [debtors.rows, debtorQuery, stageFilter, focus]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return debt.rows
      .filter((r) => (onlyDiff ? r.diff !== null && Math.abs(r.diff) > 1 : true))
      .filter(
        (r) =>
          !q ||
          r.customer.toLowerCase().includes(q) ||
          (r.contract ?? "").toLowerCase().includes(q) ||
          (r.ownFirm ?? "").toLowerCase().includes(q)
      );
  }, [debt.rows, query, onlyDiff]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Qarzdorlik</h1>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            1C hisoboti va ASRO hisobi yonma-yon
            {debt.asOf ? ` · 1C holati: ${formatUzDate(debt.asOf)}` : ""}
          </p>
        </div>
      </div>

      <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} ariaLabel="Qarzdorlik bo'limlari" />

      {tab === "holat" && (
        statement ? (
          <DebtStatement statement={statement} />
        ) : (
          <div className="rounded-xl p-4 text-meta" style={{ ...card, color: "var(--text-muted)" }}>
            Qarzdorlik kesimi hali import qilinmagan.
          </div>
        )
      )}

      {tab === "undirish" && (<>
      {/*
        BOSHLASH NUQTASI — bitta qatorda umumiy manzara.

        Ilgari bu raqamlar ekranda YO'Q edi: `debtors.totals` serverdan
        kelar, lekin faqat pastdagi jadval sarlavhasida qisman ko'rinardi.
        Rahbar "umuman qancha qarz bor?" degan savolga javob olish uchun
        228 qatorni aylantirishi kerak edi.
      */}
      <StatStrip
        items={[
          {
            label: "Jami qarz",
            value: debtors.totals.outstanding,
            tone: "neutral",
            // Bu sahifaning asosiy raqami — qolgan ko'rsatkichlar uning
            // kesimlari, shuning uchun yagona urg'u shu yerda.
            emphasis: true,
            meta: `${debtors.totals.companies} firma`,
            hint: "Barcha to'lanmagan qoldiq — muddati kelgani ham, kelmagani ham",
          },
          {
            // BOSILADIGAN: sarlavhadagi raqamdan to'g'ridan-to'g'ri o'sha
            // ro'yxatga. Ilgari bu raqam ko'rinar, lekin unga BOSIB bo'lmasdi —
            // foydalanuvchi "199 firma" ni ko'rib, ularni topish uchun
            // eskirish bosqichlarini birma-bir bosishi kerak edi.
            label: "Muddati o'tgan",
            value: debtors.totals.overdue,
            tone: "out",
            meta: `${debtors.totals.overdueCompanies} firma`,
            hint: "To'lov oynasi yopilgan, hali to'lanmagan. Bosing — faqat shular qoladi",
            onClick: () => toggleFocus("overdue"),
            active: focus === "overdue",
          },
          {
            label: "Bu oy yig'iladi",
            value: debtors.totals.dueNow,
            tone: "in",
            hint: "Shu oy uchun hisoblangan, muddati hali o'tmagan",
          },
          {
            label: "Hech to'lamagan",
            value: debtors.totals.neverPaid,
            tone: "muted",
            meta: "firma",
            hint: "Muddati o'tgan va tizimda birorta ham to'lovi qayd etilmagan",
            onClick: () => toggleFocus("neverPaid"),
            active: focus === "neverPaid",
          },
        ]}
        className="rounded-xl overflow-hidden"
      />


      {/*
        ESKIRISH BOSQICHLARI RO'YXATDAN YUQORIDA.

        Ilgari ular undirish navbatidan KEYIN turardi — ya'ni prioritetni
        tanlaydigan boshqaruv o'zi filtrlaydigan 228 qatorli ro'yxatning
        PASTIDA edi va uni ko'rish uchun butun ro'yxatni aylantirish kerak
        bo'lardi. Filtr har doim o'zi filtrlaydigan narsadan oldin turadi.
      */}

      {/* AGING MATRITSASI — "qancha qarz" emas, "qancha VAQTDAN BERI".
          60 kunlik 10 mln 10 kunlik 50 mln dan xavfliroq, va bu farq
          yig'ma summada umuman ko'rinmaydi. */}
      {debtors.totals.overdue > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {DEBT_AGING_STAGES.map((s) => {
            const b = aging[s.key];
            const active = stageFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStageFilter(active ? null : s.key)}
                disabled={b.count === 0}
                className="rounded-xl px-3 py-2.5 text-left transition-opacity disabled:opacity-45 disabled:cursor-default"
                style={{
                  ...card,
                  borderColor: active ? s.color : "var(--card-border)",
                  boxShadow: active ? `inset 0 0 0 1px ${s.color}` : undefined,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {b.count} ta
                  </span>
                </div>
                <div className="text-meta font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
                  {formatNum(b.amount)} so&apos;m
                </div>
                <div className="text-micro" style={{ color: "var(--text-muted)" }}>{s.hint}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Rahbarga kerak bo'lgan birinchi narsa — raqam emas, HARAKAT ro'yxati.
          Shuning uchun u sahifaning eng tepasida. */}
      <CollectionQueue rows={queue.rows} totals={queue.totals} />

      {/* TO'LAMAGAN FIRMALAR — sahifaning eng amaliy bloki, shuning uchun
          eng tepada. Direktorning kunlik Telegram hisoboti aynan shu
          ro'yxatning birinchi 5 tasini ko'rsatadi (lib/debt.ts listDebtors),
          ya'ni ikkovi hech qachon ajralmaydi. */}
      <div className="rounded-xl overflow-hidden" style={card}>
        <div
          className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
        >
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              To&apos;lov kutilayotgan firmalar
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Ish oyi tugagach mijoz keyingi oy davomida to&apos;laydi — shuning uchun
              &quot;bu oy yig&apos;iladi&quot; va &quot;muddati o&apos;tgan&quot; alohida
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--accent-blue)" }}>
              Bu oy: {formatNum(debtors.totals.dueNow)} so&apos;m
            </span>
            {debtors.totals.overdue > 0 && (
              <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--danger)" }}>
                Muddati o&apos;tgan: {debtors.totals.overdueCompanies} ta ·{" "}
                {formatNum(debtors.totals.overdue)} so&apos;m
              </span>
            )}
            {debtors.totals.neverPaid > 0 && (
              <span className="text-micro tabular-nums" style={{ color: "var(--warning)" }}>
                {debtors.totals.neverPaid} tasi bir marta ham to&apos;lamagan
              </span>
            )}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                value={debtorQuery}
                onChange={(e) => setDebtorQuery(e.target.value)}
                placeholder="Firma, STIR yoki buxgalter"
                className="pl-7 pr-2 py-1 rounded-lg text-meta w-56"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
              />
            </div>
          </div>
        </div>

        {debtorRows.length === 0 ? (
          <div className="px-3 py-8 text-center text-meta" style={{ color: "var(--text-muted)" }}>
            {/*
              SABABNI AYTADI. Ilgari filtr natijasi bo'sh bo'lganda ham
              "Qidiruvga mos firma topilmadi" deb yozilardi — holbuki
              qidiruv umuman kiritilmagan bo'lishi va sabab eskirish
              bosqichi bo'lishi mumkin edi. Foydalanuvchi nimani
              o'zgartirishni bilmasdi.
            */}
            {debtors.rows.length === 0
              ? "To'lov kutilayotgan firma yo'q"
              : stageFilter
                ? `${DEBT_AGING_STAGES.find((x) => x.key === stageFilter)?.label} oralig'ida qarzdor topilmadi`
                : focus === "overdue"
                  ? "Muddati o'tgan qarzdor topilmadi"
                  : focus === "neverPaid"
                    ? "Hech to'lamagan qarzdor topilmadi"
                    : "Qidiruvga mos firma topilmadi"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--table-header-bg)" }}>
                  {["Firma", "Shartnoma", "Bu oy yig'iladi", "Muddati o'tgan", "Kun", "Oxirgi to'lov", "Mas'ul"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${i >= 1 && i <= 4 ? "text-right" : "text-left"}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debtorRows.map((r) => (
                  <tr key={r.companyId} className="transition-colors hover:bg-[var(--input-bg)]" style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="px-3 py-2">
                      <div className="font-semibold" style={{ color: "var(--text)" }}>{r.name}</div>
                      <div className="text-micro" style={{ color: "var(--text-muted)" }}>STIR {r.inn}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatNum(r.contractAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--accent-blue)" }}>
                      {r.dueNow > 0 ? formatNum(r.dueNow) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--danger)" }}>
                      {r.overdue > 0 ? formatNum(r.overdue) : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{
                        color:
                          r.overdue > 0
                            ? DEBT_AGING_STAGES.find((s) => s.key === debtAgingStage(r.overdueDays))!.color
                            : "var(--text-muted)",
                      }}
                    >
                      {r.overdue > 0 ? r.overdueDays : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.lastPaidPeriod ? (
                        <span style={{ color: "var(--text-muted)" }}>{r.lastPaidPeriod}</span>
                      ) : (
                        <span className="font-semibold" style={{ color: "var(--warning)" }}>
                          hech qachon
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {r.accountantName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      {tab === "tekshiruv" && (<>
      {/* SVERKA — import nomuvofiqliklari ilgari faqat terminalda ko'rinardi
          va terminal yopilgach yo'qolardi. Endi doimiy ekranda. */}
      {recon.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={card}>
          <div className="px-3 py-2" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>Sverka — moliyaviy tekshiruvlar</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {recon.map((c) => {
              const color =
                c.status === "ok" ? "var(--success)" : c.status === "warn" ? "var(--warning)" : "var(--danger)";
              const Icon = c.status === "ok" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
              return (
                <div key={c.key} className="flex items-start gap-3 px-3 py-2">
                  <Icon size={16} style={{ color }} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-meta font-semibold" style={{ color: "var(--text)" }}>{c.title}</div>
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>{c.detail}</div>
                    {c.action && (
                      <div className="text-micro mt-0.5" style={{ color }}>→ {c.action}</div>
                    )}
                  </div>
                  {c.value !== 0 && (
                    <div className="text-meta tabular-nums font-semibold whitespace-nowrap" style={{ color }}>
                      {formatNum(c.value)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uchta raqam */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>1C bo&apos;yicha (jamg&apos;arilgan)</div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(debt.totals.debt1C)} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>{debt.rows.length} shartnoma</div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>ASRO hisobi (jamg&apos;arilgan)</div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(debt.totals.debtAsro)} <span className="text-meta">so&apos;m</span>
          </div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="text-meta" style={{ color: "var(--text-muted)" }}>Farq</div>
          <div
            className="text-xl font-semibold tabular-nums mt-1"
            style={{ color: Math.abs(debt.totals.diff) > 1 ? "var(--warning)" : "var(--success)" }}
          >
            {debt.totals.diff > 0 ? "+" : ""}{formatNum(debt.totals.diff)} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>
            ikkalasi jamg&apos;arilgan — farq nomuvofiqlik belgisi
          </div>
        </div>
      </div>

      {debt.unlinked > 0 && (
        <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <AlertTriangle size={17} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            <b>{debt.unlinked}</b> ta 1C qatorining mijozi ASRO bazasida topilmadi — ular
            faqat 1C nomi bilan ko&apos;rsatilgan. Firmani qo&apos;shgach qayta import qiling.
          </p>
        </div>
      )}

      {/* Reja / fakt */}
      {planFact.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={card}>
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
            <TrendingUp size={15} style={{ color: "var(--accent-blue)" }} />
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>Tushum: reja va fakt</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--input-bg)" }}>
                  <th className="text-left p-2">Davr</th>
                  <th className="text-right p-2">Reja</th>
                  <th className="text-right p-2">Fakt</th>
                  <th className="text-right p-2">Bajarilishi</th>
                </tr>
              </thead>
              <tbody>
                {planFact.map((p) => {
                  const plan = Number(p.plan ?? 0);
                  const fact = Number(p.fact ?? 0);
                  const pct = plan > 0 ? Math.round((fact / plan) * 100) : null;
                  const color = pct == null ? "var(--text-muted)" : pct >= 100 ? "var(--success)" : pct >= 90 ? "var(--warning)" : "var(--danger)";
                  return (
                    <tr key={p.period} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td className="p-2 whitespace-nowrap">{p.period}</td>
                      <td className="p-2 text-right tabular-nums">{plan ? formatNum(plan) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{fact ? formatNum(fact) : "—"}</td>
                      <td className="p-2 text-right tabular-nums font-semibold" style={{ color }}>
                        {pct == null ? "—" : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Qatorlar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg text-meta outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            placeholder="Mijoz, shartnoma yoki firma bo'yicha qidirish…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-meta cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Faqat farqi borlar
        </label>
        <span className="text-meta" style={{ color: "var(--text-muted)" }}>{rows.length} qator</span>
      </div>

      <div className="overflow-x-auto rounded-xl" style={card}>
        <table className="w-full text-meta">
          <thead>
            <tr style={{ background: "var(--input-bg)" }}>
              <th className="text-left p-2">Mijoz</th>
              <th className="text-left p-2">Shartnoma</th>
              <th className="text-left p-2">Bizning firma</th>
              <th className="text-right p-2">1C</th>
              <th className="text-right p-2">ASRO</th>
              <th className="text-right p-2">Farq</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid var(--card-border)" }}>
                <td className="p-2 max-w-[260px] truncate">
                  {r.customer}
                  {!r.linked && (
                    <span className="ml-2 text-micro px-1.5 py-0.5 rounded" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                      bazada yo&apos;q
                    </span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">{r.contract ?? "—"}</td>
                <td className="p-2 max-w-[180px] truncate">{r.ownFirm ?? "—"}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{formatNum(r.debt1C)}</td>
                <td className="p-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.debtAsro == null ? "—" : formatNum(r.debtAsro)}
                </td>
                <td
                  className="p-2 text-right tabular-nums font-semibold"
                  style={{ color: r.diff == null ? "var(--text-muted)" : Math.abs(r.diff) > 1 ? "var(--warning)" : "var(--success)" }}
                >
                  {r.diff == null ? "—" : `${r.diff > 0 ? "+" : ""}${formatNum(r.diff)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>)}

      {tab === "tolovlar" && (<>
      {/* FIRMALAR BO'YICHA OYLIK TO'LOVLAR — `/kassa` dan ko'chirildi.
          U yerda kassalar qoldig'i bilan bir ekranda turib, ikki xil firma
          ro'yxati va uch xil "balans" chalkashligini keltirib chiqarardi.
          Qarzdorlar ro'yxati bilan yonma-yon turgani mantiqan to'g'ri. */}
      <KassaModule
        companies={companies}
        payments={payments}
        debtByCompany={debtByCompany}
        lang="uz"
        onSavePayment={async (payment) => {
          await upsertPayment({
            companyId: payment.companyId as string,
            period: payment.period as string,
            amount: Number(payment.amount || 0),
            status: payment.status as string,
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : undefined,
            paymentMethod: payment.paymentMethod || "naqd",
            comment: payment.comment,
            channelId: payment.channelId ?? undefined,
          });
          router.refresh();
        }}
        onDeletePayment={async (id) => {
          await deletePayment(id);
          router.refresh();
        }}
      />
      </>)}

    </div>
  );
}
