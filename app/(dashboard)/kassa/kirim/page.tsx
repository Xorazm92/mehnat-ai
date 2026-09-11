import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { getBankAccountsOverview, getUnmatchedIncome } from "@/server/bank/read";
import { getAvailableBalance, getDayMovement, getMonthBreakdown } from "@/lib/balance";
import { getUnallocatedVsDebt } from "@/server/debt";
import { prisma } from "@/lib/prisma";
import KirimKassaClient from "./KirimKassaClient";
import { readTabParam } from "@/lib/tabs";
import { KIRIM_TAB_IDS, type KirimTab } from "@/lib/kirimTabs";

export const metadata = { title: "Kirim kassa" };

export default async function KirimKassaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Yorliq SERVERDA tekshiriladi: mijozda `window.location` dan o'qilsa
  // hidratsiya mos kelmaydi (`lib/tabs.ts` izohiga qarang).
  const sp = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  // proxy.ts ham to'sadi, lekin sahifa o'zini o'zi qo'riqlashi kerak —
  // to'g'ridan-to'g'ri chaqiruvda (RSC) proxy oralig'i bo'lmasligi mumkin.
  //
  // `currentUserViews()` — proxy bilan AYNAN bir manba (rol + override +
  // biriktiruv). Ilgari bu yerda `canSeeViewWith(role, view, overrides)`
  // turardi, ya'ni biriktiruvni BILMASDI: proxy bank-biriktiruvi bor
  // buxgalterni kiritar, sahifa esa `/cabinet` ga qaytarar, yon panel o'sha
  // havolani qayta prefetch qilar — natijada cheksiz sikl.
  const views = await currentUserViews();
  if (!views.includes("kassa_income")) redirect("/cabinet");

  // `getNonBankIncome()` bu yerdan OLIB TASHLANDI: u faqat tepadagi uchta
  // stat kartani to'ldirardi, kartalar esa reyestr kartalari bilan
  // takrorlanib, boshqa davrni ko'rsatgani uchun olib tashlandi. So'rov
  // qolganda har ochilishda 200 qator bekorga o'qilib klientga jo'natilardi.
  //
  // Sahifa tepasidagi plitkalar uchun QAT'IY davrli raqamlar: bugun, joriy
  // oy va hozirgi qoldiq. Ular `lib/balance.ts` dagi mavjud agregatlardan
  // keladi — yangi so'rov turi kiritilmadi.
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 1C kesimi bo'yicha to'lagan, lekin ASROda taqsimlanmagan firmalar —
  // navbat yorlig'ining ikkinchi qismi. Kesim topilmasa bo'sh qaytadi, ya'ni
  // sahifa baribir ochiladi (1C fayli yuklanmagan bo'lishi ham mumkin).
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [accounts, unmatched, dayMovement, monthBreakdown, balance, unallocated] = await Promise.all([
    getBankAccountsOverview(),
    getUnmatchedIncome(),
    getDayMovement(today),
    getMonthBreakdown(now.getFullYear(), now.getMonth() + 1),
    getAvailableBalance(),
    getUnallocatedVsDebt(period),
  ]);

  // Mijozlar ro'yxati — moslashtirilmagan tranzaksiyani qo'lda bog'lash uchun.
  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: {
      id: true,
      name: true,
      inn: true,
      contracts: { where: { isActive: true }, select: { id: true, number: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="h-full">
      <KirimKassaClient
        accounts={JSON.parse(JSON.stringify(accounts))}
        unmatched={JSON.parse(JSON.stringify(unmatched))}
        unallocated={JSON.parse(JSON.stringify(unallocated))}
        period={period}
        companies={JSON.parse(JSON.stringify(companies))}
        kpi={{
          todayIncome: dayMovement.income,
          monthIncome: monthBreakdown.income,
          balance: balance.balance,
        }}
        initialTab={readTabParam<KirimTab>(sp.tab, KIRIM_TAB_IDS, "reyestr")}
      />
    </div>
  );
}
