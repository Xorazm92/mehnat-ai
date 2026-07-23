"use server";

// =====================================================
// FAIR KPI v2 server actions (Faza E / shadow mode)
// =====================================================
// Signallarni yig'adi (Obligation/Task/Attendance) → komponentlar → composite →
// FairKpiScore (shadowMode). Mavjud KPI/oylikka TEGMAYDI. Senior-gated.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import {
  complexityWeight,
  slaScore,
  qualityScore,
  volumeScore,
  disciplineScore,
  computeComposite,
} from "@/lib/fairKpi";
import { revalidateTag } from "next/cache";

async function requireSenior(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}

function monthRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) throw new Error("Davr formati noto'g'ri (YYYY-MM)");
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

// Manager tasdiqlagan, buxgalter aybi BO'LMAGAN kechikish → SLA'dan chiqariladi.
const EXCUSED_REASONS = new Set(["client_delay", "system_failure", "external_authority", "management_decision"]);

interface Agg {
  slaEligible: number;
  slaOnTime: number;
  defects: number;
  qualityTotal: number;
  volumePoints: number;
  present: number;
  late: number;
  absent: number;
}
const emptyAgg = (): Agg => ({ slaEligible: 0, slaOnTime: 0, defects: 0, qualityTotal: 0, volumePoints: 0, present: 0, late: 0, absent: 0 });

export async function computeFairKpiForPeriod(period: string) {
  const uid = await requireSenior();
  const { start, end } = monthRange(period);
  const agg = new Map<string, Agg>();
  const touch = (id: string) => {
    let a = agg.get(id);
    if (!a) { a = emptyAgg(); agg.set(id, a); }
    return a;
  };

  // 1) Obligations (SLA + quality + volume) — davrda muddati kelganlar.
  const obligations = await prisma.obligation.findMany({
    where: { dueAt: { gte: start, lt: end }, responsibleUserId: { not: null } },
    select: { responsibleUserId: true, status: true, acceptedAt: true, dueAt: true, delayApprovedById: true, delayReason: true, company: { select: { complexity: true } } },
  });
  for (const o of obligations) {
    const a = touch(o.responsibleUserId!);
    a.volumePoints += complexityWeight(o.company?.complexity);
    const resolved = o.status === "accepted" || o.status === "rejected";
    const excused = !!o.delayApprovedById && o.delayReason != null && EXCUSED_REASONS.has(o.delayReason);
    if (resolved && !excused) {
      a.slaEligible++;
      a.qualityTotal++;
      if (o.status === "accepted" && o.acceptedAt && o.acceptedAt <= o.dueAt) a.slaOnTime++;
      if (o.status === "rejected") a.defects++;
    }
  }

  // 2) Tasks (quality + volume) — davrda yaratilganlar.
  const tasks = await prisma.task.findMany({
    where: { createdAt: { gte: start, lt: end }, assigneeUserId: { not: null } },
    select: { assigneeUserId: true, status: true, company: { select: { complexity: true } }, breaches: { where: { breachType: "resolution" }, select: { id: true } } },
  });
  for (const t of tasks) {
    const a = touch(t.assigneeUserId!);
    a.volumePoints += complexityWeight(t.company?.complexity);
    if (t.status === "done" || t.status === "cancelled") {
      a.qualityTotal++;
      if (t.breaches.length > 0) a.defects++;
    }
  }

  // 3) Attendance (discipline).
  const attendance = await prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    select: { userId: true, status: true },
  });
  for (const at of attendance) {
    const a = touch(at.userId);
    if (at.status === "present") a.present++;
    else if (at.status === "late") a.late++;
    else if (at.status === "absent") a.absent++;
    // excused — hisobga kirmaydi
  }

  // 4) Hisoblash + upsert.
  let count = 0;
  for (const [employeeId, a] of agg) {
    const sla = slaScore(a.slaOnTime, a.slaEligible);
    const quality = qualityScore(a.defects, a.qualityTotal);
    const client = 100; // manba yo'q (client portal kelgach) — neytral
    const volume = volumeScore(a.volumePoints);
    const discipline = disciplineScore({ present: a.present, late: a.late, absent: a.absent });
    const composite = computeComposite({ sla, quality, client, volume, discipline });
    await prisma.fairKpiScore.upsert({
      where: { period_employeeId: { period, employeeId } },
      create: { period, employeeId, sla, quality, client, volume, discipline, composite, volumePoints: a.volumePoints, shadowMode: true },
      update: { sla, quality, client, volume, discipline, composite, volumePoints: a.volumePoints, computedAt: new Date() },
    });
    count++;
  }

  await recordAuditLog({ userId: uid, action: "create", tableName: "FairKpiScore", recordId: period, newData: { computed: count } });
  revalidateTag("fair-kpi", "max");
  return { period, employees: count };
}

export async function getFairKpiScores(period: string) {
  await requireSenior();
  const scores = await prisma.fairKpiScore.findMany({ where: { period }, orderBy: { composite: "asc" } });
  const ids = scores.map((s) => s.employeeId);
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  return scores.map((s) => ({ ...s, employeeName: nameOf.get(s.employeeId) ?? "?" }));
}
