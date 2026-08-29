import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // Test User larni topish
  const testUsers = await prisma.$queryRaw<Array<{id: string; email: string; name: string | null; createdAt: Date}>>`
    SELECT id, email, "fullName", "createdAt"
    FROM "User"
    WHERE email LIKE 'test%' OR email LIKE '%test%' OR email LIKE '%+test%'
       OR "fullName" LIKE '%Test%' OR "fullName" LIKE '%test%'
       OR email = 'test@test.com'
    ORDER BY "createdAt"
  `;
  console.log(`Test User lar (${testUsers.length} ta):`);
  for (const u of testUsers) {
    console.log(`  ${u.id.slice(0,8)} | ${u.email} | ${u.fullName ?? 'null'} | ${u.createdAt.toISOString().slice(0,10)}`);
  }

  // Test KassaEntry larni topish (obed: yoki null companyId)
  const testKassa = await prisma.$queryRaw<Array<{id: string; description: string | null; amount: string; companyId: string | null; createdAt: Date}>>`
    SELECT id, description, amount::text, "companyId", "createdAt"
    FROM "KassaEntry"
    WHERE description LIKE 'obed:%'
       OR "companyId" IS NULL
    ORDER BY "createdAt"
    LIMIT 20
  `;
  console.log(`\nTest KassaEntry lar (first 20 of many):`);
  for (const k of testKassa) {
    console.log(`  ${k.id.slice(0,8)} | ${k.description?.slice(0,30) ?? 'null'} | ${k.amount} | companyId=${k.companyId?.slice(0,8) ?? 'null'} | ${k.createdAt.toISOString().slice(0,10)}`);
  }

  // Jami
  const totalKassa = await prisma.$queryRaw<Array<{cnt: number}>>`
    SELECT count(*)::int as cnt
    FROM "KassaEntry"
    WHERE description LIKE 'obed:%' OR "companyId" IS NULL
  `;
  console.log(`\nJami test KassaEntry: ${totalKassa[0]?.cnt ?? 0}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
