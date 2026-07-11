/**
 * One-time cleanup: remove import-artifact user rows and fix mis-assigned roles.
 *
 * Import created fake "people" from spreadsheet cells that were not people:
 *   - 26 bank_manager rows whose fullName is a numeric salary amount or "Jami oylik"
 *   - 1 accountant row named "KPI" (a column header)
 * All are inactive and have zero references anywhere — safe to delete.
 *
 * It also corrects 3 real staff wrongly elevated to super_admin:
 *   - Muslimbek, Go'zaloy  -> supervisor (they supervise 57 / 134 companies)
 *   - Musobek              -> accountant (12 companies)
 *
 * Idempotent: re-running finds nothing left to do.
 *
 * Run:  npx tsx scripts/cleanup-user-import-junk.ts
 */
import { prisma } from "@/lib/prisma";

async function countRefs(ids: string[]) {
  const [perf, payadj, kassa, exp, pay, audit, notif, att, inv, contracts] =
    await Promise.all([
      prisma.monthlyPerformance.count({ where: { employeeId: { in: ids } } }),
      prisma.payrollAdjustment.count({ where: { employeeId: { in: ids } } }),
      prisma.kassaEntry.count({ where: { createdBy: { in: ids } } }),
      prisma.expense.count({ where: { createdBy: { in: ids } } }),
      prisma.payment.count({ where: { createdBy: { in: ids } } }),
      prisma.auditLog.count({ where: { userId: { in: ids } } }),
      prisma.notification.count({ where: { userId: { in: ids } } }),
      prisma.attendance.count({ where: { userId: { in: ids } } }),
      prisma.inventoryItem.count({ where: { assignedToId: { in: ids } } }),
      prisma.contractAssignment.count({ where: { userId: { in: ids } } }),
    ]);
  return perf + payadj + kassa + exp + pay + audit + notif + att + inv + contracts;
}

async function main() {
  // 1) Identify junk rows -------------------------------------------------
  const bankManagers = await prisma.user.findMany({
    where: { role: "bank_manager", isActive: false },
    select: { id: true, fullName: true, email: true },
  });
  const junkBank = bankManagers.filter(
    (u) => /^[0-9]+$/.test((u.fullName || "").trim()) || /jami/i.test(u.fullName || "")
  );
  const kpiRows = await prisma.user.findMany({
    where: { fullName: "KPI" },
    select: { id: true, fullName: true, email: true },
  });
  const junk = [...junkBank, ...kpiRows];
  const junkIds = junk.map((j) => j.id);

  console.log(`Junk candidates: ${junk.length} (${junkBank.length} numeric/jami bank_managers + ${kpiRows.length} "KPI")`);

  if (junkIds.length > 0) {
    const refs = await countRefs(junkIds);
    if (refs !== 0) {
      throw new Error(`Aborting: ${refs} references found on junk rows — not safe to delete.`);
    }
    const del = await prisma.user.deleteMany({ where: { id: { in: junkIds } } });
    console.log(`✅ Deleted ${del.count} junk user rows.`);
  } else {
    console.log("No junk rows left (already clean).");
  }

  // 2) Fix mis-assigned roles (target by email, only if still super_admin)
  const roleFixes: { email: string; role: string; label: string }[] = [
    { email: "muslimbek_99f7@mehnat.uz", role: "supervisor", label: "Muslimbek → nazoratchi" },
    { email: "gozaloy_afb1@mehnat.uz", role: "supervisor", label: "Go'zaloy → nazoratchi" },
    { email: "musobek_8313@mehnat.uz", role: "accountant", label: "Musobek → buxgalter" },
  ];

  for (const fix of roleFixes) {
    const res = await prisma.user.updateMany({
      where: { email: fix.email, role: "super_admin" },
      data: { role: fix.role as never },
    });
    console.log(res.count > 0 ? `✅ ${fix.label}` : `– skipped (${fix.email} not super_admin / not found)`);
  }

  // 3) Report resulting role distribution ---------------------------------
  const byRole = await prisma.user.groupBy({ by: ["role"], _count: true, orderBy: { role: "asc" } });
  const total = await prisma.user.count();
  console.log(`\nResulting users: ${total}`);
  console.log(byRole.map((r) => `  ${r.role}: ${r._count}`).join("\n"));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
