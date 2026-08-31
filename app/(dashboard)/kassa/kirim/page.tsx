import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { getBankAccountsOverview, getUnmatchedIncome, getNonBankIncome } from "@/server/bankImport";
import { prisma } from "@/lib/prisma";
import KirimKassaClient from "./KirimKassaClient";
import KassaSectionNav from "@/components/KassaSectionNav";
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

  const [accounts, unmatched, nonBank] = await Promise.all([
    getBankAccountsOverview(),
    getUnmatchedIncome(),
    // Plastik va naqd — bank vipiskasidan tashqaridagi tushumlar.
    getNonBankIncome(),
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
      <div className="px-4 md:px-6 pt-4">
        <KassaSectionNav views={views} />
      </div>
      <KirimKassaClient
        accounts={JSON.parse(JSON.stringify(accounts))}
        unmatched={JSON.parse(JSON.stringify(unmatched))}
        nonBank={JSON.parse(JSON.stringify(nonBank))}
        companies={JSON.parse(JSON.stringify(companies))}
        initialTab={readTabParam<KirimTab>(sp.tab, KIRIM_TAB_IDS, "reyestr")}
      />
    </div>
  );
}
