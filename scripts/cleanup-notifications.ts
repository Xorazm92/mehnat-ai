/**
 * ESKI BILDIRISHNOMALARNI TOZALASH — default DRY-RUN.
 *
 *   npx tsx scripts/cleanup-notifications.ts                  # faqat ko'rsatadi
 *   npx tsx scripts/cleanup-notifications.ts --apply          # 30 kundan eskisi
 *   npx tsx scripts/cleanup-notifications.ts --supersede --apply
 *
 * NEGA KO'R-KO'RONA `DELETE` YO'Q. Bazada 65 845 qator bor, ammo ularning
 * hammasi ham shovqin emas: `approval_request`, `status_change`,
 * `payment_receipt` — odam haqiqatan ko'rishi kerak bo'lgan xabarlar. Shuning
 * uchun tozalash TASNIFGA tayanadi: faqat sweep chiqargan ikkita tur
 * (`obligation_reminder`, `escalation_obligation`), faqat o'qilmaganlari va
 * faqat 30 kundan eskilari.
 *
 * `NotificationDelivery` GA TEGILMAYDI. U yerdagi `dedupKey` — idempotentlik
 * qulfi. Qator o'chsa kalit bo'shaydi va o'sha eslatma QAYTA yuborilishi
 * mumkin. Uni faqat 180 kunlik retention (bot/cron/chores.ts) tozalaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

/** Sweep chiqargan turlar — auditda ikkalasi ham 100% o'qilmagan chiqqan. */
const NOISY_TYPES = ["obligation_reminder", "escalation_obligation"];

/** Shundan eski o'qilmagan shovqin o'chadi. */
const NOISY_AGE_DAYS = 30;

/**
 * `--supersede` — YOSHIDAN QAT'I NAZAR barcha o'qilmagan shovqinni o'chiradi.
 *
 * Nima uchun bu yoshni pasaytirish emas, TASNIF: bu ikkala tur ham HOSILA
 * holat — ular `Obligation.dueAt` va `Obligation.status` allaqachon aytadigan
 * narsani takrorlaydi, xolos. Kunlik yig'ma (obligationRollup.ts) o'sha
 * manbadan har kuni QAYTA hisoblab beradi, ya'ni bu qatorlarni o'chirish
 * hech qanday ma'lumotni yo'qotmaydi — faqat eskirgan nusxani olib tashlaydi.
 *
 * Aynan shu sababdan bayroq `approval_request`, `payment_receipt`,
 * `status_change` kabi turlarga TEGMAYDI: ular hodisa yozuvi, hosila holat
 * emas, va ularni qayta hisoblab bo'lmaydi.
 *
 * Amaliy sabab: lokal bazada 2026-08-06 20:00 da bitta sweep 44 846 ta qator
 * yaratgan. Ular 30 kunlik oynaga tushmaydi, lekin ularni yaratgan kod endi
 * mavjud emas va ularning 100% i o'qilmagan.
 */

/** O'qilgan xabarlar shundan keyin saqlanmaydi (retention bilan bir xil). */
const READ_AGE_DAYS = 90;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const supersede = process.argv.includes("--supersede");
  const now = Date.now();

  const noisyWhere = {
    type: { in: NOISY_TYPES },
    isRead: false,
    ...(supersede ? {} : { createdAt: { lt: new Date(now - NOISY_AGE_DAYS * DAY) } }),
  };
  const readWhere = {
    isRead: true,
    createdAt: { lt: new Date(now - READ_AGE_DAYS * DAY) },
  };

  const [total, noisy, readOld, keptNoisyFresh] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: noisyWhere }),
    prisma.notification.count({ where: readWhere }),
    prisma.notification.count({
      where: { type: { in: NOISY_TYPES }, isRead: false, createdAt: { gte: new Date(now - NOISY_AGE_DAYS * DAY) } },
    }),
  ]);

  console.log(`rejim                                 ${supersede ? "--supersede (hosila holat, yoshdan qat'i nazar)" : `${NOISY_AGE_DAYS} kundan eski`}`);
  console.log(`jami bildirishnoma                    ${total}`);
  console.log(`o'chadi: hosila shovqin               ${noisy}`);
  console.log(`o'chadi: o'qilgan (${READ_AGE_DAYS} kun+)           ${readOld}`);
  if (!supersede) console.log(`qoladi:  yangi shovqin (${NOISY_AGE_DAYS} kundan yosh) ${keptNoisyFresh}`);
  console.log(`qoladi:  hodisa yozuvlari (barcha boshqa tur) ${total - noisy - readOld - (supersede ? 0 : keptNoisyFresh)}`);

  if (!apply) {
    console.log(`\nDRY-RUN — hech narsa o'chirilmadi. Bajarish: --apply`);
    await prisma.$disconnect();
    return;
  }

  const a = await prisma.notification.deleteMany({ where: noisyWhere });
  const b = await prisma.notification.deleteMany({ where: readWhere });
  console.log(`\nO'CHIRILDI: shovqin ${a.count}, o'qilgan ${b.count}`);
  console.log(`NotificationDelivery tegilmadi (dedup kalitlari).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
