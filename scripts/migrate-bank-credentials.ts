/**
 * BACKFILL — `Company.bankClientLogin` / `bankClientPassword` (ochiq matn) →
 * shifrlangan `ClientCredential` vault'i (serviceName = "bank_client").
 *
 * Nima uchun: bu ikki ustun wizarddan to'ldirilardi, firma kartochkasining
 * "Loginlar" tabi esa faqat vault'ni ko'rsatadi — natijada kiritilgan parol
 * qaytib ochilganda YO'Q bo'lib ko'rinardi. Yozish yo'li endi vault'ga
 * qaratildi (`server/companies.ts#persistBankCredential`), bu skript esa
 * ustunlarda qolgan eski qiymatlarni o'sha yerga olib o'tadi.
 *
 * Tartib `scripts/migrate-company-credentials.ts` bilan bir xil:
 *
 *   1) Ko'rish (hech narsa yozilmaydi — DEFAULT):
 *        npx tsx scripts/migrate-bank-credentials.ts
 *   2) Vault'ga ko'chirish (eski ustunlar TEGILMAYDI — rollback oson):
 *        npx tsx scripts/migrate-bank-credentials.ts --apply
 *   3) Ilova tasdiqlangach, ochiq matnni tozalash:
 *        npx tsx scripts/migrate-bank-credentials.ts --apply --purge
 *
 * --purge vault qatorini dekript qilib asl qiymat bilan solishtiradi; bitta
 * nomuvofiqlik butun purge'ni to'xtatadi. Ustunlar DROP qilinmaydi — NULL.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { BANK_SERVICE } from "@/lib/credentials";

const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge");

interface Row {
  id: string;
  name: string;
  bankClientLogin: string | null;
  bankClientPassword: string | null;
}

async function main(): Promise<void> {
  if (PURGE && !APPLY) {
    console.error("✖ --purge faqat --apply bilan birga ishlaydi.");
    process.exit(1);
  }

  const companies: Row[] = await prisma.company.findMany({
    where: { OR: [{ bankClientLogin: { not: null } }, { bankClientPassword: { not: null } }] },
    select: { id: true, name: true, bankClientLogin: true, bankClientPassword: true },
    orderBy: { name: "asc" },
  });

  const pending = companies.filter(
    (c) => (c.bankClientLogin ?? "") !== "" || (c.bankClientPassword ?? "") !== ""
  );
  console.log(`▶ Ochiq matn bank-klient credential'i bor firmalar: ${pending.length}`);
  if (pending.length === 0) {
    console.log("✅ Ko'chiriladigan narsa yo'q.");
    return;
  }

  const existing = await prisma.clientCredential.findMany({
    where: { companyId: { in: pending.map((c) => c.id) }, serviceName: BANK_SERVICE },
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
    console.log(
      `  ${APPLY ? "→" : "·"} ${action.padEnd(6)} ${c.name} ` +
        `(login=${c.bankClientLogin ? "bor" : "yo'q"}, parol=${c.bankClientPassword ? "bor" : "yo'q"})`
    );

    if (!APPLY) continue;

    const data = {
      loginId: c.bankClientLogin ?? "",
      encryptedPassword: c.bankClientPassword ? encryptSecret(c.bankClientPassword) : "",
    };
    if (vaultId) {
      await prisma.clientCredential.update({ where: { id: vaultId }, data });
      updated++;
    } else {
      await prisma.clientCredential.create({
        data: { companyId: c.id, serviceName: BANK_SERVICE, ...data },
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

  console.log("\n▶ Tekshiruv: vault qiymati asl qiymatga mos keladimi…");
  const verified: string[] = [];
  for (const c of migrated) {
    const row = await prisma.clientCredential.findFirst({
      where: { companyId: c.id, serviceName: BANK_SERVICE },
      orderBy: { updatedAt: "desc" },
      select: { loginId: true, encryptedPassword: true },
    });
    const okLogin = (row?.loginId ?? "") === (c.bankClientLogin ?? "");
    const okPassword = (row ? decryptSecret(row.encryptedPassword) : "") === (c.bankClientPassword ?? "");
    if (!okLogin || !okPassword) {
      console.error(`✖ MOS KELMADI: ${c.name} (${c.id}) — purge to'xtatildi, hech narsa tozalanmadi.`);
      process.exit(1);
    }
    verified.push(c.id);
  }

  const res = await prisma.company.updateMany({
    where: { id: { in: verified } },
    data: { bankClientLogin: null, bankClientPassword: null },
  });
  console.log(`✅ ${res.count} ta firmada ochiq matn tozalandi (ustunlar saqlanib qoldi, faqat NULL).`);
}

main()
  .catch((e) => {
    console.error("✖ Xato:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
