// BOSH KASSA — "PUL QAYERDA TURIBDI", "PUL NIMAGA KETDI" VA
// "QAYSI PUL QAYDI O'TDI".
//
// Sahifa tartibi buxgalterning kundalik ish tartibiga mos:
//   1. Balans geroyi      — hozir qancha pul bor (umumiy manzara)
//   2. Operatsiyalar jurnal — kundalik ISH joyi: barcha harakat bitta
//      jadvalda, tez kiritish, eksport. Excelda hammasi bir varaqda
//      bo'lgani uchun odamlar uni sevardi — shu tamoyil.
//   3. Kassalar qoldig'i / Moddalar kesimi — oy yakuni hisobotlari,
//      YIG'ILADIGAN: ularni har safar ko'rish shart emas va ochiq turganda
//      asosiy ish joyini pastga surib yuborar edi ("bosh aylanishi"ning
//      sabablaridan biri shu edi — uchta hisobot bitta ekranda stack bo'lib).
//
// Hisobotlar oyi URL dan olinadi (`?oy=2026-07`); jurnal esa o'z davr
// tanlagichi bilan mustaqil ishlaydi.
import { getAvailableBalance, getMonthBreakdown } from "@/lib/balance";
import { getCashDeskReport, getCategoryBreakdown } from "@/server/kassaReport";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentUserViews } from "@/server/rbac";
import {
  KASSA_CATEGORIES_KEY,
  resolveKassaCategories,
} from "@/lib/kassaCategories";
import { formatPeriodLabel, normalizePeriodKey, periodKeyOf } from "@/lib/periods";
import CashDeskTable from "./CashDeskTable";
import CategoryBreakdown from "./CategoryBreakdown";
import PeriodPicker from "./PeriodPicker";
import KassaClient from "./KassaClient";
import JournalClient from "./JournalClient";
import KassaSectionNav from "@/components/KassaSectionNav";

export const metadata = { title: "Kassa" };

/**
 * Hisobotni yutib yubormasdan o'qiyniki: xato bo'lsa SABABI ekranga chiqadi.
 * Ilgari `.catch(() => null)` edi — jadval shunchaki g'oyib bo'lardi va
 * buxgalter "ma'lumot yo'q" bilan "yuklanmadi" ni ajrata olmasdi.
 */
async function safe<T>(label: string, p: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await p, error: null };
  } catch {
    return { data: null, error: label };
  }
}

export default async function KassaPage({
  searchParams,
}: {
  searchParams: Promise<{ oy?: string }>;
}) {
  const { oy } = await searchParams;
  // Xom `?oy=` qiymati ishonchsiz — normalizatsiya qilinadi, yaroqsiz bo'lsa
  // joriy oyga qaytadi (aks holda "YYYY-MM" kutilgan joyga axlat tushardi).
  const period = /^\d{4}-\d{2}$/.test(normalizePeriodKey(oy ?? ""))
    ? normalizePeriodKey(oy!)
    : periodKeyOf(new Date());

  const [y, m] = period.split("-").map(Number);
  const session = await auth();
  const userRole = (session?.user?.role as string) || "";
  const [balance, views] = await Promise.all([getAvailableBalance(), currentUserViews()]);

  // Korxona lug'ati — jurnal tez kiritish formasi uchun.
  const catRow = await prisma.systemSetting.findUnique({
    where: { key: KASSA_CATEGORIES_KEY },
  });
  const cats = resolveKassaCategories(catRow?.value);

  const [cashDesk, categories, monthly] = await Promise.all([
    safe("Kassalar jadvali", getCashDeskReport(period)),
    safe("Moddalar kesimi", getCategoryBreakdown(period)),
    safe("Oylik kesim", getMonthBreakdown(y, m)),
  ]);
  const failed = [cashDesk.error, categories.error, monthly.error].filter(Boolean) as string[];

  return (
    <div className="h-full p-4 md:p-6 space-y-4">
      {/* Kassa bo'limlari orasidagi ko'chish — bir joyda, har doim ko'rinadi.
          "Qayerga borishni bilmayman" muammosining to'g'ridan-to'g'ri yechimi. */}
      <KassaSectionNav views={views} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Kassa — umumiy ko&apos;rinish
        </h1>
        {/* Davr tanlagich FAQAT quyidagi oylik hisobotlarga tegishli —
            jurnal o'z davri bilan mustaqil. */}
        <PeriodPicker period={period} />
      </div>

      {failed.length > 0 && (
        <div
          className="p-3 rounded-xl flex items-start gap-2 text-meta"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
          role="alert"
        >
          <span style={{ color: "var(--danger)" }} aria-hidden>
            ⚠
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            Hisobot yuklanmadi: <b>{failed.join(", ")}</b>. Sahifani yangilang;
            takrorlansa tizim administratoriga murojaat qiling.
          </span>
        </div>
      )}

      <KassaClient
        balance={balance}
        monthly={monthly.data ?? undefined}
        periodLabel={formatPeriodLabel(period)}
      />

      <JournalClient
        userRole={userRole}
        incomeCategories={cats.income}
        expenseCategories={cats.expense}
      />

      {/* OY YAKUNI HISOBOTLARI — yig'ilgan. Kundalik ish jurnalda; bu ikkisi
          oy oxirida solishtirish uchun. `<details>` — state'siz, seanslar
          orasida React holatini buzmaydi va chop etishda ham ishlaydi. */}
      <details>
        <summary className="cursor-pointer select-none text-meta font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-[var(--input-bg)]" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}>
          Kassalar qoldig&apos;i va moddalar kesimi — {formatPeriodLabel(period)}{" "}
          <span className="font-normal" style={{ color: "var(--text-muted)" }}>
            (oy yakuni hisobotlari)
          </span>
        </summary>
        <div className="mt-3 space-y-4">
          {cashDesk.data && <CashDeskTable report={cashDesk.data} />}
          {categories.data && <CategoryBreakdown data={categories.data} />}
        </div>
      </details>
    </div>
  );
}
