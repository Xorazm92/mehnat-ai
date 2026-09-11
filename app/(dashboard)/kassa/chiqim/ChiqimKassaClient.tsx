"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CreditCard, Link2, Plus, Wand2, Snowflake, Play, AlertTriangle, ArrowDownRight, ArrowUpRight, Users,
  Wallet, ListChecks,
} from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { todayKey, formatNum, formatUzDate, submitOnCtrlEnter } from "@/lib/platform/format";
import {
  Badge, DataTable, EmptyState, MetricRail, Modal, Money, PageHeader,
  type DataColumn, type MetricTone,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/bank/classifyExpense";
// Sof konstantalar moduli — `lib/transit.ts` orqali kelsa Prisma/`pg` mijoz
// to'plamiga tortiladi va build "Can't resolve 'dns'/'net'/'tls'" bilan yiqiladi.
import { CHANNEL_TYPE_LABELS, type ChannelType } from "@/lib/transitChannels";
import {
  upsertChannel,
  setChannelActive,
  autoCreateChannelsFromStatements,
  linkCardTransfer,
  spendFromChannel,
  getTransitLedger,
} from "@/server/transit";
import { friendlyError } from "@/lib/actionError";
import ExpenseQueue, { type ExpenseQueueData } from "./ExpenseQueue";
import { Tabs, type TabItem } from "@/components/ui";
import ExpenseModule from "@/components/ExpenseModule";
import type { Expense, BalanceBreakdown } from "@/types";
import { createExpense, updateExpense, deleteExpense, approveExpense, rejectExpense } from "@/server/kassa/expenses";
import { createAvansPayout, createPayout } from "@/server/payouts";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import { sectionCrumbs, sectionMeta } from "@/lib/navigation";
import { usePrompt } from "@/components/ui/ConfirmDialog";
import { DateField } from "@/components/ui/DateField";
import { useTabParam } from "@/hooks/useTabParam";
import { CHIQIM_TAB_IDS, type ChiqimTab } from "@/lib/chiqimTabs";

interface Channel {
  id: string;
  type: string;
  label: string;
  cardMask: string | null;
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
  entryCount: number;
  lastMovementAt: string | null;
}

interface UnlinkedTransfer {
  id: string;
  valueDate: string;
  amount: string | number;
  accountLabel: string;
  cardMask: string | null;
  holderName: string | null;
}

interface LedgerRow {
  id: string;
  direction: string;
  amount: string | number;
  date: string;
  category: string | null;
  description: string | null;
}


/**
 * `server/payouts.ts#PayoutRegisterRow` ning mijoz nusxasi. Tip serverdan
 * import qilinmaydi: `import type` erisa ham, bitta ehtiyotsiz qiymat
 * importi butun Prisma zanjirini brauzer to'plamiga tortadi
 * (`lib/transitChannels.ts` boshidagi izohga qarang).
 */
interface PayoutRow {
  id: string;
  paidAt: string;
  month: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  channelId: string | null;
  channelLabel: string | null;
  channelTypeLabel: string | null;
  amount: number;
  paymentMethod: string;
  isAvans: boolean;
  note: string | null;
}

interface PayoutRegister {
  rows: PayoutRow[];
  total: number;
  unassignedCount: number;
  unassignedTotal: number;
}

interface Props {
  overview: { channels: Channel[]; totalBalance: number; unlinkedCount: number };
  unlinked: UnlinkedTransfer[];
  employees: { id: string; fullName: string; role: string }[];
  /** Vipiskadagi chiqimlar — toifalanib kassaga yoziladi. */
  queue: ExpenseQueueData;
  /** Kundalik xo'jalik xarajatlari (ovqat, taksi, non…) — oy bo'yicha. */
  household?: {
    periods: { period: string; total: number; count: number }[];
    total: number;
    count: number;
  };
  /**
   * `KassaEntry(expense)` to'liq ro'yxati — avvalgi mustaqil `/expenses`
   * sahifasi. Xuddi shu jadvalga "Yopish kerak → Xarajat" navbati ham
   * yozadi (`postExpenseFromBankTransaction`) — ikkalasi bir xil ma'lumotni
   * ikki joyda ko'rsatgani "qayerga borishni bilmayman" chalkashligini
   * kuchaytirardi, endi bitta tab.
   */
  expenses: Expense[];
  expenseBalance?: BalanceBreakdown;
  expenseCategories?: string[];
  /**
   * BERILGAN OYLIKLAR (`Payout`) — kassadan chiqqan pul, `KassaEntry` emas.
   * Balans uni allaqachon chiqim deb sanardi (`lib/balance.ts`
   * `outflowPayroll`), lekin chiqim EKRANIDA ko'rinmasdi: kassadan pul
   * kamayar, xarajatlar ro'yxatida esa hech narsa yo'q edi. Bu yerda faqat
   * KO'RSATILADI — pul berish `/payroll` da (bitta yozuv yo'li, aks holda
   * bir to'lov ikki jadvalga tushib, ikki marta hisoblanardi).
   */
  payouts: PayoutRegister;
  /** `payroll` ko'rinishi — oylik reyestri tabi shu bilan ochiladi. */
  canViewPayroll: boolean;
  userRole: string;
  /**
   * `kassa_expense` ruxsati bormi (tranzit kanallarni boshqarish). Yo'q
   * bo'lsa (masalan Nazoratchi, Bosh buxgalter — ular xarajatni
   * tasdiqlaydi, lekin kartalarni boshqarmaydi) faqat "Xarajat" tabi
   * ko'rinadi, qolganlari yashiriladi — RBAC saqlanadi, joylashuv o'zgaradi.
   */
  canManageChannels: boolean;
  /**
   * `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun) —
   * eski `/expenses` havolasi ham shu orqali "Xarajat" ga tushadi.
   */
  initialTab: ChiqimTab;
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

/** Modal pastidagi tugmalar formadan tashqarida — `form` atributi bog'laydi. */
const CHANNEL_FORM_ID = "channel-form";
const SPEND_FORM_ID = "spend-form";

/** Kartadan qilinadigan odatiy xarajatlar. */
const SPEND_CATEGORIES = ["ijara", "aloqa", "ovqat", "soliq", "bank_komissiya", "boshqa"] as const;

/** Kanal tarixi — kartochka ichida ochiladigan jadval. */
const LEDGER_COLUMNS: DataColumn<LedgerRow>[] = [
  { key: "date", header: "Sana", cell: (e) => <span className="tabular-nums">{formatUzDate(e.date)}</span>, sortValue: (e) => e.date, width: "110px", mobile: "meta" },
  {
    key: "direction",
    header: "Yo'nalish",
    cell: (e) => (
      <Badge tone={e.direction === "in" ? "success" : "danger"} dot>
        {e.direction === "in" ? "Kartaga tushdi" : "Sarflandi"}
      </Badge>
    ),
    sortValue: (e) => e.direction,
    mobile: "status",
  },
  {
    key: "category",
    header: "Toifa",
    cell: (e) => (e.category ? (EXPENSE_CATEGORY_LABELS[e.category as never] ?? e.category) : "—"),
    sortValue: (e) => e.category ?? "",
  },
  {
    key: "description",
    header: "Izoh",
    cell: (e) => e.description ?? "—",
    sortValue: (e) => e.description ?? "",
    sticky: true,
    mobile: "title",
  },
  {
    key: "amount",
    header: "Summa",
    cell: (e) => <Money value={Number(e.amount)} tone={e.direction === "in" ? "in" : "out"} showSign bold />,
    sortValue: (e) => Number(e.amount),
    numeric: true,
    align: "right",
  },
];

/** Xo'jalik xarajatlari — oylar kesimi. */
const HOUSEHOLD_COLUMNS: DataColumn<{ period: string; total: number; count: number }>[] = [
  { key: "period", header: "Oy", cell: (p) => p.period, sortValue: (p) => p.period, sticky: true, mobile: "title" },
  { key: "count", header: "Yozuv", cell: (p) => p.count, sortValue: (p) => p.count, numeric: true, align: "right" },
  {
    key: "total",
    header: "Summa",
    cell: (p) => <Money value={p.total} tone="out" bold />,
    sortValue: (p) => p.total,
    numeric: true,
    align: "right",
  },
];

/**
 * BERILGAN OYLIK REYESTRI — "qaysi manbadan qaysi xodimga".
 *
 * Ikki ustun bu ekranning butun sababi: `employeeName` (kimga) va
 * `channelLabel` (qaysi kassadan). Manba ustuni bo'sh bo'lsa — bu
 * `Payout.channelId` qo'shilishidan OLDINGI to'lov; ular
 * `scripts/backfill-payout-channel.ts` bilan bog'lanadi.
 */
/** Yon paneldagi ota bo'lim — sarlavha va yo'l chizig'i shundan olinadi. */
const SECTION_ROOT = "/kassa/chiqim";

const PAYOUT_COLUMNS: DataColumn<PayoutRow>[] = [
  {
    key: "employee",
    header: "Xodim",
    cell: (p) => (
      <span className="font-semibold" style={{ color: "var(--text)" }}>{p.employeeName}</span>
    ),
    sortValue: (p) => p.employeeName,
    sticky: true,
    mobile: "title",
  },
  {
    key: "channel",
    header: "Manba",
    cell: (p) =>
      p.channelLabel ? (
        <span>
          {p.channelLabel}
          {p.channelTypeLabel && (
            <span className="text-micro block" style={{ color: "var(--text-muted)" }}>
              {p.channelTypeLabel}
            </span>
          )}
        </span>
      ) : (
        <Badge tone="warning">Ko&apos;rsatilmagan</Badge>
      ),
    sortValue: (p) => p.channelLabel ?? "",
  },
  {
    key: "paidAt",
    header: "Berilgan sana",
    cell: (p) => <span className="tabular-nums">{formatUzDate(p.paidAt)}</span>,
    sortValue: (p) => p.paidAt,
    mobile: "meta",
  },
  {
    key: "month",
    header: "Qaysi oy uchun",
    cell: (p) => p.month,
    sortValue: (p) => p.month,
  },
  {
    key: "kind",
    header: "Turi",
    cell: (p) => <Badge tone={p.isAvans ? "warning" : "neutral"}>{p.isAvans ? "Avans" : "Oylik"}</Badge>,
    sortValue: (p) => (p.isAvans ? "avans" : "oylik"),
    mobile: "status",
  },
  {
    key: "amount",
    header: "Summa",
    cell: (p) => <Money value={p.amount} tone="out" bold />,
    sortValue: (p) => p.amount,
    numeric: true,
    align: "right",
  },
  {
    key: "note",
    header: "Izoh",
    cell: (p) => p.note ?? "—",
    sortValue: (p) => p.note ?? "",
    mobile: "hide",
  },
];

export default function ChiqimKassaClient({
  overview, unlinked, employees, household, queue,
  expenses, expenseBalance, expenseCategories, payouts, canViewPayroll,
  userRole, canManageChannels, initialTab,
}: Props) {
  const router = useRouter();
  const prompt = usePrompt();

  // TABLAR. Sahifada oltita blok bir vertikalda edi: 66 ta karta ro'yxati,
  // chiqim navbati, 15 oylik xo'jalik tarixi va 70 ta bog'lanmagan
  // o'tkazma. Kundalik ish — navbat — eng pastda qolib ketardi.
  //
  // "xarajat" — avvalgi mustaqil `/expenses` sahifasi shu yerga ko'chdi
  // (bir xil `KassaEntry` jadvaliga yoziladigan ikki ekran birlashtirildi).
  // `canManageChannels=false` bo'lgan foydalanuvchi (Nazoratchi, Bosh
  // buxgalter) uchun bu YAGONA tab — qolganlari (Navbat/Kartalar/Xo'jalik)
  // ularning RBAC doirasidan tashqarida.
  // Yorliq URL'da: F5 bosilganda holat saqlanadi va "kartalarga qara" deb
  // havola yuborish mumkin (`/kassa/chiqim?tab=kartalar`). Ilgari bu oddiy
  // `useState` edi — sahifa yangilanganda navbatga qaytib tushardi.
  //
  // YORLIQLAR RUXSATGA QARAB. Ilgari ro'yxat qotib yozilgan edi va
  // `canManageChannels=false` bo'lganda tab almashtirgichning O'ZI
  // yashirilardi (yagona "Xarajat" uchun tanlov keraksiz edi). Endi ikkinchi
  // ochiq bo'lim ham bor — "Oylik" — shuning uchun ro'yxat hisoblanadi va
  // almashtirgich bittadan ko'p bo'lim bo'lganda chiziladi.
  const allowedTabs = CHIQIM_TAB_IDS.filter((id) => {
    if (id === "oylik") return canViewPayroll;
    if (id === "xarajat") return true;
    return canManageChannels;
  });
  const [tab, setTab] = useTabParam<ChiqimTab>("tab", allowedTabs, initialTab);

  // Reyestrdagi AVANS ulushi — "oylik" va "avans" bir jadvalda yotadi
  // (ikkalasi ham `Payout`), farqi tuzatma turida (`isAvans`).
  // Sarlavha/ikonka joriy bo'limdan (`NAV_SECTIONS` — yon panel bilan bir manba).
  const meta = sectionMeta(SECTION_ROOT, tab);
  const SectionIcon = meta?.icon ?? CreditCard;

  const avansSummary = useMemo(() => {
    const rows = payouts.rows.filter((p) => p.isAvans);
    return { count: rows.length, total: rows.reduce((s, p) => s + p.amount, 0) };
  }, [payouts.rows]);
  // Toifalash navbati: qaysi qator ustida ish ketyapti va xato matni.

  // Kassaga hali yozilmaganlar — yozilgani ro'yxatdan chiqadi.
  useAutoRefresh();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [spendFor, setSpendFor] = useState<Channel | null>(null);

  const { channels, totalBalance, unlinkedCount } = overview;
  const active = channels.filter((c) => c.isActive);
  const frozen = channels.filter((c) => !c.isActive);

  // Sahifa tepasidagi holat qatori uchun. Status qiymatlari Prisma enum EMAS,
  // oddiy `String` (`KassaEntry.status`: pending | approved | rejected) —
  // `types.ts#Expense` shuni takrorlaydi. Yangi status o'ylab topilmaydi.
  const queueTotal = queue.groups.reduce((s, g) => s + g.amount, 0);
  const pending = expenses.filter((e) => e.status === "pending");
  const approved = expenses.filter((e) => e.status === "approved");
  const pendingCount = pending.length;
  const pendingAmount = pending.reduce((s, e) => s + e.amount, 0);
  const approvedCount = approved.length;
  const approvedAmount = approved.reduce((s, e) => s + e.amount, 0);
  const rejectedCount = expenses.filter((e) => e.status === "rejected").length;

  const run = async <T,>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Xatolik");
        return null;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
      return res.data ?? null;
    } catch (e) {
      setError(friendlyError(e) || "Xatolik");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleLedger = async (channelId: string) => {
    if (openLedger === channelId) {
      setOpenLedger(null);
      return;
    }
    setOpenLedger(channelId);
    setLedger((await getTransitLedger(channelId)) as unknown as LedgerRow[]);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Sarlavha JORIY BO'LIMNI ko'rsatadi ("Xarajat"), ota bo'lim esa yo'l
          chizig'ida qoladi ("Kassa › Chiqim kassa › Xarajat") — yon paneldagi
          band bilan sahifa sarlavhasi bir xil matn bo'ladi. */}
      <BreadcrumbTrail crumbs={sectionCrumbs(SECTION_ROOT, tab)} />
      <PageHeader
        title={meta?.label ?? (canManageChannels ? "Chiqim kassa" : "Xarajatlar")}
        description={
          meta?.description ??
          (canManageChannels
            ? "Xodim kartalari orqali o'tadigan pul va kassa xarajatlari"
            : "Kassa xarajatlarini ko'rish va tasdiqlash")
        }
        icon={<SectionIcon size={20} />}
        actions={
          canManageChannels ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="md"
                disabled={busy}
                onClick={() =>
                  run(
                    () => autoCreateChannelsFromStatements(),
                    "Vipiskadan kanallar aniqlandi"
                  )
                }
              >
                <Wand2 size={15} /> Vipiskadan aniqlash
              </Button>
              <Button variant="primary" size="md" disabled={busy} onClick={() => setShowNew(true)}>
                <Plus size={15} /> Yangi kanal
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
          <AlertTriangle size={18} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta whitespace-pre-line flex-1" style={{ color: "var(--text-secondary)" }}>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setError(null)}>Yopish</Button>
        </div>
      )}

      {/* CHIQIM HOLATI — endi HAR TABDA ko'rinadi.
          Ilgari bu uchta karta faqat "Xodim kartalari" tabida turardi va u
          yerda ham to'liq bo'yalgan qutilar edi. Natijada "Yopish kerak"
          tabida ochilgan foydalanuvchi sahifaning umumiy holatini —
          nechta chiqim yopilmagan, nechtasi tasdiq kutyapti, kartalarda
          qancha pul qolgan — umuman ko'rmasdi va har savol uchun tab
          almashtirishi kerak edi. `MetricRail` bitta qatorda ~90px oladi,
          ish jadvalini sezilarli pastga surmaydi. */}
      <MetricRail
        columns={canManageChannels ? 5 : 3}
        items={[
          ...(canManageChannels
            ? [
                {
                  label: "Yopish kerak",
                  value: queue.rows.length,
                  unit: "ta",
                  hint: `${formatNum(queueTotal)} so'm vipiskadan`,
                  icon: <ListChecks size={13} />,
                  tone: (queue.rows.length > 0 ? "warning" : "success") as MetricTone,
                },
              ]
            : []),
          {
            label: "Tasdiq kutmoqda",
            value: pendingCount,
            unit: "ta",
            hint: `${formatNum(pendingAmount)} so'm`,
            icon: <AlertTriangle size={13} />,
            tone: (pendingCount > 0 ? "warning" : "success") as MetricTone,
          },
          {
            label: "Tasdiqlangan xarajat",
            value: formatNum(approvedAmount),
            unit: "so'm",
            hint: `${approvedCount} ta yozuv`,
            icon: <ArrowUpRight size={13} />,
            tone: "neutral" as MetricTone,
          },
          ...(canManageChannels
            ? [
                {
                  label: "Kartalarda qoldiq",
                  value: formatNum(totalBalance),
                  unit: "so'm",
                  hint: `${active.length} faol · ${frozen.length} muzlatilgan kanal`,
                  icon: <Wallet size={13} />,
                  tone: (totalBalance < 0 ? "danger" : "brand") as MetricTone,
                  emphasis: true,
                },
                {
                  label: "Bog'lanmagan o'tkazma",
                  value: unlinkedCount,
                  unit: "ta",
                  hint: "qaysi kartaga tushgani noma'lum",
                  icon: <Link2 size={13} />,
                  tone: (unlinkedCount > 0 ? "warning" : "neutral") as MetricTone,
                },
              ]
            : [
                {
                  label: "Rad etilgan",
                  value: rejectedCount,
                  unit: "ta",
                  hint: "qayta ko'rib chiqish uchun",
                  icon: <AlertTriangle size={13} />,
                  tone: (rejectedCount > 0 ? "danger" : "neutral") as MetricTone,
                },
              ]),
        ]}
      />

      {/* `canManageChannels=false` bo'lganda tab almashtirgichning o'zi
          yashiriladi — bitta tab ko'rsatish uchun tanlov taqdim etish
          keraksiz interfeys shovqini bo'lardi. */}
      {allowedTabs.length > 1 && (
        <Tabs
          items={([
            { id: "navbat", label: "Yopish kerak", hint: "Vipiskadan kelgan chiqimni toifalab yopish", count: queue.rows.length || undefined },
            { id: "kartalar", label: "Xodim kartalari", hint: "Kartalar qoldig'i va bog'lanmagan o'tkazmalar", count: unlinked.length || undefined },
            { id: "xojalik", label: "Xo'jalik xarajati", hint: "Ovqat, taksi, non — kunlik xarajatlar" },
            { id: "xarajat", label: "Xarajat", hint: "Kassa xarajatlari ro'yxati va tasdiq oqimi" },
            { id: "oylik", label: "Oylik", hint: "Qaysi manbadan qaysi xodimga berildi", count: payouts.rows.length || undefined },
          ] as TabItem<ChiqimTab>[]).filter((t) => allowedTabs.includes(t.id))}
          value={tab}
          onChange={setTab}
          ariaLabel="Chiqim kassa bo'limlari"
          // FAQAT TELEFONDA: kompyuterda bu ro'yxat yon panelda uchinchi
          // daraja bo'lib turibdi (`NAV_SECTIONS`), ya'ni bir xil tanlov
          // ekranda ikki marta edi. Telefonda yon panel gamburger ortida
          // yashirin, shuning uchun bu qator o'sha yerda qoladi.
          className="md:hidden"
        />
      )}

      {/* Yangi kanal */}
      <ChannelForm
        open={showNew}
        employees={employees}
        busy={busy}
        onCancel={() => setShowNew(false)}
        onSave={async (payload) => {
          const ok = await run(() => upsertChannel(payload), "Kanal qo'shildi");
          if (ok !== null) setShowNew(false);
        }}
      />

      {tab === "kartalar" && (<>
      {/* Kanallar */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Kanallar ({channels.length})
        </h2>
        {channels.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<CreditCard size={28} />}
              title="Kanal yo'q"
              description="Xodim kartalarini vipiskadan avtomatik aniqlash mumkin."
              action={
                <Button variant="secondary" size="sm" disabled={busy}
                  onClick={() => run(() => autoCreateChannelsFromStatements(), "Vipiskadan kanallar aniqlandi")}>
                  <Wand2 size={14} /> Vipiskadan aniqlash
                </Button>
              }
            />
          </div>
        ) : (
          channels.map((c) => (
            <div key={c.id} className="rounded-xl overflow-hidden" style={card}>
              <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CreditCard size={15} style={{ color: "var(--text-muted)" }} />
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{c.label}</span>
                    {c.cardMask && (
                      <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>{c.cardMask}</span>
                    )}
                    <Badge tone="neutral">{CHANNEL_TYPE_LABELS[c.type as ChannelType] ?? c.type}</Badge>
                    {!c.isActive && <Badge tone="warning" icon={<Snowflake size={11} />}>Muzlatilgan</Badge>}
                  </div>
                  <div className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
                    {c.employeeName ? `${c.employeeName} · ` : ""}
                    {c.entryCount} ta harakat
                    {c.lastMovementAt ? ` · oxirgisi ${formatUzDate(c.lastMovementAt)}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>Qoldiq</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: c.balance < 0 ? "var(--danger)" : c.balance > 0 ? "var(--success)" : "var(--text)" }}>
                      {formatNum(c.balance)}
                    </div>
                  </div>
                  <div className="text-right text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <div><ArrowDownRight size={11} className="inline" /> {formatNum(c.totalIn)}</div>
                    <div><ArrowUpRight size={11} className="inline" /> {formatNum(c.totalOut)}</div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-3 flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => toggleLedger(c.id)}>
                  {openLedger === c.id ? "Tarixni yopish" : "Tarix"}
                </Button>
                {c.isActive && (
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => setSpendFor(c)}>
                    Xarajat yozish
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => setChannelActive(c.id, !c.isActive), c.isActive ? "Muzlatildi" : "Qayta yoqildi")}
                >
                  {c.isActive ? <><Snowflake size={13} /> Muzlatish</> : <><Play size={13} /> Yoqish</>}
                </Button>
              </div>

              {openLedger === c.id && (
                <div style={{ borderTop: "1px solid var(--card-border)" }}>
                  <DataTable
                    rows={ledger}
                    columns={LEDGER_COLUMNS}
                    rowKey={(e) => e.id}
                    caption={`${c.label} kanalining pul harakati`}
                    // Kanal kartochkasi ICHIDA — o'z balandligi bilan cheklanmaydi,
                    // aks holda kartochka ichida ikkinchi aylantirish paydo bo'lardi.
                    maxBodyHeight={null}
                    density="compact"
                    emptyTitle="Harakat yo'q"
                    emptyDescription="Bu kanalda hali kirim ham, sarf ham qayd etilmagan."
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Xarajat yozish */}
      {spendFor && (
        <SpendForm
          key={spendFor.id}
          channel={spendFor}
          busy={busy}
          onCancel={() => setSpendFor(null)}
          onSave={async (payload) => {
            const res = await run(
              () => spendFromChannel({ ...payload, channelId: spendFor.id }),
              "Xarajat yozildi"
            );
            if (res !== null) setSpendFor(null);
          }}
        />
      )}

      </>)}

      {tab === "navbat" && (<>
      <ExpenseQueue queue={queue} />

      </>)}

      {tab === "xojalik" && (<>
      {/* Kundalik xo'jalik xarajatlari — 15 oylik tarix Excel'dan import qilingan.
          Tranzit kartalaridan alohida: bular naqd/kassadan to'langan. */}
      {household && household.count > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              Xo&apos;jalik xarajatlari (ovqat, taksi, non)
            </h2>
            <span className="text-meta" style={{ color: "var(--text-muted)" }}>
              {household.count} yozuv · jami {formatNum(household.total)} so&apos;m
            </span>
          </div>
          <DataTable
            rows={household.periods}
            columns={HOUSEHOLD_COLUMNS}
            rowKey={(p) => p.period}
            caption="Xo'jalik xarajatlari oylar kesimida"
            emptyTitle="Xo'jalik xarajati yo'q"
          />
        </div>
      )}

      </>)}

      {tab === "xarajat" && (<>
      {/* Xodimga oylik/avans — "Oylik" toifasi ataylab shu ro'yxatda yo'q
          (`lib/kassaCategories.ts`): u kassa chiqimi emas, `Payout`
          orqali beriladi, aks holda balans ikki marta hisoblanadi. Berilgan
          pul esa yonidagi "Oylik" tabida — manba va xodim kesimida. */}
      <div className="p-4 rounded-xl flex items-center justify-between gap-3 flex-wrap" style={card}>
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>
          Oylik bu ro&apos;yxatda emas — u kassadan <b>Oylik</b> bo&apos;limida
          ko&apos;rinadi (qaysi manbadan qaysi xodimga), pul berish esa oylik
          sahifasida.
        </p>
        <div className="flex items-center gap-2">
          {canViewPayroll && (
            <Button variant="secondary" size="md" onClick={() => setTab("oylik")}>
              <Wallet size={15} /> Oylik reyestri
            </Button>
          )}
          <Link href="/payroll">
            <Button variant="secondary" size="md"><Users size={15} /> Oylik sahifasiga o&apos;tish</Button>
          </Link>
        </div>
      </div>
      {/* Avvalgi mustaqil `/expenses` sahifasi — o'zgarishsiz ko'chirildi
          (props/callback bir xil, faqat joylashuv o'zgardi). */}
        <ExpenseModule
          expenses={expenses}
          lang="uz"
          userRole={userRole}
          balance={expenseBalance}
          categories={expenseCategories}
          // OYLIK YO'LI. Toifalar ro'yxatida "Oylik" paydo bo'ladi va u
          // tanlanganda forma xodim + qaysi oy so'raydi. Yozuv `KassaEntry`
          // EMAS, `Payout` — balans oylikni o'sha jadvaldan sanaydi, kassa
          // yozuvi ham qilinsa bitta to'lov ikki marta hisoblanardi.
          // Majburiyat/ortiqcha to'lov/davr qulfi tekshiruvi serverda
          // (`createPayout`) — bu yerda ikkinchi qoida nusxasi yo'q.
          payroll={
            canViewPayroll
              ? {
                  employees,
                  onSavePayout: async (data) => {
                    try {
                      await createPayout(data);
                      toast.success("Oylik to'lovi yozildi");
                      router.refresh();
                      // Yozuv xarajatlar ro'yxatida ko'rinmaydi (u boshqa
                      // jadvalda) — foydalanuvchini darhol o'z reyestriga
                      // olib o'tamiz, aks holda "saqladim, lekin qani?"
                      // savoli tug'ilardi.
                      setTab("oylik");
                    } catch (e) {
                      toast.error(friendlyError(e));
                      throw e; // modal ochiq qolsin
                    }
                  },
                  // AVANS — boshqa server yo'li. `createPayout` majburiyat
                  // tasdiqlanmagan oyga umuman yozmaydi, avans esa aynan
                  // shu holat uchun: tuzatma + to'lov bitta tranzaksiyada
                  // (`createAvansPayout`).
                  onSaveAvans: async (data) => {
                    try {
                      await createAvansPayout(data);
                      toast.success("Avans berildi");
                      router.refresh();
                      setTab("oylik");
                    } catch (e) {
                      toast.error(friendlyError(e));
                      throw e;
                    }
                  },
                }
              : undefined
          }
          onSaveExpense={async (expense: Partial<Expense>) => {
            const data = {
              amount: Number(expense.amount || 0),
              date: new Date(expense.date as string),
              category: expense.category as string,
              description: expense.description,
              channelId: expense.channelId || undefined,
            };
            if (!data.channelId) {
              toast.error("Pul manbaini tanlang — qaysi schyot yoki plastikdan chiqdi");
              throw new Error("channelId required");
            }
            try {
              if (expense.id) await updateExpense(expense.id, data);
              else await createExpense(data);
              router.refresh();
            } catch (e) {
              toast.error(friendlyError(e));
              throw e; // modal ochiq qolishi uchun xatoni yuqoriga qaytaramiz
            }
          }}
          onDeleteExpense={async (id: string) => { await deleteExpense(id); router.refresh(); }}
          onApproveExpense={async (id: string) => {
            try { await approveExpense(id); router.refresh(); }
            catch (e) { toast.error(friendlyError(e)); }
          }}
          onRejectExpense={async (id: string) => {
            const reason = await prompt({
              title: "Xarajat rad etilsinmi?",
              reasonLabel: "Rad etish sababi",
              reasonPlaceholder: "Nima uchun rad etilyapti?",
              confirmLabel: "Rad etish",
              tone: "danger",
            });
            if (!reason) return;
            try { await rejectExpense(id, reason); router.refresh(); }
            catch (e) { toast.error(friendlyError(e)); }
          }}
        />
      </>)}

      {/* ================= OYLIK REYESTRI =================
          Oylik BALANSDA doim chiqim edi, lekin chiqim EKRANIDA ko'rinmasdi:
          kassadan pul kamayar, xarajatlar ro'yxatida esa hech narsa yo'q edi.
          Bu bo'lim shu bo'shliqni yopadi va ikki ustunga javob beradi —
          QAYSI MANBADAN (kassa kanali) QAYSI XODIMGA.

          FAQAT KO'RISH — bu bo'lim reyestr. Yozuv "Xarajat" yorlig'idagi
          "Oylik"/"Avans" toifasidan yoki `/payroll` dan ketadi; ikkalasi ham
          bitta yo'lga (`Payout`) tushadi, ya'ni bitta to'lov ikki jadvalda
          paydo bo'lmaydi. */}
      {tab === "oylik" && (<>
      <div className="p-4 rounded-xl flex items-center justify-between gap-3 flex-wrap" style={card}>
        <div className="min-w-0">
          <p className="text-body font-semibold" style={{ color: "var(--text)" }}>
            Berilgan oylik va avans — {payouts.rows.length} ta ·{" "}
            <Money value={payouts.total} tone="out" bold />
          </p>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            Kassadan chiqqan real pul. Balansda ham shu summa chiqim sifatida
            turadi — kassa yozuvi (xarajat) sifatida qayta yozilmaydi.
            {avansSummary.count > 0 && (
              <> Shundan <b>avans</b>: {avansSummary.count} ta ·{" "}
                {formatNum(avansSummary.total)} so&apos;m.</>
            )}
          </p>
        </div>
        <Link href="/payroll">
          <Button variant="secondary" size="md"><Users size={15} /> Oylik berish</Button>
        </Link>
      </div>

      {/* Manbasi ko'rsatilmagan to'lovlar — `Payout.channelId` dan oldingi
          qatorlar. Ular kassalar jadvalida "Kanali ko'rsatilmagan" qatorida
          turadi, ya'ni raqam to'g'ri, lekin qaysi hisob kamaygani noma'lum.
          Yashirilmaydi: aks holda jadval "chiroyli, lekin yolg'on" bo'lardi
          (`server/kassaReport.ts` dagi bilan bir xil qoida). */}
      {payouts.unassignedCount > 0 && (
        <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={16} style={{ color: "var(--warning)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            {payouts.unassignedCount} ta to&apos;lovda manba ko&apos;rsatilmagan
            ({formatNum(payouts.unassignedTotal)} so&apos;m) — bular yangi qoidadan
            oldin yozilgan. Ular kassalar jadvalida &quot;Kanali ko&apos;rsatilmagan&quot;
            qatorida turadi.
          </p>
        </div>
      )}

      <DataTable
        rows={payouts.rows}
        columns={PAYOUT_COLUMNS}
        rowKey={(p) => p.id}
        caption="Berilgan oyliklar — manba va xodim kesimida"
        emptyTitle="Oylik berilmagan"
        emptyDescription="Bu ro'yxatda berilgan oylik va avans — xodim, manba va tur kesimida ko'rinadi."
        emptyIcon={<Wallet size={28} />}
      />
      </>)}

      {tab === "kartalar" && (<>
      {/* Bog'lanmagan karta o'tkazmalari */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Bog&apos;lanmagan karta o&apos;tkazmalari ({unlinked.length})
        </h2>
        {unlinked.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<ListChecks size={28} />}
              title="Hammasi bog'langan"
              description="Karta o'tkazmalarining barchasi o'z kanaliga biriktirilgan."
            />
          </div>
        ) : (
          <div className="space-y-2">
            {unlinked.map((t) => (
              <div key={t.id} className="p-3 rounded-xl flex items-center justify-between gap-3 flex-wrap" style={card}>
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: "var(--text)" }}>
                    {t.holderName ?? "Nomsiz"}{" "}
                    {t.cardMask && (
                      <span className="text-micro tabular-nums font-normal" style={{ color: "var(--text-muted)" }}>{t.cardMask}</span>
                    )}
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    {formatUzDate(t.valueDate)} · {t.accountLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums whitespace-nowrap">
                    <Money value={-Math.abs(Number(t.amount))} tone="out" bold />
                  </span>
                  <Select
                    size="sm"
                    fullWidth={false}
                    defaultValue=""
                    disabled={busy}
                    placeholder="Kanalni tanlang…"
                    aria-label={`${t.holderName ?? "Nomsiz"} o'tkazmasini kanalga bog'lash`}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void run(
                        () => linkCardTransfer({ transactionId: t.id, channelId: e.target.value }),
                        "Kanalga bog'landi"
                      );
                    }}
                  >
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}{c.cardMask ? ` (${c.cardMask})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Link2 size={14} style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>)}

    </div>
  );
}

// ── Yordamchi formalar ───────────────────────────────────────────────────

function ChannelForm({
  open, employees, busy, onCancel, onSave,
}: {
  open: boolean;
  employees: { id: string; fullName: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { type: ChannelType; label: string; employeeId: string | null; cardMask: string | null }) => void;
}) {
  const [label, setLabel] = useState("");
  const [cardMask, setCardMask] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<ChannelType>("employee_card");

  const submit = () => {
    if (!label.trim()) return;
    onSave({ type, label, cardMask: cardMask || null, employeeId: employeeId || null });
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      dismissable={!busy}
      size="lg"
      title="Yangi kanal"
      description="Pul qaysi karta yoki seyf orqali o'tishini shu yerda ro'yxatga olasiz."
      footer={
        <>
          <Button type="button" variant="secondary" size="md" disabled={busy} onClick={onCancel}>
            Bekor qilish
          </Button>
          <Button type="submit" form={CHANNEL_FORM_ID} variant="primary" size="md" loading={busy} disabled={busy || !label.trim()}>
            Saqlash
          </Button>
        </>
      }
    >
      <form
        id={CHANNEL_FORM_ID}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={submitOnCtrlEnter(submit)}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Turi" required>
            <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
              {(Object.keys(CHANNEL_TYPE_LABELS) as ChannelType[]).map((t) => (
                <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nom" required>
            <input
              className="erp-input w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Masalan: Uchqun Azimboyev"
            />
          </Field>
          <Field
            label="Karta niqobi"
            hint="To'liq karta raqami saqlanmaydi — faqat niqob (birinchi 4 va oxirgi 4 raqam)."
          >
            <input
              className="erp-input w-full"
              value={cardMask}
              onChange={(e) => setCardMask(e.target.value)}
              placeholder="8600****4957"
            />
          </Field>
          <Field label="Xodim (ixtiyoriy)">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="— Bog'lanmagan —">
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function SpendForm({
  channel, busy, onCancel, onSave,
}: {
  channel: Channel;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { amount: number; date: string; category: string; description?: string }) => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  // Toshkent kalendari — UTC standart tunda kecha sanani berardi.
  const [date, setDate] = useState(todayKey());
  const [category, setCategory] = useState<string>("ijara");
  const [description, setDescription] = useState("");

  const value = amount ?? 0;
  // Qoldiqdan ortiq sarf — server ham to'sadi, bu faqat oldindan ogohlantirish.
  const over = value > channel.balance;
  const canSave = !busy && value > 0 && !over;

  const submit = () => {
    if (!canSave) return;
    onSave({ amount: value, date, category, description });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      dismissable={!busy}
      size="lg"
      title={`${channel.label} — xarajat yozish`}
      description={`Kanal qoldig'i: ${formatNum(channel.balance)} so'm`}
      footer={
        <>
          <Button type="button" variant="secondary" size="md" disabled={busy} onClick={onCancel}>
            Bekor qilish
          </Button>
          <Button type="submit" form={SPEND_FORM_ID} variant="primary" size="md" loading={busy} disabled={!canSave}>
            Yozish
          </Button>
        </>
      }
    >
      <form
        id={SPEND_FORM_ID}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={submitOnCtrlEnter(submit)}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Summa"
            required
            error={over ? `Qoldiqdan ${formatNum(value - channel.balance)} so'm ortiq — bunday yozuvga yo'l qo'yilmaydi.` : null}
          >
            <MoneyField value={amount} onChange={setAmount} placeholder="10 000 000" />
          </Field>
          <Field label="Sana" required>
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Toifa" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as never] ?? c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Izoh">
            <input
              className="erp-input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ixtiyoriy"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
