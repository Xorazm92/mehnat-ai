// =====================================================
// XODIM ROLINI O'ZGARTIRISH
// =====================================================
//
// Rolni bazadan qo'lda (SQL bilan) o'zgartirmang: rol o'zgarishi bir nechta
// natijaga olib keladi va ular birga bo'lishi kerak —
//   * `ALLOWED_VIEWS` boshqa ekranlar to'plamini beradi;
//   * JWT ichidagi rol 5 daqiqada yangilanadi (lib/sessionRevalidation.ts),
//     ya'ni odam darhol chiqib-kirmasa eski huquq bilan yuraveradi;
//   * o'zgarish AUDIT IZI qoldirishi shart — kimning huquqi kengaygani
//     keyinchalik so'raladigan savol.
//
// Shu skript uchalasini ham bajaradi va standart holatda HECH NARSA yozmaydi.
//
// ISHLATISH:
//   npx tsx scripts/set-user-role.ts --name "Alisher" --role admin
//   npx tsx scripts/set-user-role.ts --name "Alisher" --role admin --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, ALLOWED_VIEWS, type UserRole } from "@/lib/permissions";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const APPLY = process.argv.includes("--apply");
const NAME = arg("--name");
const EMAIL = arg("--email");
const ROLE = arg("--role") as UserRole | null;

const VALID: UserRole[] = [
  "super_admin", "admin", "chief_accountant", "supervisor", "accountant", "bank_manager",
];

async function main() {
  if (!ROLE || !VALID.includes(ROLE)) {
    throw new Error(`--role kerak. Mumkin: ${VALID.join(", ")}`);
  }
  if (!NAME && !EMAIL) throw new Error("--name yoki --email kerak");

  const users = await prisma.user.findMany({
    where: EMAIL
      ? { email: EMAIL }
      : { fullName: { contains: NAME as string, mode: "insensitive" } },
    select: { id: true, fullName: true, email: true, role: true, isActive: true },
  });

  if (users.length === 0) throw new Error("Xodim topilmadi");
  if (users.length > 1) {
    console.error("Bir nechta xodim topildi — aniqroq qidiring yoki --email bering:");
    for (const u of users) console.error(`   ${u.fullName} · ${u.role} · ${u.email}`);
    throw new Error("Noaniq qidiruv");
  }

  const user = users[0];
  if (user.role === ROLE) {
    console.log(`${user.fullName} allaqachon "${ROLE_LABELS[ROLE]}" — o'zgarish kerak emas.`);
    return;
  }

  // Rol o'zgarishi biriktiruvlarni UZMAYDI, lekin ular ma'nosini yo'qotishi
  // mumkin (masalan buxgalter admin bo'lsa, firmalari egasiz qoladi).
  const [asAccountant, asSupervisor, asChief, asBank, assignments] = await Promise.all([
    prisma.company.count({ where: { accountantId: user.id } }),
    prisma.company.count({ where: { supervisorId: user.id } }),
    prisma.company.count({ where: { chiefAccountantId: user.id } }),
    prisma.company.count({ where: { bankClientId: user.id } }),
    prisma.contractAssignment.count({ where: { userId: user.id, isActive: true } }),
  ]);
  const attached = asAccountant + asSupervisor + asChief + asBank + assignments;

  console.log(`\n  Xodim   : ${user.fullName} (${user.email})`);
  console.log(`  Hozir   : ${ROLE_LABELS[user.role as UserRole]} (${user.role})`);
  console.log(`  Bo'ladi : ${ROLE_LABELS[ROLE]} (${ROLE})`);
  console.log(`  Firmalar: buxgalter ${asAccountant} · nazoratchi ${asSupervisor} · bosh bux ${asChief} · bank ${asBank} · biriktiruv ${assignments}`);
  console.log(`  Ekranlar: ${(ALLOWED_VIEWS[ROLE] ?? []).join(", ")}`);

  if (attached > 0) {
    console.log(
      `\n  ⚠️  Bu xodim ${attached} ta o'ringa biriktirilgan. Rol o'zgarsa ular UZILMAYDI,\n` +
      `      lekin mas'uliyat noto'g'ri odamda qolishi mumkin — tekshiring.`
    );
  }

  if (!APPLY) {
    console.log("\n  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: ROLE } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        tableName: "User",
        recordId: user.id,
        oldData: { role: user.role },
        newData: { role: ROLE, reason: "rol o'zgartirildi (scripts/set-user-role.ts)" },
      },
    });
  });

  console.log(`\n  ✔ ${user.fullName} → ${ROLE_LABELS[ROLE]}`);
  console.log("  Xodim tizimdan CHIQIB QAYTA KIRSIN — aks holda eski huquq 5 daqiqagacha saqlanadi.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("✖", (e as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  });
