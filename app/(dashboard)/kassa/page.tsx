// BOSH KASSA — FAQAT "PUL QAYERDA TURIBDI".
//
// Ilgari bu sahifada uchta har xil moliyaviy savol bitta ekranga qo'yilgan edi:
// kassalar qoldig'i, umumiy balans va 150+ firmaning oylik to'lov jadvali.
// Natijada foydalanuvchi bir vaqtda uch xil "balans" va ikki xil firma
// ro'yxatini ko'rar va "qaysi raqam haqiqiy?" degan savol tug'ilardi.
//
// Endi taqsimot aniq:
//   /kassa            — kassalar qoldig'i + umumiy balans (shu sahifa)
//   /kassa/kirim      — tushumlar reyestri va moslashtirilmagan kirimlar
//   /kassa/qarzdorlik — kim qarzdor + firmalar bo'yicha oylik to'lovlar
import { getAvailableBalance } from "@/lib/balance";
import { getCashDeskReport } from "@/server/kassaReport";
import CashDeskTable from "./CashDeskTable";
import KassaClient from "./KassaClient";

export const metadata = { title: "Kassa" };

export default async function KassaPage() {
  const balance = await getAvailableBalance();

  // Kassalar jadvali — auditning markaziy jadvali. Xato bo'lsa sahifa
  // yiqilmasin: balans bloki baribir foydali.
  const cashDesk = await getCashDeskReport().catch(() => null);

  return (
    <div className="h-full p-4 md:p-6 space-y-4">
      {cashDesk && <CashDeskTable report={JSON.parse(JSON.stringify(cashDesk))} />}
      <KassaClient balance={JSON.parse(JSON.stringify(balance))} />
    </div>
  );
}
