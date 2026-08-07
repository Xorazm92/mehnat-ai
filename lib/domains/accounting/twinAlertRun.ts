// =====================================================
// BALL OGOHLANTIRISHI — ishga tushirish (C2)
// =====================================================
// Engine kimga nima yuborilishini hal qiladi; bu fayl ma'lumot yig'adi va
// yuborishni BAND QILADI.
//
// QABUL QILUVCHI — SENIOR, VA FAQAT O'Z PORTFELI BO'YICHA. Ballar butun
// portfelning holatini ochib beradi, shuning uchun ular buxgalterga emas,
// nazoratchi/bosh buxgalterga boradi. Har qabul qiluvchi uchun ballar ALOHIDA
// hisoblanadi (o'z aktyori bilan), ya'ni nazoratchi o'ziga tegishli bo'lmagan
// firma haqida xabar olmaydi — bu qulaylik emas, biriktiruv doirasi.
//
// AVVAL BAND QILAMIZ, KEYIN YUBORAMIZ. `NotificationDelivery` da
// `@@unique([channel, dedupKey])` bor: qator yaratilsa — bu yuborish huquqi.
// Teskarisi (yuborib, keyin yozish) ishchi qayta uringanda ikkinchi xabarni
// ketkazadi.
import { Prisma } from "@prisma/client";
import { computeCompanyTwins, computeStaffCapacity } from "@/lib/domains/accounting/twinCompute";
import { selectAlerts, type AlertSubject, type TwinAlert } from "@/lib/engines/automation/twinAlerts";
import { isSeniorRole } from "@/lib/platform/permissions";
import { logServerError } from "@/lib/platform/logger";
import type { Actor } from "@/lib/platform/access";

type Db = Prisma.TransactionClient;

export const ALERT_CHANNEL = "twin-alert";

/** Bitta ishga tushishda bitta odamga yuboriladigan eng ko'p xabar. */
const MAX_PER_RECIPIENT = 5;

export type AlertSender = (chatId: bigint, text: string) => Promise<void>;

export interface AlertRunResult {
  recipients: number;
  candidates: number;
  sent: number;
  /** Shu daraja uchun bu davrda allaqachon yuborilgan. */
  skippedDuplicate: number;
  /** Cheklovdan oshgani uchun bu safar yuborilmadi. */
  skippedCapped: number;
  failed: number;
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  const err = e as { code?: string; message?: string } | null;
  return !!err && (err.code === "P2002" || (typeof err.message === "string" && err.message.includes("Unique constraint failed")));
}

const periodOf = (now: Date) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

export interface AlertRunDeps {
  send?: AlertSender;
  now?: Date;
  /**
   * Qabul qiluvchilarni cheklaydi.
   *
   * Ishlab chiqarishda berilmaydi (hammaga). Testda MAJBURIY: aks holda run
   * butun bazadagi haqiqiy seniorlar uchun ham ball hisoblab, ularning
   * `dedupKey` larini band qilib qo'yardi — ya'ni test haqiqiy ogohlantirishni
   * o'g'irlab, u hech qachon yuborilmasdi.
   */
  recipientIds?: string[];
}

export async function runTwinAlerts(db: Db, deps: AlertRunDeps = {}): Promise<AlertRunResult> {
  const now = deps.now ?? new Date();
  const period = periodOf(now);

  // Telegrami ulanmagan odamga xabar yuborib bo'lmaydi — ularni umuman
  // hisoblamaymiz, aks holda "yuborildi" statistikasi yolg'on bo'lardi.
  const recipients = (
    await db.user.findMany({
      where: {
        isActive: true,
        telegramUserId: { not: null },
        ...(deps.recipientIds ? { id: { in: deps.recipientIds } } : {}),
      },
      select: { id: true, role: true, telegramUserId: true },
    })
  ).filter((u) => isSeniorRole(u.role));

  const res: AlertRunResult = {
    recipients: recipients.length,
    candidates: 0,
    sent: 0,
    skippedDuplicate: 0,
    skippedCapped: 0,
    failed: 0,
  };

  for (const user of recipients) {
    const actor: Actor = { id: user.id, role: user.role };
    let alerts: TwinAlert[];
    try {
      const [twins, capacity] = await Promise.all([
        computeCompanyTwins(db, actor, period),
        computeStaffCapacity(db, actor, period),
      ]);
      const riskSubjects: AlertSubject[] = twins.map((t) => ({
        id: t.companyId,
        name: t.name,
        value: t.risk.value,
        level: t.risk.level,
        reasons: t.risk.reasons.map((r) => r.detail),
      }));
      const capacitySubjects: AlertSubject[] = capacity.map((c) => ({
        id: c.userId,
        name: c.fullName,
        value: c.score.value,
        level: c.score.level,
        reasons: c.score.reasons.map((r) => r.detail),
      }));
      alerts = [
        ...selectAlerts("risk", riskSubjects, period),
        ...selectAlerts("capacity", capacitySubjects, period),
      ];
    } catch (err) {
      logServerError("twinAlerts.compute", err, { userId: user.id });
      res.failed++;
      continue;
    }

    res.candidates += alerts.length;
    let sentToUser = 0;

    for (const alert of alerts) {
      if (sentToUser >= MAX_PER_RECIPIENT) {
        res.skippedCapped++;
        continue;
      }
      // Kalitga qabul qiluvchi qo'shiladi: bir firma ikki seniorga tegishli
      // bo'lsa, ikkalasi ham xabar olishi kerak.
      const dedupKey = `${alert.dedupKey}:${user.id}`;

      let deliveryId: string;
      try {
        const row = await db.notificationDelivery.create({
          data: {
            channel: ALERT_CHANNEL,
            level: alert.level,
            dedupKey,
            recipientId: user.id,
            targetChatId: user.telegramUserId,
            status: "pending",
          },
          select: { id: true },
        });
        deliveryId = row.id;
      } catch (e) {
        if (isUniqueViolation(e)) {
          res.skippedDuplicate++;
          continue;
        }
        logServerError("twinAlerts.claim", e, { userId: user.id, dedupKey });
        res.failed++;
        continue;
      }

      if (!deps.send) {
        // Yuboruvchi yo'q (token sozlanmagan) — band qilingan qator
        // `pending` bo'lib qoladi va qayta urinishda takrorlanmaydi.
        continue;
      }
      try {
        await deps.send(user.telegramUserId as bigint, alert.text);
        await db.notificationDelivery.update({
          where: { id: deliveryId },
          data: { status: "sent", sentAt: new Date() },
        });
        res.sent++;
        sentToUser++;
      } catch (err) {
        logServerError("twinAlerts.send", err, { userId: user.id, dedupKey });
        await db.notificationDelivery.update({ where: { id: deliveryId }, data: { status: "failed" } });
        res.failed++;
      }
    }
  }

  return res;
}
