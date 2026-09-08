import { listInvoices, currentInvoicePeriod } from "@/server/invoices";
import { isMonthPeriod } from "@/lib/periods";
import InvoicesClient from "./InvoicesClient";

/**
 * DAVR VA SAHIFA — URL'da, filtrlash esa SERVERDA.
 *
 * Ilgari sahifa butun ro'yxatni (500 tagacha) olib kelardi va davr bo'yicha
 * filtr mijozda ishlardi. Sahifalash qo'shilgach bu ishlamaydi: birinchi
 * sahifadagi 25 ta yozuv tanlangan davrga umuman tegishli bo'lmasligi mumkin
 * va ekran "schyot yo'q" deb ko'rsatardi. Shuning uchun ikkala shart ham
 * so'rovga tushadi.
 */
export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const fallbackPeriod = await currentInvoicePeriod();
  // URL'dan kelgan xom qiymat: noto'g'ri bo'lsa `listInvoices` xato tashlardi
  // va foydalanuvchi ro'yxat o'rniga xato sahifasini ko'rardi.
  const period = isMonthPeriod(sp.period) ? sp.period : fallbackPeriod;
  const requested = Number.parseInt(sp.page ?? "", 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;

  const data = await listInvoices(period, { page });

  return (
    <div className="p-6">
      <InvoicesClient
        initialPeriod={period}
        page={JSON.parse(JSON.stringify(data))}
      />
    </div>
  );
}
