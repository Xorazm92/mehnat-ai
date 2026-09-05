// =====================================================
// KASSA SMOKE — har marshrut haqiqatan chiziladimi
// =====================================================
//
// NEGA KERAK. `npm run build` faqat KOMPILYATSIYANI tekshiradi: server
// komponentidagi so'rov yiqilsa yoki mijoz komponenti render paytida
// otilsa, build baribir yashil bo'ladi va nosozlik faqat brauzerda
// ko'rinadi. Kassa moduli 16 ta marshrut/yorliqdan iborat — ularni qo'lda
// bosib chiqish har o'zgarishdan keyin takrorlanadigan ish edi.
//
// Bu skript ishlab turgan dev serverga (`npm run dev`) AUTENTIFIKATSIYA
// bilan kiradi va har marshrutning HTTP kodini hamda javobda xato izi
// yo'qligini tekshiradi.
//
// XAVFSIZLIK. Skript sessiya tokeni yasaydi, shuning uchun u FAQAT lokal
// bazaga va lokal serverga qarshi ishlaydi:
//   · DATABASE_URL hosti lokal bo'lishi shart;
//   · manzil localhost/127.0.0.1 bo'lishi shart;
//   · NODE_ENV=production da umuman ishga tushmaydi.
// Bazaga HECH NARSA yozilmaydi.
import "./load-env";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { USE_SECURE_COOKIES, SESSION_MAX_AGE } from "@/lib/auth.config";
import { getUserCompanyRelations } from "@/lib/userRelations";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Marshrut ro'yxati. `redirectTo` berilgan qator — bu SAHIFA emas, eski
 * havolani saqlab qoladigan yo'naltirgich (`/expenses` → chiqim kassaning
 * "Xarajat" yorlig'i). Unda `<h1>` bo'lmaydi: Next faqat qobiqni chizib,
 * mijozda navigatsiya qiladi — shuning uchun tekshiruv boshqacha.
 */
const ROUTES: (string | { path: string; redirectTo: string })[] = [
  "/kassa",
  "/kassa/kirim",
  "/kassa/kirim?tab=hisoblar",
  "/kassa/kirim?tab=navbat",
  "/kassa/chiqim",
  "/kassa/chiqim?tab=kartalar",
  "/kassa/chiqim?tab=xojalik",
  "/kassa/chiqim?tab=xarajat",
  "/kassa/qarzdorlik",
  "/kassa/qarzdorlik?tab=holat",
  "/kassa/qarzdorlik?tab=tolovlar",
  "/kassa/qarzdorlik?tab=tekshiruv",
  "/kassa/sverka",
  "/kassa/sverka?tab=terminals",
  "/kassa/sverka?tab=devices",
  "/payroll",
  "/payroll?tab=history",
  { path: "/expenses", redirectTo: "/kassa/chiqim?tab=xarajat" },
];

/** Javobda render xatosi qolganmi. */
const ERROR_MARKS = ["Application error", "Internal Server Error", "Unhandled Runtime"];

function assertLocal() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Smoke prod rejimida ishlamaydi");
  }
  const target = new URL(BASE);
  if (!LOCAL_HOSTS.has(target.hostname)) {
    throw new Error(`Smoke faqat lokal serverga: ${target.hostname}`);
  }
  const db = process.env.DATABASE_URL ?? "";
  const host = db ? new URL(db).hostname : "";
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Smoke faqat lokal bazaga: ${host || "DATABASE_URL yo'q"}`);
  }
}

async function sessionCookie(): Promise<string> {
  const name = `${USE_SECURE_COOKIES ? "__Secure-" : ""}authjs.session-token`;
  const user = await prisma.user.findFirst({
    where: { isActive: true, role: "super_admin" },
    select: { id: true, role: true, avatarColor: true },
  });
  if (!user) throw new Error("Lokal bazada faol super_admin topilmadi");

  const now = Date.now();
  const token = await encode({
    salt: name,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "",
    maxAge: SESSION_MAX_AGE,
    token: {
      id: user.id,
      sub: user.id,
      role: user.role,
      extraRoles: [],
      avatarColor: user.avatarColor,
      kind: "staff",
      companyId: null,
      relations: await getUserCompanyRelations(user.id),
      checkedAt: now,
      loginAt: now,
    } as never,
  });
  return `${name}=${token}`;
}

async function main() {
  assertLocal();
  const cookie = await sessionCookie();
  let failed = 0;

  for (const entry of ROUTES) {
    const route = typeof entry === "string" ? entry : entry.path;
    const redirectTo = typeof entry === "string" ? null : entry.redirectTo;
    let line: string;
    try {
      const res = await fetch(`${BASE}${route}`, { headers: { cookie } });
      const html = await res.text();
      const mark = ERROR_MARKS.find((m) => html.includes(m));
      // Sarlavha bittaligi — `PageHeader` shartnomasi (`components/ui/PageHeader`).
      const h1 = (html.match(/<h1/g) ?? []).length;
      const ok = redirectTo
        ? res.status === 200 && !mark && html.includes(redirectTo)
        : res.status === 200 && !mark && h1 === 1;
      if (!ok) failed++;
      line =
        `${ok ? "✓" : "✗"} ${route.padEnd(32)} ${res.status}` +
        (redirectTo ? `  → ${redirectTo}` : `  h1:${h1}`) +
        (mark ? `  ${mark}` : "");
    } catch (e) {
      failed++;
      line = `✗ ${route.padEnd(32)} ${(e as Error).message}`;
    }
    console.log(line);
  }

  await prisma.$disconnect();
  console.log(
    failed === 0
      ? `\n${ROUTES.length} ta marshrut chizildi.`
      : `\n${failed} ta marshrut yiqildi.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
