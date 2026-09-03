/**
 * KPI ROL FILTRI TUZATILISHINING TA'SIRI — FAQAT O'QIYDI.
 *
 * Nima uchun: `MonthlyPerformance.ruleRole` hech qayerda to'ldirilmagani uchun
 * `lib/kpiLogic.ts` dagi rol filtri doim ochiq turardi va ikki xato berardi:
 *   1) bitta firmada ikki o'rinda turgan odamga KPI foizi IKKI MARTA to'langan;
 *   2) qoida begona rolga qo'llangan (masalan `acc_absence` −1%/kun nazoratchiga).
 * Filtr tuzatildi. TARIXGA TEGILMAYDI — bu skript faqat farqni O'LCHAYDI.
 *
 * Hech qanday INSERT/UPDATE/DELETE yo'q. Prodda ham xavfsiz.
 *
 * Ishlatish:
 *   npx tsx scripts/kpi-impact-report.ts               # barcha oylar
 *   npx tsx scripts/kpi-impact-report.ts --month 2026-07-01
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import { capKpiPercent, type KpiSalaryRole } from "@/lib/kpiScoring";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Biriktiruv roli → oylik roli (lib/kpiLogic.ts bilan bir xil xarita). */
const salaryRoleOf = (role: string): KpiSalaryRole | null => {
  switch (role) {
    case "accountant": return "accountant";
    case "bank_manager":
    case "bank_client": return "bank_client";
    case "chief":
    case "chief_accountant": return "chief_accountant";
    case "controller":
    case "supervisor": return "supervisor";
    default: return null;
  }
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

async function main() {
  const monthFilter = arg("--month");
  console.log(`Baza xosti: ${(process.env.DATABASE_URL ?? "").match(/@([^:/?]+)/)?.[1] ?? "(noma'lum)"}`);
  console.log("Bu skript HECH NARSA YOZMAYDI.\n");

  const perfs = await prisma.monthlyPerformance.findMany({
    where: { status: "approved", ...(monthFilter ? { month: monthFilter } : {}) },
    select: {
      month: true,
      companyId: true,
      employeeId: true,
      calculatedScore: true,
      penaltyAmount: true,
      employee: { select: { fullName: true, role: true } },
      rule: { select: { name: true, role: true } },
    },
  });
  if (perfs.length === 0) {
    console.log("Tasdiqlangan KPI qatori topilmadi.");
    return;
  }

  const companyIds = [...new Set(perfs.map((p) => p.companyId))];
  const [companies, assignments] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, contractAmount: true, accountantId: true, bankClientId: true, supervisorId: true, chiefAccountantId: true },
    }),
    prisma.contractAssignment.findMany({
      where: { isActive: true, companyId: { in: companyIds } },
      select: { companyId: true, userId: true, role: true },
    }),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));

  // (firma, xodim) → o'sha firmadagi oylik ROLLARI.
  const rolesOf = new Map<string, Set<KpiSalaryRole>>();
  const add = (companyId: string, userId: string | null, role: KpiSalaryRole | null) => {
    if (!userId || !role) return;
    const k = `${companyId}|${userId}`;
    (rolesOf.get(k) ?? rolesOf.set(k, new Set()).get(k)!).add(role);
  };
  for (const c of companies) {
    add(c.id, c.accountantId, "accountant");
    add(c.id, c.bankClientId, "bank_client");
    add(c.id, c.supervisorId, "supervisor");
    add(c.id, c.chiefAccountantId, "chief_accountant");
  }
  for (const a of assignments) add(a.companyId, a.userId, salaryRoleOf(a.role));

  // 1) IKKI O'RINLI (firma, xodim) juftliklari
  const multi = [...rolesOf.entries()].filter(([, roles]) => roles.size > 1);

  // 2) Begona rol qoidasi — qoida roli xodimning o'sha firmadagi rollari ichida yo'q
  interface Row {
    month: string;
    employee: string;
    company: string;
    rule: string;
    ruleRole: string;
    percent: number;
  }
  const orphanRows: Row[] = [];
  const doubledKeys = new Set<string>();

  for (const p of perfs) {
    const roles = rolesOf.get(`${p.companyId}|${p.employeeId}`);
    const c = companyById.get(p.companyId);
    if (!roles || roles.size === 0) continue;
    if (roles.size > 1) doubledKeys.add(`${p.month}|${p.companyId}|${p.employeeId}`);
    if (!roles.has(p.rule.role as KpiSalaryRole)) {
      orphanRows.push({
        month: p.month,
        employee: p.employee.fullName,
        company: c?.name ?? p.companyId,
        rule: p.rule.name,
        ruleRole: p.rule.role,
        percent: Number(p.calculatedScore),
      });
    }
  }

  // 3) Oylik FARQI: eski (filtrsiz, har o'rin hammasini oladi) vs yangi (rol bo'yicha).
  //    Faqat KPI qismi hisoblanadi — baza ulushi ikkalasida ham bir xil.
  interface Agg { old: number; neu: number; name: string }
  const byMonthEmp = new Map<string, Agg>();

  const percentsByKey = new Map<string, { role: string; percent: number }[]>();
  for (const p of perfs) {
    const k = `${p.month}|${p.companyId}|${p.employeeId}`;
    (percentsByKey.get(k) ?? percentsByKey.set(k, []).get(k)!).push({
      role: p.rule.role,
      percent: Number(p.calculatedScore),
    });
  }

  for (const [k, rows] of percentsByKey) {
    const [month, companyId, employeeId] = k.split("|");
    const roles = rolesOf.get(`${companyId}|${employeeId}`);
    if (!roles || roles.size === 0) continue;
    const contract = Number(companyById.get(companyId)?.contractAmount ?? 0);
    const emp = perfs.find((p) => p.employeeId === employeeId)?.employee.fullName ?? employeeId;

    // ESKI: har o'rin BARCHA qatorlarni oladi (rol filtri o'lik edi).
    let oldPercent = 0;
    for (const role of roles) oldPercent += capKpiPercent(rows.map((r) => r.percent), role);

    // YANGI: har o'rin faqat o'z rolining qatorlarini oladi.
    let newPercent = 0;
    for (const role of roles) {
      const mine = rows.filter((r) => r.role === role).map((r) => r.percent);
      newPercent += capKpiPercent(mine, role);
    }

    const key = `${month}|${employeeId}`;
    const a = byMonthEmp.get(key) ?? byMonthEmp.set(key, { old: 0, neu: 0, name: emp }).get(key)!;
    a.old += (contract * oldPercent) / 100;
    a.neu += (contract * newPercent) / 100;
  }

  // ── Hisobot ────────────────────────────────────────────────────────────
  console.log(`Tasdiqlangan KPI qatorlari: ${perfs.length}`);
  console.log(`Ikki o'rinli (firma, xodim) juftliklari: ${multi.length}`);
  console.log(`Ta'sirlangan (oy, firma, xodim) uchliklari: ${doubledKeys.size}`);
  console.log(`Begona rol qoidasi yozilgan qatorlar: ${orphanRows.length}`);

  const orphanByRule = new Map<string, number>();
  for (const o of orphanRows) orphanByRule.set(o.rule, (orphanByRule.get(o.rule) ?? 0) + 1);
  if (orphanByRule.size > 0) {
    console.log("\nBegona rol qoidalari (eng ko'pi):");
    [...orphanByRule.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([rule, n]) => console.log(`  ${rule} — ${n} qator`));
  }

  console.log("\nKPI PULINING FARQI (oy × xodim; manfiy = yangi hisobda kamroq):");
  const diffs = [...byMonthEmp.entries()]
    .map(([k, a]) => ({ month: k.split("|")[0], name: a.name, diff: a.neu - a.old }))
    .filter((d) => Math.abs(d.diff) >= 1)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  if (diffs.length === 0) {
    console.log("  Farq yo'q.");
  } else {
    diffs.slice(0, 25).forEach((d) => console.log(`  ${d.month} · ${d.name}: ${fmt(Math.round(d.diff))} so'm`));
    const total = diffs.reduce((s, d) => s + d.diff, 0);
    console.log(`  ...\n  JAMI farq: ${fmt(Math.round(total))} so'm (${diffs.length} ta oy×xodim)`);
  }

  // 4) So'mli jarima — endi oylikdan ayiriladi, ilgari e'tiborsiz qolardi.
  const fixed = perfs.filter((p) => Number(p.penaltyAmount) > 0);
  const fixedTotal = fixed.reduce((s, p) => s + Number(p.penaltyAmount), 0);
  console.log(
    `\nSo'mli jarima (amount_penalty) qatorlari: ${fixed.length}, jami ${fmt(fixedTotal)} so'm` +
      " — ilgari oylikka UMUMAN ta'sir qilmasdi."
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
