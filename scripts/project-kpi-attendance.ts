/**
 * DAVOMAT → KPI PROYEKSIYASI (bir oy uchun)
 * =========================================
 * `Attendance` jadvalidagi bir oylik yozuvlarni KPI qoidalariga solib,
 * `MonthlyPerformance` ga TAKLIF sifatida yozadi (`status='submitted'`,
 * `source='system'`). Maoshga faqat nazoratchi TASDIQLAGANDAN keyin tushadi
 * (ADR-0001) — bu skript hech kimning oyligini o'zgartirmaydi.
 *
 * Hisoblash lib/kpiEvidence.ts#evaluateAttendanceEvidence orqali — ya'ni
 * ekrandagi "KPI proyeksiyasi" tugmasi bilan AYNAN bir xil kod. Bu yerda
 * faqat CLI qobig'i va hisobot bor.
 *
 * ISHLATISH (standart holat — QURUQ, hech narsa yozilmaydi):
 *   npx tsx scripts/project-kpi-attendance.ts 2026-08
 *   npx tsx scripts/project-kpi-attendance.ts 2026-08 --apply
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { aggregateMonthlyAttendance } from "@/lib/attendance";
import { computeRuleScore } from "@/lib/kpiScoring";
import { evaluateAttendanceEvidence } from "@/lib/kpiEvidence";
import { toPerformanceMonth } from "@/lib/periods";

const month = process.argv[2];
const APPLY = process.argv.includes("--apply");

if (!month || !/^\d{4}-\d{2}$/.test(month)) {
  console.error("Oy kerak: npx tsx scripts/project-kpi-attendance.ts 2026-08 [--apply]");
  process.exit(1);
}

/** Qaysi qoida qaysi rolga tegishli — lib/kpiEvidence.ts dagi xarita bilan bir xil. */
const ATTENDANCE_RULE: Record<string, string> = {
  accountant: "acc_attendance",
  bank_manager: "bank_attendance",
  supervisor: "sup_attendance",
};
const ABSENCE_RULE: Record<string, string> = {
  accountant: "acc_absence",
  bank_manager: "bank_absence",
  supervisor: "sup_absence",
};

function fmt(n: number): string {
  return (n > 0 ? "+" : "") + n.toFixed(2);
}

async function main() {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));

  const records = await prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    select: {
      userId: true,
      status: true,
      checkIn: true,
      lateMinutes: true,
      user: { select: { fullName: true, role: true } },
    },
  });

  if (records.length === 0) {
    console.log(`${month} uchun davomat yozuvi yo'q — proyeksiya qilinmaydi.`);
    return;
  }

  const rules = await prisma.kpiRule.findMany({
    where: { name: { in: [...Object.values(ATTENDANCE_RULE), ...Object.values(ABSENCE_RULE)] } },
  });
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  // Firma biriktirilmagan xodimga KPI yozilmaydi (proyeksiya uni o'tkazib
  // yuboradi) — hisobotda buni ko'rsatish kerak, aks holda "KPI nega yo'q?"
  // degan savol javobsiz qoladi.
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, accountantId: true, bankClientId: true, supervisorId: true },
  });

  const byUser = new Map<string, { name: string; role: string; rows: typeof records }>();
  for (const rec of records) {
    const e = byUser.get(rec.userId) ?? {
      name: rec.user.fullName,
      role: rec.user.role as string,
      rows: [],
    };
    e.rows.push(rec);
    byUser.set(rec.userId, e);
  }

  const report: {
    name: string;
    role: string;
    firms: number;
    early: number;
    lateMin: number;
    absent: number;
    attendancePct: number;
    absencePct: number;
  }[] = [];

  for (const [userId, e] of byUser) {
    const s = aggregateMonthlyAttendance(e.rows);
    const firms = companies.filter(
      (c) => c.accountantId === userId || c.bankClientId === userId || c.supervisorId === userId,
    ).length;

    const attRule = ruleByName.get(ATTENDANCE_RULE[e.role] ?? "");
    const absRule = ruleByName.get(ABSENCE_RULE[e.role] ?? "");

    report.push({
      name: e.name,
      role: e.role,
      firms,
      early: s.earlyDays,
      lateMin: s.lateMinutes,
      absent: s.absentDays,
      attendancePct: attRule
        ? computeRuleScore(attRule as never, {
            counters: { early_days: s.earlyDays, late_5min: Math.floor(s.lateMinutes / 5) },
          }).percent
        : 0,
      absencePct: absRule
        ? computeRuleScore(absRule as never, { counters: { absent_days: s.absentDays } }).percent
        : 0,
    });
  }

  report.sort((a, b) => a.attendancePct + a.absencePct - (b.attendancePct + b.absencePct));

  const head = ["XODIM", "ROL", "FIRMA", "ERTA", "KECH(daq)", "YO'Q", "KELISH%", "YO'QLIK%", "JAMI%"];
  const rows = report.map((r) => [
    r.name,
    r.role,
    String(r.firms),
    String(r.early),
    String(r.lateMin),
    String(r.absent),
    fmt(r.attendancePct),
    fmt(r.absencePct),
    fmt(r.attendancePct + r.absencePct),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 || i === 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");

  console.log(`\nDAVOMAT KPI — ${month}\n`);
  console.log(line(head));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));

  const noFirm = report.filter((r) => r.firms === 0);
  if (noFirm.length) {
    console.log(
      `\n  DIQQAT — firma biriktirilmagan, KPI YOZILMAYDI (${noFirm.length}): ` +
        noFirm.map((r) => r.name).join(", "),
    );
  }

  if (!APPLY) {
    console.log("\nQURUQ ISHLASH — MonthlyPerformance ga hech narsa yozilmadi (--apply bering).");
    return;
  }

  const res = await evaluateAttendanceEvidence(month);
  const perfMonth = toPerformanceMonth(month);
  const written = await prisma.monthlyPerformance.count({
    where: { month: perfMonth!, source: "system", rule: { category: "attendance" } },
  });
  console.log(
    `\nYOZILDI — ${res.processed} xodim ko'rildi, ${res.updated} qator yangilandi, ` +
      `${res.skippedApproved} tasdiqlangani tegilmadi, ${res.skippedNeutral} firmasiz o'tkazildi.`,
  );
  console.log(`  ${perfMonth} davomat kategoriyasidagi jami system qatorlar: ${written}`);
  console.log("  Holati: 'submitted' — maoshga tushishi uchun nazoratchi tasdig'i kerak.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
