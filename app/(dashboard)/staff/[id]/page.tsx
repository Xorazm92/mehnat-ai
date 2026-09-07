import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getCachedUserById,
  getCachedCompanies,
  getCachedOwnFirmCompanies,
} from "@/lib/cached-queries";
import { getRoleViewOverrides } from "@/server/rbac";
import { getMonthlyPerformance } from "@/server/kpi";
import { getPayrollAdjustments } from "@/server/payroll";
import { getAttendance, deriveAttendanceKpi } from "@/server/attendance";
import { getObligations } from "@/server/obligations";
import { getTasks } from "@/server/tasks";
import { countWorkdays } from "@/lib/attendance";
import { getCurrentPeriodKey, normalizePeriodKey } from "@/lib/periods";
import {
  isAdminRole,
  isSeniorRole,
  effectiveViewsForRole,
  VIEW_LABELS,
  type CompanyRelation,
  type UserRole,
} from "@/lib/platform/permissions";
import { assignedCompaniesFor } from "@/components/employee-detail/companyRoles";
import type { EmployeeDossier } from "@/components/employee-detail/types";
import EmployeeDetailClient from "./EmployeeDetailClient";

/**
 * XODIM KARTASI — to'liq sahifa.
 *
 * Ilgari bu karta 560px li yon panel (`StaffDrawer`) edi va faqat to'rtta
 * bo'lim ko'rsatardi. Endi u alohida manzil: havolasi ulashiladi, orqaga
 * tugmasi ishlaydi, tanlangan yorliq (`?tab=`) sahifa yangilanganda qoladi va
 * KPI/oylik/davomat kabi og'ir bo'limlarga joy yetadi.
 */

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function loadPerson(id: string) {
  const session = await auth();
  const viewerId = session?.user?.id ?? "";
  const viewerRole = session?.user?.role || "employee";
  const person = await getCachedUserById(viewerId, viewerRole, id);
  if (!person) return null;
  return { viewerId, viewerRole, person };
}

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const loaded = await loadPerson(id);
  return { title: loaded ? loaded.person.fullName : "Xodim" };
}

/**
 * "3 yil 2 oy" — staj. Serverda hisoblanadi: mijoz soati bilan farq qilsa
 * gidratatsiya buziladi.
 *
 * Kirish `Date` EMAS, `string` bo'lishi mumkin: `getCachedUserById`
 * `unstable_cache` ortida yotadi va u natijani JSON qilib saqlaydi — sana
 * matnga aylanib qaytadi. Bu farq jimgina emas edi: `hiredAt.getFullYear()`
 * to'g'ridan-to'g'ri chaqirilganda sahifa TypeError bilan yiqilardi (ishga
 * kirgan sanasi to'ldirilgan xodimlarda).
 */
