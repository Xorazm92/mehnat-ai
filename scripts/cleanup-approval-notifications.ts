// =====================================================
// ESKI "Tasdiqlash kutilmoqda" SHOVQININI TOZALASH
// =====================================================
//
// `saveReportProof` ilgari har dalilda `SENIOR_REVIEW_ROLES` dagi BARCHA faol
// foydalanuvchiga xabar yozardi — o'rtacha 9.4 ta. Prodda 13 596 ta
// `approval_request` qatoridan 13 577 tasi o'qilmagan bo'lib yig'ildi va bitta
// xodimda 2 267 tasi turardi; qo'ng'iroq belgisi butunlay foydasiz bo'lib
// qolgandi. Generator tuzatildi (endi faqat firma tekshiruvchilariga), bu
// skript esa allaqachon yig'ilgan qatorlarni oladi.
//
// MA'LUMOT YO'QOLMAYDI: dalilning o'zi `ReportProof` da, tasdiq tarixi
// `ObligationSubmission` da qoladi. O'chadigan narsa — takroriy xabar.
//
//   npx tsx scripts/cleanup-approval-notifications.ts            # dry-run
//   npx tsx scripts/cleanup-approval-notifications.ts --apply

import "./load-env";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const where = { type: "approval_request" };

  const total = await prisma.notification.count({ where });
  const unread = await prisma.notification.count({ where: { ...where, isRead: false } });
  const all = await prisma.notification.count();

  console.log(`\n━━━ approval_request tozalash ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ━━━\n`);
  console.log(`Notification jami:        ${all}`);
  console.log(`  approval_request:       ${total} (o'qilmagan: ${unread})`);
  console.log(`  o'chirilgandan keyin:   ${all - total}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — hech narsa o'chirilmadi. Bajarish: --apply`);
    return;
  }

  const res = await prisma.notification.deleteMany({ where });
  console.log(`\nO'chirildi: ${res.count} qator.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
