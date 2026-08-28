import "./load-env";

// =====================================================
// XIZMAT KATALOGINING BOSHLANG'ICH RO'YXATI
// =====================================================
// ASRO haqiqatda sotadigan xizmatlar. Narx ATAYLAB bo'sh qoldiriladi:
// har firmada u yakka kelishuvga bog'liq va `CompanyService.price` da
// yoziladi. Bu yerda faqat "nima sotiladi" ro'yxati bo'ladi.
//
// Idempotent: kalit bo'yicha upsert, ya'ni qayta ishga tushirilsa mavjud
// nomni yangilaydi, dublikat yaratmaydi.

import { prisma } from "@/lib/prisma";

const SERVICES = [
  { key: "buxgalteriya", name: "Buxgalteriya xizmati", periodicity: "monthly", sortOrder: 10,
    description: "Kunlik buxgalteriya yuritish, 1C bazasini olib borish" },
  { key: "hisobot", name: "Hisobot topshirish", periodicity: "monthly", sortOrder: 20,
    description: "Soliq, statistika va boshqa majburiy hisobotlarni topshirish" },
  { key: "bank_klient", name: "Bank-klient xizmati", periodicity: "monthly", sortOrder: 30,
    description: "To'lov topshiriqnomalari, vipiska, bank bilan ish" },
  { key: "kadrlar", name: "Kadrlar hisobi", periodicity: "monthly", sortOrder: 40,
    description: "Buyruqlar, mehnat shartnomalari, My Mehnat" },
  { key: "oylik", name: "Oylik hisoblash", periodicity: "monthly", sortOrder: 50,
    description: "Xodimlar oyligi, INPS va daromad solig'i hisob-kitobi" },
  { key: "audit", name: "Audit", periodicity: "yearly", sortOrder: 60,
    description: "Yillik tekshiruv va xulosa" },
  { key: "maslahat", name: "Konsultatsiya", periodicity: "one_time", sortOrder: 70,
    description: "Bir martalik soliq/moliya maslahati" },
  { key: "tiklash", name: "Hisobni tiklash", periodicity: "one_time", sortOrder: 80,
    description: "O'tgan davrlar hisobini qayta tiklash" },
] as const;

async function main() {
  let created = 0;
  let updated = 0;

  for (const s of SERVICES) {
    const existing = await prisma.service.findUnique({ where: { key: s.key } });
    await prisma.service.upsert({
      where: { key: s.key },
      create: { ...s },
      // `defaultPrice` va `isActive` ga TEGILMAYDI — ular katalog ekranida
      // qo'lda sozlanadi va urug' skripti ularni orqaga qaytarmasligi kerak.
      update: {
        name: s.name,
        description: s.description,
        periodicity: s.periodicity,
        sortOrder: s.sortOrder,
      },
    });
    if (existing) updated++;
    else created++;
  }

  console.log(`Xizmat katalogi: ${created} ta yaratildi, ${updated} ta yangilandi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
