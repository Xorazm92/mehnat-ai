import "./load-env"; // must be the first import — populates DATABASE_URL
import { prisma } from "@/lib/prisma";
import { companyScopeWhere, scopedStaffIds } from "@/lib/access";

/**
 * Portfel scope'ini bazadagi haqiqiy ma'lumot bilan tekshiradi.
 *
 *   npx tsx scripts/verify-scoping.ts
 *
 * Har aktiv foydalanuvchi uchun `companyScopeWhere` nechta firma qaytarishini
 * sanaydi va uni to'rtala mas'ul ustuni bo'yicha xom hisob bilan solishtiradi.
 * Nol firma ko'radigan (admin bo'lmagan) xodimlar alohida ogohlantirish bilan
 * chiqadi — ular deploy'dan oldin biriktirilishi kerak.
 */
async function main() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const totalActive = await prisma.company.count({ where: { isActive: true } });
  console.log(`Aktiv firmalar: ${totalActive}\n`);

  const header = ["Xodim", "Rol", "Bux", "Nazorat", "Bosh bux", "Bank", "PORTFEL", "Xodim ko'radi"];
  console.log(header.join("\t"));

  const orphans: string[] = [];

  for (const u of users) {
    const actor = { id: u.id, role: u.role as string };

    const [asAccountant, asSupervisor, asChief, asBank, portfolio, staffIds] = await Promise.all([
      prisma.company.count({ where: { isActive: true, accountantId: u.id } }),
      prisma.company.count({ where: { isActive: true, supervisorId: u.id } }),
      prisma.company.count({ where: { isActive: true, chiefAccountantId: u.id } }),
      prisma.company.count({ where: { isActive: true, bankClientId: u.id } }),
      prisma.company.count({ where: { isActive: true, ...companyScopeWhere(actor) } }),
      scopedStaffIds(prisma, actor),
    ]);

    const staffCount = staffIds === null ? "hammasi" : String(staffIds.length);
    console.log(
      [u.fullName, u.role, asAccountant, asSupervisor, asChief, asBank, portfolio, staffCount].join("\t")
    );

    // Biriktiruvi bor, lekin portfeli undan kichik bo'lsa — scope buzilgan.
    const rawMax = Math.max(asAccountant, asSupervisor, asChief, asBank);
    if (portfolio < rawMax) {
      throw new Error(
        `SCOPE XATOSI: ${u.fullName} — portfel ${portfolio} < eng katta biriktiruv ${rawMax}`
      );
    }

    const isAdmin = u.role === "admin" || u.role === "super_admin";
    if (!isAdmin && portfolio === 0) orphans.push(`${u.fullName} (${u.role})`);
  }

  if (orphans.length) {
    console.log("\n⚠️  Hech qanday firmaga biriktirilmagan (0 ta firma ko'radi):");
    for (const o of orphans) console.log(`   - ${o}`);
  }

  console.log("\n✅ Scope tekshiruvi o'tdi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
