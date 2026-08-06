"use server";

// =====================================================
// OPERATIONS TIMELINE — Kechikkan → Bugun → … → Yil (C1)
// =====================================================
// Yangi model YO'Q. Bu `Obligation.dueAt` ustidan oyna, chunki majburiyat
// allaqachon yagona ish birligi (ADR-0009) va unda muddat bor. Ikkinchi
// "kalendar" jadvali qurilsa, u birinchi kundanoq majburiyatdan ajrab
// ketardi.
//
// SANOQ VA RO'YXAT ALOHIDA SO'RALADI. Direktorga yil oxirigacha nechta ish
// borligi kerak, lekin dekabrdagi ishlarning ro'yxati kerak emas — u hech
// qachon ochilmaydi. Shuning uchun sanoq — `count`, ro'yxat esa faqat yaqin
// oynalar uchun va cheklangan. Aks holda admin uchun bu so'rov minglab qator
// qaytarardi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyScopeWhere, type Actor } from "@/lib/platform/access";
import { serialize } from "@/lib/serialize";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { horizonWindows, type HorizonKey } from "@/lib/engines/obligation/horizon";
import type { ObligationStatus } from "@prisma/client";

/** Ro'yxat ko'rsatiladigan eng uzoq oyna — undan naridagisi faqat sanoq. */
const LIST_LIMIT = 60;

export interface TimelineItem {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  dueAt: string;
  status: ObligationStatus;
  responsibleName: string | null;
}

export interface TimelineBucket {
  key: HorizonKey;
  label: string;
  count: number;
  /** Faqat yaqin oynalarda to'ldiriladi. */
  items: TimelineItem[];
}

const LABELS: Record<HorizonKey, string> = {
  overdue: "Kechikkan",
  today: "Bugun",
  tomorrow: "Ertaga",
  week: "Shu hafta",
  month: "Shu oy",
  quarter: "Chorak",
  year: "Yil oxirigacha",
};

/** Ro'yxat ham to'ldiriladigan oynalar — qolganlari faqat sanoq. */
const LISTED: HorizonKey[] = ["overdue", "today", "tomorrow", "week"];

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id as string, role: session.user.role as string };
}

export interface TimelineOptions {
  /** Faqat aktyorning o'z ishlari. */
  mineOnly?: boolean;
}

export async function getOperationsTimeline(opts: TimelineOptions = {}): Promise<TimelineBucket[]> {
  const actor = await requireActor();
  const now = new Date();
  const windows = horizonWindows(now).map((w) => ({ ...w, label: LABELS[w.key] }));

  const base = {
    company: companyScopeWhere(actor),
    status: { in: OPEN_OBLIGATION_STATUSES },
    ...(opts.mineOnly ? { responsibleUserId: actor.id } : {}),
  };
  const range = (from: Date | null, to: Date) => ({ dueAt: from ? { gte: from, lt: to } : { lt: to } });

  const counts = await Promise.all(
    windows.map((w) =>
      // Bo'sh oyna (masalan hafta oy chegarasidan oshib ketgan) — so'rovsiz 0.
      w.empty
        ? Promise.resolve(0)
        : prisma.obligation.count({ where: { ...base, ...range(w.from, w.to) } }),
    ),
  );

  const listedTo = windows.find((w) => w.key === "week")!.to;
  const rows = await prisma.obligation.findMany({
    where: { ...base, dueAt: { lt: listedTo } },
    select: {
      id: true, dueAt: true, status: true, companyId: true,
      company: { select: { name: true } },
      template: { select: { name: true } },
      responsibleUserId: true,
    },
    orderBy: { dueAt: "asc" },
    take: LIST_LIMIT,
  });

  // `Obligation.responsibleUserId` — oddiy ustun, bog'lanish emas (mas'ul
  // SNAPSHOT: xodim ketsa ham kim javobgar bo'lgani saqlanadi). Shuning uchun
  // ism alohida so'raladi.
  const userIds = [...new Set(rows.map((r) => r.responsibleUserId).filter((v): v is string => !!v))];
  const names = new Map(
    (await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })).map(
      (u) => [u.id, u.fullName],
    ),
  );

  const items: TimelineItem[] = rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    title: r.template.name,
    dueAt: r.dueAt.toISOString(),
    status: r.status,
    responsibleName: r.responsibleUserId ? (names.get(r.responsibleUserId) ?? null) : null,
  }));

  return serialize(
    windows.map((w, i) => ({
      key: w.key,
      label: w.label,
      count: counts[i],
      items: LISTED.includes(w.key)
        ? items.filter((it) => {
            const t = new Date(it.dueAt).getTime();
            return (w.from === null || t >= w.from.getTime()) && t < w.to.getTime();
          })
        : [],
    })),
  );
}
