/**
 * Seed demo financial reports for the ASRO Hisobotlar module.
 * Idempotent: clears all FinancialReport rows first (feature is new).
 * Run: npx tsx scripts/seed-financial-reports.ts
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const y = 2026, m = new Date().getMonth(); // current month
const dl = (day: number) => new Date(y, m, day);

const DATA: Record<string, unknown> = {
  profit_loss: { title: "Foyda va zarar hisoboti", lines: [
    { label: "Sof tushum", cur: 486_200_000, prev: 412_800_000 },
    { label: "Sotilgan mahsulot tannarxi", cur: -298_400_000, prev: -260_100_000 },
    { label: "Yalpi foyda", cur: 187_800_000, prev: 152_700_000, bold: true },
    { label: "Operatsion xarajatlar", cur: -96_300_000, prev: -88_900_000 },
    { label: "Soliqlar", cur: -21_400_000, prev: -17_200_000 },
    { label: "Sof foyda", cur: 70_100_000, prev: 46_600_000, bold: true, positive: true },
  ]},
  balance: { title: "Balans hisoboti (F-1)", lines: [
    { label: "Aylanma aktivlar", cur: 320_000_000, prev: 280_000_000 },
    { label: "Uzoq muddatli aktivlar", cur: 180_000_000, prev: 175_000_000 },
    { label: "Jami aktivlar", cur: 500_000_000, prev: 455_000_000, bold: true },
    { label: "Majburiyatlar", cur: 210_000_000, prev: 205_000_000 },
    { label: "Kapital", cur: 290_000_000, prev: 250_000_000, bold: true, positive: true },
  ]},
  qqs: { title: "QQS deklaratsiyasi", lines: [
    { label: "Soliqqa tortiladigan aylanma", cur: 486_200_000, prev: 0 },
    { label: "Hisoblangan QQS (12%)", cur: 58_344_000, prev: 0 },
    { label: "Hisobga olinadigan QQS", cur: -41_200_000, prev: 0 },
    { label: "To'lanadigan QQS", cur: 17_144_000, prev: 0, bold: true, positive: true },
  ]},
  cashflow: { title: "Pul oqimi hisoboti", lines: [
    { label: "Operatsion faoliyatdan", cur: 88_400_000, prev: 71_200_000 },
    { label: "Investitsion faoliyatdan", cur: -24_000_000, prev: -12_000_000 },
    { label: "Sof pul oqimi", cur: 64_400_000, prev: 59_200_000, bold: true, positive: true },
  ]},
};
const FMT: Record<string, string> = { profit_loss: "PDF", balance: "XLS", qqs: "PDF", cashflow: "PDF" };

async function main() {
  const del = await prisma.financialReport.deleteMany({});
  const companies = await prisma.company.findMany({ where: { accountantId: { not: null } }, take: 8, select: { id: true, accountantId: true } });
  if (companies.length === 0) throw new Error("No companies");

  const plan: { type: string; status: string; period: string; deadline: Date | null }[] = [
    { type: "profit_loss", status: "ready", period: "2026-H1", deadline: null },
    { type: "qqs", status: "signing", period: "2026-06", deadline: dl(15) },
    { type: "profit_loss", status: "preparing", period: "2026-06", deadline: dl(20) },
    { type: "balance", status: "submitted", period: "2026-Q2", deadline: dl(4) },
    { type: "cashflow", status: "rejected", period: "2026-Q2", deadline: dl(12) },
    { type: "qqs", status: "preparing", period: "2026-06", deadline: dl(25) },
    { type: "profit_loss", status: "ready", period: "2026-H1", deadline: dl(18) },
    { type: "balance", status: "signing", period: "2026-Q2", deadline: dl(28) },
  ];

  const rows: Prisma.FinancialReportCreateManyInput[] = plan.map((p, i) => {
    const c = companies[i % companies.length];
    return {
      companyId: c.id, type: p.type, period: p.period, status: p.status,
      deadline: p.deadline, assignedTo: c.accountantId, fileFormat: FMT[p.type],
      data: DATA[p.type] as Prisma.InputJsonValue,
      rejectedReason: p.status === "rejected" ? "Kontrol nisbat mos kelmadi — qayta tekshirish kerak" : null,
      submittedAt: p.status === "submitted" ? new Date() : null,
    };
  });

  const res = await prisma.financialReport.createMany({ data: rows });
  console.log(`Cleared ${del.count}, inserted ${res.count} financial reports.`);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
