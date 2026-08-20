// BOSH KASSA — FAQAT "PUL QAYERDA TURIBDI" VA "PUL NIMAGA KETDI".
//
// Ilgari bu sahifada uchta har xil moliyaviy savol bitta ekranga qo'yilgan edi:
// kassalar qoldig'i, umumiy balans va 150+ firmaning oylik to'lov jadvali.
// Natijada foydalanuvchi bir vaqtda uch xil "balans" va ikki xil firma
// ro'yxatini ko'rar va "qaysi raqam haqiqiy?" degan savol tug'ilardi.
//
// Endi taqsimot aniq:
//   /kassa            — kassalar qoldig'i + moddalar kesimi + umumiy balans
//   /kassa/kirim      — tushumlar reyestri va moslashtirilmagan kirimlar
//   /kassa/chiqim     — kanallar, xodim kartalari daftari, xarajat yozish
//   /kassa/qarzdorlik — kim qarzdor + firmalar bo'yicha oylik to'lovlar
//
// OY URL DAN OLINADI (`?oy=2026-07`). Bungacha sahifa joriy oyga qotib
// qolgan edi va o'tgan oy qoldig'ini ko'rish imkoni umuman yo'q edi.
import { getAvailableBalance, getMonthBreakdown } from "@/lib/balance";
import { getCashDeskReport, getCategoryBreakdown } from "@/server/kassaReport";
import { formatPeriodLabel, normalizePeriodKey, periodKeyOf } from "@/lib/periods";
import CashDeskTable from "./CashDeskTable";
import CategoryBreakdown from "./CategoryBreakdown";
import PeriodPicker from "./PeriodPicker";
import KassaClient from "./KassaClient";

export const metadata = { title: "Kassa" };

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
  const balance = await getAvailableBalance();

  // Hisobotlar xato bersa sahifa yiqilmasin: balans bloki baribir foydali.
  const [cashDesk, categories, monthly] = await Promise.all([
    getCashDeskReport(period).catch(() => null),
    getCategoryBreakdown(period).catch(() => null),
    getMonthBreakdown(y, m).catch(() => null),
  ]);

  return (
    <div className="h-full p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Kassa
        </h1>
        <PeriodPicker period={period} />
      </div>

      {cashDesk && <CashDeskTable report={JSON.parse(JSON.stringify(cashDesk))} />}
      {categories && <CategoryBreakdown data={JSON.parse(JSON.stringify(categories))} />}
      <KassaClient
        balance={JSON.parse(JSON.stringify(balance))}
        monthly={monthly ? JSON.parse(JSON.stringify(monthly)) : undefined}
        periodLabel={formatPeriodLabel(period)}
      />
    </div>
  );
}
