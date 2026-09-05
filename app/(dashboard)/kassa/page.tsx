// BOSH KASSA — "PUL QAYERDA TURIBDI", "PUL NIMAGA KETDI" VA
// "QAYSI PUL QAYDI O'TDI".
//
// SAHIFA IERARXIYASI. Ilgari bu ekran bir xil og'irlikdagi kartochkalar
// to'plami edi — balans kartasi, grafik kartasi, jurnal kartasi, hisobot
// kartasi. Ko'z qayerdan boshlashini bilmasdi, chunki RO'YXAT bor edi,
// IERARXIYA yo'q. Endi to'rt bosqich `SectionHeader` bilan ochiq belgilangan
// va ular buxgalterning savollari tartibida keladi:
//
//   01 POZITSIYA    — hozir qancha pul bor va u qayerda turibdi
//   02 PUL OQIMI    — qanday oqyapti + shu yerdan qilinadigan amallar
//   03 OPERATSIYALAR — kundalik ISH joyi: barcha harakat bitta jadvalda,
//                      tez kiritish, eksport (Excelda hammasi bir varaqda
//                      bo'lgani uchun odamlar uni sevardi — shu tamoyil)
//   04 TAHLIL       — oy yakuni hisobotlari, YIG'ILADIGAN: ularni har safar
//                      ko'rish shart emas va ochiq turganda asosiy ish
//                      joyini pastga surib yuborardi
//
// Hisobotlar oyi URL dan olinadi (`?oy=2026-07`); jurnal esa o'z davr
// tanlagichi bilan mustaqil ishlaydi.
import {
  getAvailableBalance,
  getDayMovement,
  getMonthBreakdown,
  getWeeklyMovement,
} from "@/lib/balance";
import { getCashDeskReport, getCategoryBreakdown } from "@/server/kassaReport";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import {
  KASSA_CATEGORIES_KEY,
  resolveKassaCategories,
} from "@/lib/kassaCategories";
import { formatPeriodLabel, normalizePeriodKey, periodKeyOf } from "@/lib/periods";
import CashDeskTable from "./CashDeskTable";
import CategoryBreakdown from "./CategoryBreakdown";
import { PageHeader, SectionHeader } from "@/components/ui";
import { Wallet } from "lucide-react";
import PeriodPicker from "./PeriodPicker";
import KassaClient from "./KassaClient";
import JournalClient from "./JournalClient";
import WeeklyFlowChart from "./WeeklyFlowChart";
import QuickActions from "./QuickActions";

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
  if (!session) redirect("/login?expired=1");

  // Sahifa O'ZINI O'ZI qo'riqlaydi. Ilgari bu darvoza YO'Q edi — qolgan
  // to'rtta kassa sahifasidan farqli, bu sahifa faqat `proxy.ts` ga
  // tayanardi. To'g'ridan-to'g'ri RSC chaqiruvida proxy oralig'i
  // bo'lmasligi mumkin, va `proxy.ts` moslik topilmasa fail-open ishlaydi.
  //
  // `currentUserViews()` — proxy bilan AYNAN bir manba (rol + override +
  // biriktiruv), ya'ni sahifa va marshrut bir xil javob beradi va
  // prefetch-redirect sikli tug'ilmaydi.
  const views = await currentUserViews();
  if (!views.includes("kassa")) redirect("/cabinet");

  const userRole = (session.user?.role as string) || "";
  const balance = await getAvailableBalance();

  // Korxona lug'ati — jurnal tez kiritish formasi uchun.
  const catRow = await prisma.systemSetting.findUnique({
    where: { key: KASSA_CATEGORIES_KEY },
  });
  const cats = resolveKassaCategories(catRow?.value);

  // Bugungi harakat — `getDayMovement` arzon agregat (4 ta `_sum`), sahifaga
  // qo'shimcha og'irlik bermaydi. "Bugun nima bo'ldi" — buxgalter ertalab
  // beradigan birinchi savol va u ilgari bu ekranda umuman yo'q edi.
  const [cashDesk, categories, monthly, weekly, today] = await Promise.all([
    safe("Kassalar jadvali", getCashDeskReport(period)),
    safe("Moddalar kesimi", getCategoryBreakdown(period)),
    safe("Oylik kesim", getMonthBreakdown(y, m)),
    safe("Haftalik dinamika", getWeeklyMovement(5)),
    safe("Bugungi harakat", getDayMovement(new Date())),
  ]);
  const failed = [cashDesk.error, categories.error, monthly.error].filter(Boolean) as string[];

  return (
    <div className="h-full p-4 md:p-6 space-y-6">
      <PageHeader
        title="Kassa — umumiy ko'rinish"
        description="Balans, haftalik dinamika va operatsiyalar jurnali"
        icon={<Wallet size={20} />}
        /* Davr tanlagich FAQAT quyidagi oylik hisobotlarga tegishli —
           jurnal o'z davri bilan mustaqil. */
        actions={<PeriodPicker period={period} />}
      />

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

      {/* ═══ 01 · POZITSIYA ═══ */}
      <section>
        <SectionHeader
          step="01"
          eyebrow="Pozitsiya"
          title="Kassa balansi"
          description="Mavjud qoldiq, uning naqd/tranzit taqsimoti va davr harakati"
        />
        <KassaClient
          balance={balance}
          monthly={monthly.data ?? undefined}
          today={today.data ?? undefined}
          periodLabel={formatPeriodLabel(period)}
        />
      </section>

      {/* ═══ 02 · PUL OQIMI ═══
          Grafik va tezkor amallar YONMA-YON: "holatni ko'rdim" bilan
          "endi nima qilaman" orasida sahifani aylantirish bo'lmasligi kerak. */}
      <section>
        <SectionHeader
          step="02"
          eyebrow="Pul oqimi"
          title="Dinamika va tezkor amallar"
          description="Oxirgi haftalar kesimi — kirim, chiqim va sof oqim"
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div className="lg:col-span-2">
            {weekly.data && <WeeklyFlowChart weeks={weekly.data} />}
          </div>
          <QuickActions />
        </div>
      </section>

      {/* ═══ 03 · OPERATSIYALAR ═══ */}
      <section>
        <SectionHeader
          step="03"
          eyebrow="Operatsiyalar"
          title="Kassa jurnali"
          description="Kundalik ish joyi — barcha harakat bitta jadvalda, tez kiritish va eksport"
        />
        <JournalClient
          userRole={userRole}
          incomeCategories={cats.income}
          expenseCategories={cats.expense}
        />
      </section>

      {/* ═══ 04 · TAHLIL ═══
          Oy yakuni hisobotlari — YIG'ILGAN. Kundalik ish jurnalda; bu ikkisi
          oy oxirida solishtirish uchun. `<details>` — state'siz, seanslar
          orasida React holatini buzmaydi va chop etishda ham ishlaydi. */}
      <section>
        <SectionHeader
          step="04"
          eyebrow="Tahlil"
          title={`Oy yakuni hisobotlari — ${formatPeriodLabel(period)}`}
          description="Kassalar qoldig'i va moddalar kesimi; har kuni ochish shart emas"
        />
        <details className="group">
          <summary
            className="cursor-pointer select-none flex items-center justify-between gap-3 text-body font-medium px-4 py-2.5 rounded-xl transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              color: "var(--text-primary)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <span>Kassalar qoldig&apos;i va moddalar kesimi</span>
            <span className="text-micro font-semibold" style={{ color: "var(--brand)" }}>
              <span className="group-open:hidden">Ochish</span>
              <span className="hidden group-open:inline">Yopish</span>
            </span>
          </summary>
          <div className="mt-3 space-y-4">
            {cashDesk.data && <CashDeskTable report={cashDesk.data} />}
            {categories.data && <CategoryBreakdown data={categories.data} />}
          </div>
        </details>
      </section>
    </div>
  );
}
