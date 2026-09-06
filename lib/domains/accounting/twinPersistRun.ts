// =====================================================
// HISOBLANGAN XAVFNI USTUNGA YOZISH — ishga tushirish (C1)
// =====================================================
// NEGA BU FAYL BOR. Yozish mantig'i `server/twin.ts` da edi va u `auth()` ga
// bog'langan — ya'ni faqat ekrandagi tugmadan ishlardi. `Company.riskLevel`
// esa 7 joyda o'qiladi (`twinCompute.ts` sarlavhasiga qarang), demak u
// kimdir tugmani bosmasa jimgina eskirardi va buni hech kim sezmasdi.
//
// Kechalik yurish uchun yozuvchi SESSIYASIZ ishlashi kerak, shuning uchun u
// `twinAlertRun.ts` bilan bir xil qatlamga tushdi: `db` + aniq `Actor`,
// `auth()` yo'q, `revalidatePath` yo'q. `server/twin.ts` endi shu yerga
// delegatsiya qiladi — mantiq bitta nusxada qoladi.
//
// DOIRA VA MUALLIFLIK — IKKI BOSHQA NARSA. `actor` FAQAT ko'rish doirasini
// beradi (`companyScopeWhere`), audit izidagi "kim" esa `auditUserId`. Ekranda
// ikkalasi bir odam; kechalik yurishda doira admin bo'lishi kerak (hamma
// firma), lekin ortida odam YO'Q — shuning uchun audit `null` yoziladi.
// Bittasini ikkinchisi bilan almashtirish audit izida yolg'on qoldirardi:
// "falonchi admin 213 firmani o'zgartirdi", holbuki u uxlab yotgan edi.
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/platform/access";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { computeCompanyTwins } from "@/lib/domains/accounting/twinCompute";

type Db = Prisma.TransactionClient;

export interface PersistRiskResult {
  period: string;
  considered: number;
  updated: number;
}

export interface PersistRiskDeps {
  /** Ko'rish doirasi. Kechalik yurishda admin — hamma firma. */
  actor: Actor;
  period: string;
  /**
   * Audit izida "kim". Berilmasa `actor.id` (ekrandagi tugma). Avtomatik
   * yurishda ataylab `null` beriladi — `AuditLog.userId` nullable va bu
   * "ortida odam yo'q" ning rost ifodasi.
   */
  auditUserId?: string | null;
}

/**
 * Hisoblangan xavfni `Company.riskLevel` ga yozadi.
 *
 * O'ZGARGANLARNIGINA yozadi — 213 ta yozuv o'rniga bir nechta, va audit izi
 * shovqinga aylanmaydi. `unknown` (majburiyati yo'q firma) TEGILMAYDI: uni
 * `low` ga tushirish "xavfsiz" degan yolg'on bo'lardi.
 */
export async function runPersistRiskLevels(
  db: Db,
  deps: PersistRiskDeps,
): Promise<PersistRiskResult> {
  const { actor, period } = deps;
  const auditUserId = deps.auditUserId === undefined ? actor.id : deps.auditUserId;

  const twins = await computeCompanyTwins(db, actor, period);

  const current = await db.company.findMany({
    where: { id: { in: twins.map((t) => t.companyId) } },
    select: { id: true, riskLevel: true },
  });
  const was = new Map(current.map((c) => [c.id, c.riskLevel]));

  let updated = 0;
  for (const t of twins) {
    if (t.risk.level === "unknown") continue;
    if (was.get(t.companyId) === t.risk.level) continue;
    await db.company.update({
      where: { id: t.companyId },
      data: { riskLevel: t.risk.level, riskNotes: t.explanation },
    });
    updated++;
  }

  if (updated > 0) {
    await recordAuditLog({
      userId: auditUserId,
      action: "update",
      tableName: "Company",
      recordId: `twin:${period}`,
      newData: { period, updated },
    });
  }

  return { period, considered: twins.length, updated };
}