function tenureLabel(hiredAt: Date | string | null | undefined, now: Date): string | null {
  if (!hiredAt) return null;
  const start = hiredAt instanceof Date ? hiredAt : new Date(hiredAt);
  if (Number.isNaN(start.getTime())) return null;
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} oy`;
  return m === 0 ? `${y} yil` : `${y} yil ${m} oy`;
}

export default async function EmployeeDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const loaded = await loadPerson(id);
  // Portfelida bo'lmagan (yoki umuman mavjud bo'lmagan) xodim ID si — 404.
  // Ro'yxat so'rovi bilan bir xil darvoza (`lib/access.ts#scopedStaffIds`).
  if (!loaded) notFound();

  const { viewerId, viewerRole, person } = loaded;

  /**
   * KO'RSATILAYOTGAN OY — `?oy=YYYY-MM`, standart joriy oy.
   *
   * KPI, oylik va davomat — uchalasi ham OYLIK kesim. Qotirilgan joriy oyda
   * karta oyning birinchi kunlarida uchta bo'sh panel ko'rsatardi va o'tgan
   * oyning yopilgan raqamlariga umuman yetib bo'lmasdi.
   */
  const oyParam = (await searchParams).oy;
  const requested = normalizePeriodKey(
    (Array.isArray(oyParam) ? oyParam[0] : oyParam) || getCurrentPeriodKey(),
  );
  // `normalizePeriodKey` o'qib bo'lmagan qiymatni ASL holida qaytaradi
  // (`lib/periods.ts` izohiga q.), shuning uchun shakl shu yerda tekshiriladi:
  // aks holda `?oy=salom` sarlavhaga xom matn chiqarardi va oy oynasi
  // `Invalid Date` bo'lardi.
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : getCurrentPeriodKey();
  const [year, mon] = month.split("-").map(Number);

  /**
   * KPI, OYLIK VA DAVOMAT — faqat o'ziga yoki rahbariyatga.
   *
   * Bu shunchaki ko'rinish qoidasi emas: `staffScopeFilter` oddiy xodim uchun
   * so'rovni JIMGINA so'rovchining o'ziga buradi. Ya'ni buxgalter hamkasbining
   * kartasini ochsa, u begona sarlavha ostida O'ZINING oyligini ko'rardi.
   * Shuning uchun ruxsat bo'lmasa so'rov umuman yuborilmaydi.
   */
  const sensitive = isSeniorRole(viewerRole) || person.id === viewerId;

  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 1));

  const [clientCompanies, ownFirmCompanies, overrides, obligations, tasks, performance, adjustments, attendanceRows, attendanceSummary] =
    await Promise.all([
      getCachedCompanies(viewerId, viewerRole),
      getCachedOwnFirmCompanies(viewerId, viewerRole),
      getRoleViewOverrides().catch(() => ({})),
      getObligations({ assigneeId: person.id }).catch(() => []),
      getTasks({ assigneeId: person.id }).catch(() => []),
      sensitive ? getMonthlyPerformance(month, person.id).catch(() => []) : Promise.resolve(null),
      sensitive
        ? getPayrollAdjustments(`${month}-01`, person.id).catch(() => [])
        : Promise.resolve(null),
      sensitive
        ? getAttendance({ userId: person.id, from, to }).catch(() => [])
        : Promise.resolve(null),
      sensitive ? deriveAttendanceKpi(person.id, month).catch(() => null) : Promise.resolve(null),
    ]);

  const companies = [...clientCompanies, ...ownFirmCompanies];
  const assigned = assignedCompaniesFor(companies as never, person.id);

  // Ekranlar ro'yxati proxy darvozasi bilan BIR MANBADAN: rol default'i +
  // admin override'i + biriktiruv beradigan ekranlar (lib/permissions.ts).
  const relations = [...new Set(assigned.flatMap((c) => c.roles.map((r) => r.role)))] as CompanyRelation[];
  const views = effectiveViewsForRole(person.role as UserRole, overrides, relations).map((v) => ({
    id: v,
    label: VIEW_LABELS[v] ?? v,
  }));

  const dossier: EmployeeDossier = {
    month,
    assigned,
    kpi: performance
      ? {
          performance: (performance as any[]).map((r) => ({
            id: r.id,
            status: r.status,
            score: r.score != null ? Number(r.score) : null,
            ruleName: r.rule?.name ?? r.ruleId ?? "—",
            ruleCategory: r.rule?.category ?? null,
            recordedAt: r.recordedAt ? new Date(r.recordedAt).toISOString() : null,
          })),
        }
      : null,
    work: {
      obligations: (obligations as any[]).map((o) => ({
        id: o.id,
        title: o.template?.name ?? "Majburiyat",
        companyName: o.company?.name ?? null,
        dueAt: o.dueAt ? new Date(o.dueAt).toISOString() : null,
        status: o.status,
        isOverdue: Boolean(o.isOverdue),
      })),
      tasks: (tasks as any[]).map((t) => ({
        id: t.id,
        title: t.title,
        companyName: t.company?.name ?? null,
        dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
        status: t.status,
      })),
    },
    payroll: adjustments
      ? {
          adjustments: (adjustments as any[]).map((a) => ({
            id: a.id,
            adjustmentType: a.adjustmentType,
            amount: Number(a.amount),
            reason: a.reason,
            isApproved: Boolean(a.isApproved),
            createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
          })),
        }
      : null,
    attendance:
      attendanceRows && attendanceSummary
        ? {
            rows: (attendanceRows as any[]).map((r) => ({
              id: r.id,
              date: new Date(r.date).toISOString(),
              status: r.status,
              checkIn: r.checkIn ? new Date(r.checkIn).toISOString() : null,
              lateMinutes: r.lateMinutes ?? null,
              lateExcused: r.lateExcused ?? null,
            })),
            summary: attendanceSummary,
            workdays: countWorkdays(year, mon),
          }
        : null,
    access: { views },
  };

  const mappedPerson = {
    ...person,
    name: person.fullName,
    status: person.status || undefined,
  };

  return (
    <EmployeeDetailClient
      person={JSON.parse(JSON.stringify(mappedPerson))}
      isActive={person.isActive !== false}
      tenure={tenureLabel(person.hiredAt, new Date())}
      dossier={JSON.parse(JSON.stringify(dossier))}
      // Anketani tahrirlash `updateUser` ga `role` ni ham yuboradi — uni esa
      // faqat admin o'zgartira oladi (server/users.ts), parol tiklash ham
      // shunday. Ro'yxat ekranidagi shart bilan AYNAN bir xil.
      canManageStaff={isAdminRole(viewerRole)}
    />
  );
}
