/**
 * PHASE 5 — Realistic validation seed (idempotent, cleanable).
 *
 * XAVFSIZLIK:
 *  - Faqat TEST yozuvlar qo'shadi: emaillar "@mehnat.local", firma INN "TEST-VAL-*",
 *    department/kpi-rule/inventory nomlari "TEST" bilan boshlanadi.
 *  - Mavjud (real) 687 firma / userlarga TEGINMAYDI.
 *  - IDEMPOTENT: qayta ishga tushirsa dublikat yaratmaydi.
 *
 * ISHLATISH:  npx tsx scripts/seed-phase5-validation.ts
 * TOZALASH:   npx tsx scripts/seed-phase5-validation.ts --cleanup
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

const PASS = "Test1234!";
const MONTH = "2026-07";        // joriy oy
const PREV_MONTH = "2026-06";
const PERF_MONTH = "2026-07-01";
const DEPT_NAME = "TEST Yorqinoy bo'limi";
const RULE_NAME = "TEST_telegram_response";
const INV_SERIAL = "TEST-INV-001";

const USERS = [
  { email: "test.superadmin@mehnat.local", fullName: "TEST Super Admin", role: "super_admin" },
  { email: "test.admin@mehnat.local", fullName: "TEST Admin", role: "admin" },
  { email: "test.chief@mehnat.local", fullName: "TEST Yorqinoy (Bosh Buxgalter)", role: "chief_accountant" },
  { email: "test.supervisor@mehnat.local", fullName: "TEST Nazoratchi", role: "supervisor" },
  { email: "test.accountant@mehnat.local", fullName: "TEST Buxgalter", role: "accountant" },
  { email: "test.bank@mehnat.local", fullName: "TEST Bank Klient", role: "bank_manager" },
] as const;

const COMPANIES = [
  { inn: "TEST-VAL-001", name: "TEST FINANCE COUNCIL MCHJ", contract: 1_000_000, accPerc: 20, accSum: 200_000, bankPerc: 5, supPerc: 5, chiefPerc: 7 },
  { inn: "TEST-VAL-002", name: "TEST ROAD RIDERS", contract: 700_000, accPerc: 20, accSum: 140_000, bankPerc: 5, supPerc: 5, chiefPerc: 7 },
];

async function cleanup() {
  console.log("🧹 TEST yozuvlar tozalanmoqda...");
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@mehnat.local" } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  const comps = await prisma.company.findMany({ where: { inn: { startsWith: "TEST-VAL-" } }, select: { id: true } });
  const cids = comps.map((c) => c.id);

  await prisma.monthlyPerformance.deleteMany({ where: { OR: [{ companyId: { in: cids } }, { employeeId: { in: uids } }] } });
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: { in: uids } } });
  await prisma.contractAssignment.deleteMany({ where: { OR: [{ companyId: { in: cids } }, { userId: { in: uids } }] } });
  await prisma.attendance.deleteMany({ where: { userId: { in: uids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: uids } } });
  await prisma.inventoryItem.deleteMany({ where: { serialNumber: { startsWith: "TEST-INV-" } } });
  await prisma.company.deleteMany({ where: { inn: { startsWith: "TEST-VAL-" } } }); // cascade: payment/report/document
  await prisma.department.deleteMany({ where: { name: { startsWith: "TEST" } } });
  await prisma.kpiRule.deleteMany({ where: { name: { startsWith: "TEST_" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@mehnat.local" } } });
  console.log("✅ Tozalash yakunlandi.");
}

async function seed() {
  const passwordHash = await bcrypt.hash(PASS, 12);
  const idByRole: Record<string, string> = {};

  // 1) USERS
  for (const u of USERS) {
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, role: u.role as never, isActive: true, fullName: u.fullName },
      create: { email: u.email, fullName: u.fullName, passwordHash, role: u.role as never, isActive: true, phone: "+998900000000", department: DEPT_NAME },
    });
    idByRole[u.role] = rec.id;
  }
  console.log(`  ✓ ${USERS.length} test user tayyor (parol: ${PASS})`);

  // 2) DEPARTMENT (yangi model — Phase 1)
  let dept = await prisma.department.findFirst({ where: { name: DEPT_NAME } });
  if (!dept) dept = await prisma.department.create({ data: { name: DEPT_NAME, chiefAccountantId: idByRole["chief_accountant"], isActive: true } });
  console.log(`  ✓ Department: ${dept.name}`);

  // 3) KPI RULE (manual)
  const rule = await prisma.kpiRule.upsert({
    where: { name: RULE_NAME },
    update: {},
    create: { name: RULE_NAME, nameUz: "TEST Telegramda o'z vaqtida javob", role: "accountant", rewardPercent: 1, penaltyPercent: 0.5, inputType: "checkbox", category: "telegram", isActive: true, sortOrder: 1 },
  });

  const compIds: string[] = [];
  for (const c of COMPANIES) {
    // 4) COMPANY (yangi sxema: sum + departmentId + bankClient FK)
    let company = await prisma.company.findFirst({ where: { inn: c.inn } });
    const data = {
      name: c.name, inn: c.inn, taxRegime: "turnover" as never, contractAmount: c.contract,
      accountantId: idByRole["accountant"], bankClientId: idByRole["bank_manager"], bankClientName: "TEST Bank Klient",
      supervisorId: idByRole["supervisor"], chiefAccountantId: idByRole["chief_accountant"],
      accountantPerc: c.accPerc, accountantSum: c.accSum, bankClientPerc: c.bankPerc, chiefAccountantPerc: c.chiefPerc, supervisorPerc: c.supPerc,
      departmentId: dept.id, kpiEnabled: true, isActive: true,
    };
    if (company) company = await prisma.company.update({ where: { id: company.id }, data });
    else company = await prisma.company.create({ data });
    compIds.push(company.id);

    // 5) CONTRACT ASSIGNMENTS (har rol — payroll summary + bank cabinet uchun)
    const assigns = [
      { userId: idByRole["accountant"], role: "accountant", value: c.accPerc },
      { userId: idByRole["bank_manager"], role: "bank_manager", value: c.bankPerc },
      { userId: idByRole["supervisor"], role: "supervisor", value: c.supPerc },
      { userId: idByRole["chief_accountant"], role: "chief_accountant", value: c.chiefPerc },
    ];
    for (const a of assigns) {
      const ex = await prisma.contractAssignment.findFirst({ where: { companyId: company.id, userId: a.userId, role: a.role, isActive: true } });
      if (!ex) await prisma.contractAssignment.create({ data: { companyId: company.id, userId: a.userId, role: a.role, salaryType: "percent", salaryValue: a.value, startDate: new Date(), isActive: true } });
    }

    // 6) MONTHLY REPORTS (Reports + KPI automation)
    for (const [period, vals] of [
      [MONTH, { didox: "+", oneC: "+", chiqadiganSoliqlar: "+", inps: "+", aylanmaQqs: "+", myMehnat: "-", bankKlient: "+" }],
      [PREV_MONTH, { didox: "+", oneC: "kartoteka", chiqadiganSoliqlar: "+", inps: "+", aylanmaQqs: "-", myMehnat: "+", bankKlient: "+" }],
    ] as const) {
      await prisma.monthlyReport.upsert({
        where: { companyId_period: { companyId: company.id, period } },
        update: {}, create: { companyId: company.id, period, ...vals },
      });
    }

    // 7) PAYMENT (Kassa)
    await prisma.payment.upsert({
      where: { companyId_period: { companyId: company.id, period: MONTH } },
      update: {}, create: { companyId: company.id, period: MONTH, amount: c.contract, status: "paid", paymentDate: new Date(), createdBy: idByRole["bank_manager"] },
    });

    // 10) DOCUMENT
    const docName = "TEST Ustav.pdf";
    const doc = await prisma.document.findFirst({ where: { companyId: company.id, name: docName } });
    if (!doc) await prisma.document.create({ data: { companyId: company.id, name: docName, filePath: "https://example.com/test-ustav.pdf", uploadedBy: idByRole["accountant"] } });
  }
  console.log(`  ✓ ${COMPANIES.length} firma + ContractAssignment + MonthlyReport + Payment + Document`);

  // 8) MONTHLY PERFORMANCE (KPI — approved → payrollga +1%)
  const perfEx = await prisma.monthlyPerformance.findFirst({ where: { month: PERF_MONTH, companyId: compIds[0], employeeId: idByRole["accountant"], ruleId: rule.id } });
  if (!perfEx) await prisma.monthlyPerformance.create({ data: { month: PERF_MONTH, companyId: compIds[0], employeeId: idByRole["accountant"], ruleId: rule.id, value: 1, calculatedScore: 1, rewardPercentOverride: 1, penaltyPercentOverride: 0.5, source: "supervisor", status: "approved", approvedBy: idByRole["supervisor"], approvedAt: new Date() } });
  // submitted KPI — supervisor cabinet "tasdiqlash kutayotgan" uchun
  const perfSub = await prisma.monthlyPerformance.findFirst({ where: { month: PERF_MONTH, companyId: compIds[1], employeeId: idByRole["accountant"], ruleId: rule.id } });
  if (!perfSub) await prisma.monthlyPerformance.create({ data: { month: PERF_MONTH, companyId: compIds[1], employeeId: idByRole["accountant"], ruleId: rule.id, value: 1, calculatedScore: 1, rewardPercentOverride: 1, penaltyPercentOverride: 0.5, source: "employee", status: "submitted", submittedBy: idByRole["accountant"], submittedAt: new Date() } });
  console.log("  ✓ KPI rule + 2 MonthlyPerformance (approved + submitted)");

  // 9) NOTIFICATIONS
  for (const [role, title] of [["accountant", "TEST: Hisobot muddati yaqin"], ["super_admin", "TEST: Yangi tasdiq so'rovi"]] as const) {
    const ex = await prisma.notification.findFirst({ where: { userId: idByRole[role], title } });
    if (!ex) await prisma.notification.create({ data: { userId: idByRole[role], title, message: "TEST xabar matni.", type: "deadline", link: "/reports", isRead: false } });
  }
  console.log("  ✓ Notifications");

  // 11) ATTENDANCE
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const att = await prisma.attendance.findFirst({ where: { userId: idByRole["accountant"], date: today } });
  if (!att) await prisma.attendance.create({ data: { userId: idByRole["accountant"], date: today, checkIn: new Date(), status: "present" } });
  console.log("  ✓ Attendance");

  // 12) INVENTORY
  await prisma.inventoryItem.upsert({ where: { serialNumber: INV_SERIAL }, update: { assignedToId: idByRole["accountant"], status: "assigned" }, create: { name: "TEST Laptop", serialNumber: INV_SERIAL, status: "assigned", condition: "good", assignedToId: idByRole["accountant"] } });
  console.log("  ✓ Inventory");

  console.log(`\n✅ Seed yakunlandi. Barcha test userlar paroli: ${PASS}`);
}

async function main() {
  if (process.argv.includes("--cleanup")) await cleanup();
  else await seed();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
