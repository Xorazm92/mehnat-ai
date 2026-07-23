/**
 * BACKFILL — `Company.login` / `Company.password` (ochiq matn) → shifrlangan
 * `ClientCredential` vault'i (serviceName = "soliq").
 *
 * Nima uchun: bu ustunlar ASRO auth paroli EMAS, soliq.uz portalining tashqi
 * kirish ma'lumoti edi. Ular ochiq matnda yotardi va `getCompanies()` ularni
 * firmalar ro'yxatini ko'ra oladigan HAR BIR foydalanuvchining brauzeriga
 * (hamda Excel eksportga) yuborardi.
 *
 * Ishga tushirish (bosqichma-bosqich — hech qachon bir zarbada emas):
 *
 *   1) Ko'rish (hech narsa yozilmaydi — DEFAULT):
 *        npx tsx scripts/migrate-company-credentials.ts
 *
 *   2) Vault'ga ko'chirish (eski ustunlar TEGILMAYDI — rollback oson):
 *        npx tsx scripts/migrate-company-credentials.ts --apply
 *
 *   3) Ilova to'g'ri ishlayotgani TASDIQLANGACH, ochiq matnni tozalash:
 *        npx tsx scripts/migrate-company-credentials.ts --apply --purge
 *
 * --purge har bir firma uchun vault qatorini DEKRIPT qilib, asl qiymat bilan
 * bayt-ma-bayt solishtiradi va faqat mos kelsa ustunni NULL qiladi. Bitta
 * nomuvofiqlik butun purge'ni to'xtatadi.
 *
 * Ustunlar HECH QACHON DROP qilinmaydi — bu skript faqat NULL qo'yadi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { PRIMARY_SERVICE } from "@/lib/credentials";

const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge");

interface Row {
  id: string;
  name: string;
  login: string | null;
  password: string | null;
}

async function main(): Promise<void> {
  if (PURGE && !APPLY) {
    console.error("✖ --purge faqat --apply bilan birga ishlaydi.");
    process.exit(1);
  }

  const companies: Row[] = await prisma.company.findMany({
    where: { OR: [{ login: { not: null } }, { password: { not: null } }] },
    select: { id: true, name: true, login: true, password: true },
    orderBy: { name: "asc" },
  });

  const pending = companies.filter((c) => (c.login ?? "") !== "" || (c.password ?? "") !== "");
  console.log(`▶ Ochiq matn credential'i bor firmalar: ${pending.length}`);
  if (pending.length === 0) {
    console.log("✅ Ko'chiriladigan narsa yo'q.");
    return;
  }

  const existing = await prisma.clientCredential.findMany({
    where: { companyId: { in: pending.map((c) => c.id) }, serviceName: PRIMARY_SERVICE },
    orderBy: { updatedAt: "desc" },
    select: { id: true, companyId: true },
  });
  const vaultByCompany = new Map<string, string>();
  for (const e of existing) if (!vaultByCompany.has(e.companyId)) vaultByCompany.set(e.companyId, e.id);

  let created = 0;
  let updated = 0;
  const migrated: Row[] = [];

  for (const c of pending) {
    const vaultId = vaultByCompany.get(c.id);
    const action = vaultId ? "update" : "create";
    console.log(`  ${APPLY ? "→" : "·"} ${action.padEnd(6)} ${c.name} (login=${c.login ? "bor" : "yo'q"}, parol=${c.password ? "bor" : "yo'q"})`);

    if (!APPLY) continue;

    const data = {
      loginId: c.login ?? "",
      encryptedPassword: c.password ? encryptSecret(c.password) : "",
    };
    if (vaultId) {
      await prisma.clientCredential.update({ where: { id: vaultId }, data });
      updated++;
    } else {
      await prisma.clientCredential.create({
        data: { companyId: c.id, serviceName: PRIMARY_SERVICE, ...data },
      });
      created++;
    }
    migrated.push(c);
  }

  if (!APPLY) {
    console.log("\nℹ Ko'rish rejimi — hech narsa yozilmadi. Ko'chirish uchun --apply qo'shing.");
    return;
  }
  console.log(`\n✅ Vault: ${created} ta yaratildi, ${updated} ta yangilandi.`);

  if (!PURGE) {
    console.log("ℹ Ochiq matn ustunlari TEGILMADI. Ilova tekshirilgach --purge bilan qayta ishga tushiring.");
    return;
  }

  // ── PURGE: avval hammasini tekshiramiz, keyin yozamiz ──────────────────────
  console.log("\n▶ Tekshiruv: vault qiymati asl qiymatga mos keladimi…");
  const verified: string[] = [];
  for (const c of migrated) {
    const row = await prisma.clientCredential.findFirst({
      where: { companyId: c.id, serviceName: PRIMARY_SERVICE },
      orderBy: { updatedAt: "desc" },
      select: { loginId: true, encryptedPassword: true },
    });
    const okLogin = (row?.loginId ?? "") === (c.login ?? "");
    const okPassword = (row ? decryptSecret(row.encryptedPassword) : "") === (c.password ?? "");
    if (!okLogin || !okPassword) {
      console.error(`✖ MOS KELMADI: ${c.name} (${c.id}) — purge to'xtatildi, hech narsa tozalanmadi.`);
      process.exit(1);
    }
    verified.push(c.id);
  }

  const res = await prisma.company.updateMany({
    where: { id: { in: verified } },
    data: { login: null, password: null },
  });
  console.log(`✅ ${res.count} ta firmada ochiq matn tozalandi (ustunlar saqlanib qoldi, faqat NULL).`);
}

main()
  .catch((e) => {
    console.error("✖ Xato:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
