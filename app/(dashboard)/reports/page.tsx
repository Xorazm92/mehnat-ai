import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getCachedCompanies,
  getCachedOwnFirmCompanies,
  getCachedUsers,
  getCachedOperations,
  getCachedObligationCoverage,
} from "@/lib/cached-queries";
import { getRoleContext } from "@/server/roleContext";
import { getEffectiveReportColumns } from "@/server/report-columns";
import { getCurrentPeriodKey, normalizePeriodKey, toObligationMonthKey } from "@/lib/periods";
import { readTabParam } from "@/lib/tabs";
import { REPORTS_TAB_IDS, type ReportsTabId } from "@/lib/reportsTabs";
import ReportsClient from "./ReportsClient";

export const metadata = { title: "Hisobotlar" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; col?: string; period?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  // Sessiyasiz davom etilsa `getEffectiveReportColumns()` "Unauthorized"
  // tashlaydi va foydalanuvchi login o'rniga 500 ko'radi. Sessiya proxy
  // o'tkazgandan KEYIN ham tugashi mumkin (mutlaq 24 soatlik muddat yoki
  // xodim bloklanishi), shuning uchun sahifa o'zini o'zi tekshiradi —
  // loyihadagi boshqa ekranlar kabi.
  if (!session) redirect("/login?expired=1");

  /**
   * Davr SERVERDA hal qilinadi: `new Date()` ni mijozda chaqirish SSR bilan
   * farq qilib hidratsiyani sindirishi mumkin edi.
   *
   * `normalizePeriodKey` — chunki dalil chuqur havolasi ("2026 Avgust" kabi
   * matnli davr bo'lishi mumkin) ham shu yerdan o'tadi; o'qib bo'lmaydigan
   * qiymat jimgina joriy oyga qaytadi.
   */
  const normalizedPeriod = normalizePeriodKey(sp.period ?? "");
  const initialPeriod = /^\d{4}-\d{2}$/.test(normalizedPeriod)
    ? normalizedPeriod
    : getCurrentPeriodKey();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const userName = session?.user?.name ?? "";

  // Matritsa foizining MAXRAJI shu ro'yxatdan chiqadi ("kim topshirishi
  // shart"), shuning uchun u davrga bog'liq va davr o'zgarganda qayta olinadi.
  const obligationMonthKey = toObligationMonthKey(initialPeriod) ?? "";

  // Matritsa MIJOZ/ICHKI FIRMA ajratmasini bilmasligi kerak: bu ish kuzatuv
  // ekrani ("kim nima topshirishi shart"), moliyaviy hisobot emas. ASRO'ning
  // o'z firmalariga ham buxgalter biriktiriladi va ular uchun ham majburiyat
  // yaratiladi (getCachedObligationCoverage isOwnFirm'ni tekshirmaydi) —
  // `getCachedCompanies` ularni chiqarib tashlagani uchun biriktirilgan
  // xodim ularning katagini belgilay olmasdi.
  const roleContext = await getRoleContext().catch(() => "all" as const);

  const [companies, ownFirmCompanies, staff, operations, reportColumns, obligationCoverage] = await Promise.all([
    getCachedCompanies(userId, userRole, roleContext),
    getCachedOwnFirmCompanies(userId, userRole, roleContext),
    getCachedUsers(userId, userRole),
    getCachedOperations(userId, userRole),
    getEffectiveReportColumns(),
    obligationMonthKey
      ? getCachedObligationCoverage(userId, userRole, obligationMonthKey)
      : Promise.resolve([]),
  ]);

  const mappedStaff = staff.map((u) => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  const allCompanies = [...companies, ...ownFirmCompanies];

  return (
    <div className="h-full">
      <ReportsClient
        companies={JSON.parse(JSON.stringify(allCompanies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
        currentUserId={userId}
        userName={userName}
        focusCompany={sp.company ?? null}
        focusCol={sp.col ?? null}
        initialPeriod={initialPeriod}
        reportColumns={reportColumns}
        obligationCoverage={obligationCoverage}
        initialTab={readTabParam<ReportsTabId>(sp.tab, REPORTS_TAB_IDS, "matrix")}
      />
    </div>
  );
}
