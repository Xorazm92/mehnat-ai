import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

interface RawReversal {
  id: string;
  sourceTable: string;
  sourceId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description: string | null;
  transactionId: string;
  period: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Avval July reversallarining manba ma'lumotlarini olamiz
  // Ular ALLnir o'chirilgan, lekin biz ularni qayta tiklaymiz
  // Agar recovery ma'lumotlari to'liq bo'lmasa, boshqa yondashuv kerak

  // Boshqa yondashuv: to'liq tiklash o'rniga,
  // Faqat CASH balans farqini tuzatish uchun kerakli yozuvlarni qo'shamiz
  // July CASH = -983,366,862, Manba = -660,461,634
  // Farq = -322,905,228 (jurnal ko'p hisoblayapti)
  // Ya'ni jurnalda ortiqcha -322M bor
  // Bu ortiqchalik 93 ta reversal dan kelgan (302M) + boshqa narsalar (20M)

  // Aslida tafovut = manba_net - jurnal_net
  // manba = -660,461,634
  // jurnal = -983,366,862
  // tafovut = (-660,461,634) - (-983,366,862) = +322,905,228
  // Musbat = jurnal manbadan ko'p (jurnal ortiqcha debitorlik ko'rsatadi)
  // Bu ortiqchalik = reversallar + boshqa orphan entries

  // To'g'ri yechim: Jurnal CASH net -= 322,905,228
  // Ya'ni 322,905,228 ga teng yangi credit yozuv qo'shamiz (CASH ga)
  // Yoki: har bir orphaned reversal uchun aks ta'sirli yozuv qo'shamiz

  // Lekin eng to'g'ri yechim: reversallarni Augustga ko'chirish
  // chunki ular Augustda yaratilgan, Julyga backdate qilingan

  // Hozircha: July davridagi CASH balance ni to'g'rilash uchun
  // "adjustment" yozuv qo'shamiz

  console.log("Strateiya: July CASH balansini to'g'rilash");
  console.log("July manba: -660,461,634");
  console.log("July jurnal: -983,366,862");
  console.log("Farq: +322,905,228 (jurnal ortiqcha)");
  console.log("Sabab: 93 ta reversal Julyga backdate qilingan, Augustda yaratilgan");
  console.log("\nYechim: adjustment yozuv bilan CASH balansni kamaytirish");

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    await prisma.$disconnect();
    return;
  }

  // Adjustment: July uchun CASH debit yozuvi — balansni kamaytiradi
  const adjustmentId = randomUUID();
  const transactionId = randomUUID();

  // July CASH ortiqcha +322M — biz uni Augustga ko'chiramiz
  // Ya'ni July CASH ga Dr yozuv qilamiz (pul keldi = debit)
  // Bu July net -= 322M qiladi
  // Jami July net = -983M - 322M = -1,305M
  // Manba = -660M
  // Farq = -660M - (-1,305M) = +645M  — bu ham noto'g'ri

  // Xo'sh, to'g'ri yechim:
  // Jurnal July = -983M
  // Manba July = -660M
  // Farq = -322M
  // Agar July jurnal -322M ga kamaysa: -983M - 322M = -1,305M
  // Farq = -660M - (-1,305M) = +645M — yana noto'g'ri

  // Demak muammo: reversallar Julyda ORTIQCHA hisoblayapti
  // Ya'ni ularni olib tashlash kerak
  // Lekin ular o'chirilgan

  // Eng to'g'ri: ularni Augustga ko'chirish
  // Ya'ni +322M ta'sirli yozuv qo'shish Julyga (credit yoki debit)

  // July CASH: debit - credit = -983,366,862
  // Manba net: -660,461,634
  // Farq: -322,905,228 (jurnal manbadan kam)
  // Xo'sh... men minus qo'yayotgandekman...

  // formula: tafovut = manba - jurnal
  // tafovut = (-660M) - (-983M) = +322M (musbat)
  // Musbat = jurnal manbadan ko'p
  // Jurnal CASH net = sum(debit) - sum(credit)
  // Agar jurnal ko'p ko'rsatsa, ya'ni Dr - Cr ortiqcha

  // 322M ortiqcha Dr yozuv bor — bu ularni olib tashlash kerak
  // Yoki shunchaki teskari yozuv qilish

  console.log("\nAmal: July CASH ga adjustment debit yozuvi qo'shish");
  console.log("Bu July net -= 322M qiladi");
  console.log("Yangi July net = -983M - 322M = -1,305M");
  console.log("Tafovut = -660M - (-1,305M) = +645M");

  // Bu to'g'ri EMAS — muammoni yomonlashtiradi
  // To'g'ri yechim: 93 ta reversal yozuvini tiklash + Augustga ko'chirish

  console.log("\nTO'G'RI YECHIM: reversallarni Augustga tiklash");
  console.log("Buning uchun LOST_REVERSALS da barcha 93 ta ma'lumot kerak");
  console.log("2 ta yozuv ma'lumotlari yo'q — ularni qidirish kerak");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
