"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, TrendingUp, CheckCircle2, XCircle, HandCoins, Scale, Users, CalendarClock, Ban } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import CollectionQueue from "./CollectionQueue";
import DebtStatement, { type DebtStatementData } from "./DebtStatement";
import {
  Badge, DataTable, EmptyState, IdentityCell, MetricRail, Money, PageHeader,
  TableToolbar, Tabs, type DataColumn, type TabItem,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { useTabParam, useUrlParam } from "@/hooks/useTabParam";
import { QARZDORLIK_TAB_IDS, QARZDORLIK_DEFAULT_TAB, type QarzdorlikTab } from "@/lib/qarzdorlikTabs";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import { sectionCrumbs, sectionMeta } from "@/lib/navigation";
import { DEBT_AGING_STAGES, debtAgingStage, type DebtAgingStage } from "@/lib/debtAging";
import { useRouter } from "next/navigation";
import KassaModule from "@/components/KassaModule";
import { upsertPayment, deletePayment } from "@/server/kassa/payments";
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
  // Sarlavha/ikonka joriy bo'limdan — yon panel bilan bir manba.
  const meta = sectionMeta("/kassa/qarzdorlik", tab);
  const SectionIcon = meta?.icon ?? HandCoins;
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

  // Saralash/sahifa/zichlik — `DataTable` shu holatni kutadi. Qidiruv va
  // kesim filtrlari URL'da alohida yashaydi (`q`, `bosqich`, `kesim`),
  // shuning uchun bu yerda faqat jadval holati.
  const debtorTable = useTableState({ ns: "qd", defaultSortKey: "overdue", defaultSortDir: "desc" });
  const [debtorPageSize, setDebtorPageSize] = usePageSize("debtors");
  const svTable = useTableState({ ns: "sv", defaultSortKey: "debt1C", defaultSortDir: "desc" });
  const [svPageSize, setSvPageSize] = usePageSize("debt-1c");

  const clearDebtorFilters = () => {
    setStageFilter(null);
    setFocusParam("");
    setDebtorQuery("");
  };

  const emptyDebtorReason =
    debtors.rows.length === 0
      ? "Hech bir firmada to'lanmagan qoldiq yo'q."
      : stageFilter
        ? `${DEBT_AGING_STAGES.find((x) => x.key === stageFilter)?.label} oralig'ida qarzdor topilmadi.`
        : focus === "overdue"
          ? "Muddati o'tgan qarzdor topilmadi."
          : focus === "neverPaid"
            ? "Hech to'lamagan qarzdor topilmadi."
            : "Qidiruvga mos firma topilmadi.";

  const debtorColumns: DataColumn<DebtorRow>[] = [
    {
      key: "name",
      header: "Firma",
      cell: (r) => <IdentityCell name={r.name} secondary={`STIR ${r.inn}`} size="sm" />,
      sortValue: (r) => r.name,
      sticky: true,
      mobile: "title",
    },
    {
      key: "contract",
      header: "Shartnoma",
      cell: (r) => <Money value={r.contractAmount} tone="muted" dashIfZero />,
      sortValue: (r) => r.contractAmount,
      numeric: true,
      align: "right",
    },
    {
      key: "dueNow",
      header: "Bu oy yig'iladi",
      cell: (r) => <Money value={r.dueNow} tone="in" dashIfZero bold />,
      sortValue: (r) => r.dueNow,
      numeric: true,
      align: "right",
    },
    {
      key: "overdue",
      header: "Muddati o'tgan",
      cell: (r) => <Money value={r.overdue} tone="out" dashIfZero bold />,
      sortValue: (r) => r.overdue,
      numeric: true,
      align: "right",
    },
    {
      key: "days",
      header: "Kun",
      // Rang eskirish BOSQICHIDAN — 60 kunlik 10 mln 10 kunlik 50 mln dan
      // xavfliroq, va bu farq summada umuman ko'rinmaydi.
      cell: (r) =>
        r.overdue > 0 ? (
          <span
            className="font-semibold tabular-nums"
            style={{ color: DEBT_AGING_STAGES.find((x) => x.key === debtAgingStage(r.overdueDays))!.color }}
          >
            {r.overdueDays}
          </span>
        ) : (
          "—"
        ),
      sortValue: (r) => (r.overdue > 0 ? r.overdueDays : -1),
      numeric: true,
      align: "right",
      mobile: "status",
    },
    {
      key: "lastPaid",
      header: "Oxirgi to'lov",
      cell: (r) =>
        r.lastPaidPeriod ? (
          <span style={{ color: "var(--text-muted)" }}>{r.lastPaidPeriod}</span>
        ) : (
          <Badge tone="warning">hech qachon</Badge>
        ),
      sortValue: (r) => r.lastPaidPeriod ?? "",
    },
    {
      key: "accountant",
      header: "Mas'ul",
      cell: (r) => r.accountantName ?? "—",
      sortValue: (r) => r.accountantName ?? "",
    },
  ];

  /** 1C ↔ ASRO solishtiruvi. */
  const svColumns: DataColumn<DebtRow>[] = [
    {
      key: "customer",
      header: "Mijoz",
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.customer}
          {!r.linked && <Badge tone="warning">bazada yo&apos;q</Badge>}
        </span>
      ),
      sortValue: (r) => r.customer,
      sticky: true,
      mobile: "title",
    },
    { key: "contract", header: "Shartnoma", cell: (r) => r.contract ?? "—", sortValue: (r) => r.contract ?? "" },
    { key: "ownFirm", header: "Bizning firma", cell: (r) => r.ownFirm ?? "—", sortValue: (r) => r.ownFirm ?? "" },
    {
      key: "debt1C",
      header: "1C",
      cell: (r) => <Money value={r.debt1C} tone="neutral" bold />,
      sortValue: (r) => r.debt1C,
      numeric: true,
      align: "right",
    },
    {
      key: "debtAsro",
      header: "ASRO",
      cell: (r) => (r.debtAsro == null ? "—" : <Money value={r.debtAsro} tone="muted" />),
      sortValue: (r) => r.debtAsro ?? 0,
      numeric: true,
      align: "right",
    },
    {
      key: "diff",
      header: "Farq",
      cell: (r) =>
        r.diff == null ? (
          "—"
        ) : (
          <span
            className="font-semibold tabular-nums"
            style={{ color: Math.abs(r.diff) > 1 ? "var(--warning)" : "var(--success)" }}
          >
            {r.diff > 0 ? "+" : ""}
            {formatNum(r.diff)}
          </span>
        ),
      sortValue: (r) => r.diff ?? 0,
      numeric: true,
      align: "right",
      mobile: "status",
    },
  ];

  /** Reja/fakt — bajarilish foizi qatorda hisoblanadi. */
  const planFactColumns: DataColumn<PlanFactRow>[] = [
    { key: "period", header: "Davr", cell: (p) => p.period, sortValue: (p) => p.period, sticky: true, mobile: "title" },
    {
      key: "plan",
      header: "Reja",
      cell: (p) => <Money value={Number(p.plan ?? 0)} tone="neutral" dashIfZero />,
      sortValue: (p) => Number(p.plan ?? 0),
      numeric: true,
      align: "right",
    },
    {
      key: "fact",
      header: "Fakt",
      cell: (p) => <Money value={Number(p.fact ?? 0)} tone="neutral" dashIfZero />,
      sortValue: (p) => Number(p.fact ?? 0),
      numeric: true,
      align: "right",
    },
    {
      key: "pct",
      header: "Bajarilishi",
      cell: (p) => {
        const plan = Number(p.plan ?? 0);
        const fact = Number(p.fact ?? 0);
        const pct = plan > 0 ? Math.round((fact / plan) * 100) : null;
        if (pct == null) return "—";
        return (
          <Badge tone={pct >= 100 ? "success" : pct >= 90 ? "warning" : "danger"}>{pct}%</Badge>
        );
      },
      sortValue: (p) => {
        const plan = Number(p.plan ?? 0);
        return plan > 0 ? Math.round((Number(p.fact ?? 0) / plan) * 100) : -1;
      },
      align: "right",
      mobile: "status",
    },
  ];

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
      <BreadcrumbTrail crumbs={sectionCrumbs("/kassa/qarzdorlik", tab)} />
      <PageHeader
        title={meta?.label ?? "Qarzdorlik"}
        description={
          // Bo'lim tavsifi + DAVR: "1C holati" sanasi qaysi yorliqda
          // turishdan qat'i nazar kerak — u butun ekranning ma'lumot
          // kesimini aytadi, shuning uchun tavsifga ulanib qoladi.
          (meta?.description ?? "1C hisoboti va ASRO hisobi yonma-yon") +
          (debt.asOf ? ` · 1C holati: ${formatUzDate(debt.asOf)}` : "")
        }
        icon={<SectionIcon size={20} />}
      />

      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={setTab}
        ariaLabel="Qarzdorlik bo'limlari"
        // FAQAT TELEFONDA: kompyuterda bu ro'yxat yon panelda uchinchi daraja
        // bo'lib turibdi (`NAV_SECTIONS`) — bir xil tanlov ekranda ikki marta
        // ko'rinardi. Telefonda yon panel gamburger ortida yashirin.
        className="md:hidden"
      />

      {tab === "holat" && (
        statement ? (
          <DebtStatement statement={statement} />
        ) : (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<Scale size={28} />}
              title="Qarzdorlik kesimi hali import qilinmagan"
              description="1C dan hisob-kitob varaqasi yuklangach shu yerda ko'rinadi."
            />
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
      <MetricRail
        columns={4}
        items={[
          {
            label: "Jami qarz",
            value: formatNum(debtors.totals.outstanding),
            unit: "so'm",
            // Bu sahifaning asosiy raqami — qolgan ko'rsatkichlar uning
            // kesimlari, shuning uchun yagona urg'u shu yerda.
            emphasis: true,
            hint: `${debtors.totals.companies} firma · muddati kelgani ham, kelmagani ham`,
            icon: <HandCoins size={13} />,
          },
          {
            // BOSILADIGAN: sarlavhadagi raqamdan to'g'ridan-to'g'ri o'sha
            // ro'yxatga. Ilgari bu raqam ko'rinar, lekin unga BOSIB bo'lmasdi —
            // foydalanuvchi "199 firma" ni ko'rib, ularni topish uchun
            // eskirish bosqichlarini birma-bir bosishi kerak edi.
            label: "Muddati o'tgan",
            value: formatNum(debtors.totals.overdue),
            unit: "so'm",
            hint: `${debtors.totals.overdueCompanies} firma · bosing, faqat shular qoladi`,
            icon: <AlertTriangle size={13} />,
            tone: debtors.totals.overdue > 0 ? "danger" : "success",
            onClick: () => toggleFocus("overdue"),
            active: focus === "overdue",
          },
          {
            label: "Bu oy yig'iladi",
            value: formatNum(debtors.totals.dueNow),
            unit: "so'm",
            hint: "shu oy uchun hisoblangan, muddati hali o'tmagan",
            icon: <CalendarClock size={13} />,
            tone: "brand",
          },
          {
            label: "Hech to'lamagan",
            value: debtors.totals.neverPaid,
            unit: "firma",
            hint: "muddati o'tgan va birorta to'lovi qayd etilmagan",
            icon: <Ban size={13} />,
            tone: debtors.totals.neverPaid > 0 ? "warning" : "neutral",
            onClick: () => toggleFocus("neverPaid"),
            active: focus === "neverPaid",
          },
        ]}
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
              // KARTA SHAKLIDAGI FILTR. `Chip` mos kelmaydi — u bir qatorli
              // yorliq uchun; bu yerda uch qatorli plitka (sarlavha + summa +
              // izoh). `Button` ham mos emas: u matnni uppercase qiladi va
              // bitta qatorga tekislaydi. `aria-pressed` qo'lda beriladi —
              // busiz ekran o'quvchi filtr yoqilganini ayta olmasdi.
              //
              // Direktiva AYNAN `<button` dan oldingi qatorda turishi shart:
              // `eslint-disable-next-line` faqat bitta keyingi qatorni qamraydi
              // va izoh bloki orasiga tushsa jim ravishda ishlamay qoladi.
              // eslint-disable-next-line no-restricted-syntax
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
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
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              To&apos;lov kutilayotgan firmalar
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Ish oyi tugagach mijoz keyingi oy davomida to&apos;laydi — shuning uchun
              &quot;bu oy yig&apos;iladi&quot; va &quot;muddati o&apos;tgan&quot; alohida
            </p>
          </div>
          <TableToolbar
            search={debtorQuery}
            onSearchChange={setDebtorQuery}
            searchPlaceholder="Firma, STIR yoki buxgalter"
            density={debtorTable.density}
            onDensityChange={debtorTable.setDensity}
            filterCount={(stageFilter ? 1 : 0) + (focus ? 1 : 0)}
            filter={
              <div className="space-y-2 min-w-[200px]">
                <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                  Filtr yuqoridagi ko&apos;rsatkich va bosqich kartochkalari orqali qo&apos;yiladi.
                </p>
                {(stageFilter || focus) && (
                  <Button variant="ghost" size="sm" onClick={clearDebtorFilters}>
                    Filtrni tozalash
                  </Button>
                )}
              </div>
            }
          />
        </div>

        <DataTable
          rows={debtorRows}
          columns={debtorColumns}
          rowKey={(r) => r.companyId}
          caption="To'lov kutilayotgan firmalar"
          {...debtorTable.bind}
          pageSize={debtorPageSize}
          onPageSizeChange={setDebtorPageSize}
          emptyIcon={<Users size={28} />}
          emptyTitle={debtors.rows.length === 0 ? "To'lov kutilayotgan firma yo'q" : "Qarzdor topilmadi"}
          /*
            SABABNI AYTADI. Ilgari filtr natijasi bo'sh bo'lganda ham
            "Qidiruvga mos firma topilmadi" deb yozilardi — holbuki qidiruv
            umuman kiritilmagan va sabab eskirish bosqichi bo'lishi mumkin
            edi. Foydalanuvchi nimani o'zgartirishni bilmasdi.
          */
          emptyDescription={emptyDebtorReason}
          emptyAction={
            stageFilter || focus || debtorQuery.trim() ? (
              <Button variant="secondary" size="sm" onClick={clearDebtorFilters}>
                Filtrni tozalash
              </Button>
            ) : undefined
          }
        />
      </section>

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

      {/* IKKI MANBA VA ULARNING FARQI — solishtirish qatori.
          `KpiCard` gridi o'rniga `MetricRail`: bu uchta raqam mustaqil
          ko'rsatkich emas, balki BITTA tenglamaning uch a'zosi
          (1C − ASRO = farq) va ular bir yuzada turgani shuni ko'rsatadi. */}
      <MetricRail
        columns={3}
        items={[
          {
            label: "1C bo'yicha (jamg'arilgan)",
            value: formatNum(debt.totals.debt1C),
            unit: "so'm",
            hint: `${debt.rows.length} shartnoma`,
            icon: <Scale size={13} />,
          },
          {
            label: "ASRO hisobi (jamg'arilgan)",
            value: formatNum(debt.totals.debtAsro),
            unit: "so'm",
            hint: "tizimdagi hisoblanma",
            icon: <HandCoins size={13} />,
          },
          {
            label: "Farq",
            value: `${debt.totals.diff > 0 ? "+" : ""}${formatNum(debt.totals.diff)}`,
            unit: "so'm",
            hint: "ikkalasi jamg'arilgan — farq nomuvofiqlik belgisi",
            icon: <AlertTriangle size={13} />,
            tone: Math.abs(debt.totals.diff) > 1 ? "warning" : "success",
            emphasis: true,
          },
        ]}
      />

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
          <DataTable
            rows={planFact}
            columns={planFactColumns}
            rowKey={(p) => p.period}
            caption="Tushum rejasi va fakti davrlar bo'yicha"
            // Karta ICHIDA — o'z aylantirishini qo'shmaydi.
            maxBodyHeight={null}
            density="compact"
            emptyTitle="Reja kiritilmagan"
          />
        </div>
      )}

      {/* Qatorlar */}
      <TableToolbar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Mijoz, shartnoma yoki firma"
        density={svTable.density}
        onDensityChange={svTable.setDensity}
        filterCount={onlyDiff ? 1 : 0}
        filter={
          <label className="flex items-center gap-2 text-meta cursor-pointer whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            Faqat farqi borlar
          </label>
        }
      />

      <DataTable
        rows={rows}
        columns={svColumns}
        rowKey={(r) => r.key}
        caption="1C va ASRO qarz qoldiqlarining solishtiruvi"
        {...svTable.bind}
        pageSize={svPageSize}
        onPageSizeChange={setSvPageSize}
        emptyIcon={<Scale size={28} />}
        emptyTitle="Solishtiriladigan qator yo'q"
        emptyDescription={onlyDiff ? "Farqi bor qator topilmadi — ikkala hisob mos." : "1C kesimi hali import qilinmagan."}
      />

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
