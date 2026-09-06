"use server";

// =====================================================
// DIREKTOR KOKPITI — DARVOZA VA TEZ HARAKAT (M4)
// =====================================================
// IKKI QAVATLI DARVOZA. Moliyaviy blok va bir bosishli harakatlar
// `canDirectorCockpit(role, views)` ortida: ROL (`super_admin | admin`) VA
// `director_cockpit` ko'rinishi, ikkalasi ham.
//
// Nega ikkalasi. `cockpit` ko'rinishi to'rt rolga berilgan (nazoratchi va
// bosh buxgalter ham ish oqimini ko'radi) — ya'ni ekranning o'zi "senior
// kokpiti", moliyaviy manzara esa direktorniki. Ilgari bu farq faqat shu
// fayldagi rol shartida yashardi: RBAC matritsasida ko'rinmasdi va admin uni
// boshqara olmasdi. Endi ko'rinish matritsada, rol esa kodda — matritsa
// ruxsatni TORAYTIRA oladi, KENGAYTIRA olmaydi.
//
// SABAB MAJBURIY. Direktorning bir bosishi ish oqimini chetlab o'tadi
// (xarajat navbatdan chiqadi, majburiyat boshqa odamga o'tadi). Sababsiz
// bunday qaror keyin o'qib bo'lmaydigan bo'lib qoladi: audit izida "kim"
// bor, "nega" yo'q. Shuning uchun bo'sh sabab serverda rad etiladi —
// modaldagi `disabled` tugma faqat qulaylik.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import type { Actor } from "@/lib/platform/access";
import { canDirectorCockpit } from "@/lib/platform/permissions";
import { currentUserViews } from "@/server/rbac";
import {
  getDirectorCockpitFinance,
  type DirectorCockpitFinance,
} from "@/lib/domains/accounting/directorCockpitFinance";
import { approveExpense } from "@/server/kassa";
import { reassignObligation } from "@/server/obligations";

/**
 * Darvoza — ROL va KO'RINISH, ikkalasi ham (`canDirectorCockpit`).
 *
 * Ko'rinish `currentUserViews()` dan olinadi, ya'ni admin RBAC matritsasidan
 * `director_cockpit` ni o'chirsa moliyaviy blok ham, tugmalar ham yopiladi.
 * Rol sharti esa tahrirlanmaydi: matritsa ruxsatni toraytira oladi,
 * kengaytira olmaydi.
 */
async function requireDirector(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  const views = await currentUserViews();
  if (!canDirectorCockpit(role, views)) {
    throw new Error("Ruxsat yo'q: bu ko'rinish faqat direktor (Admin/Superadmin) uchun");
  }
  return { id: session.user.id as string, role };
}

function requireReason(reason: string | undefined): string {
  const r = reason?.trim();
  if (!r) throw new Error("Sabab majburiy — bu qaror audit izida saqlanadi");
  return r;
}

/**
 * Kokpitning moliyaviy bloki. Direktor bo'lmasa `null` — ekran blokni
 * umuman chizmaydi va "ruxsat yo'q" xatosi foydalanuvchiga ko'rinmaydi
 * (u shunchaki boshqa ekran ko'radi, buzilgan ekran emas).
 */
export async function getCockpitFinance(): Promise<DirectorCockpitFinance | null> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const views = await currentUserViews();
  if (!canDirectorCockpit(session.user.role as string, views)) return null;
  return serialize(await getDirectorCockpitFinance(prisma));
}

/**
 * Kutayotgan xarajatni kokpitdan tasdiqlash.
 *
 * `approveExpense` (server/kassa.ts) o'z tekshiruvlarini SAQLAYDI — chegara
 * (`canApproveExpense`), davr qulfi, balans va manba qoldig'i darvozasi
 * hammasi o'sha yerda qoladi. Bu funksiya ularni almashtirmaydi, faqat
 * ustiga ikki narsa qo'shadi: direktor darvozasi va SABAB.
 *
 * Sabab alohida audit qatori bilan yoziladi, chunki `approveExpense` ning
 * o'z izi uni bilmaydi (u faqat `status`/`amount` yozadi).
 */
export async function approveExpenseFromCockpit(id: string, reason: string) {
  const actor = await requireDirector();
  const why = requireReason(reason);

  const row = await approveExpense(id);

  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    newData: { reason: why, via: "director-cockpit" },
  });

  return serialize(row);
}

/**
 * Muddati o'tgan majburiyatni boshqa xodimga o'tkazish.
 *
 * `reassignObligation` (server/obligations.ts) ishning O'ZINI ko'chiradi —
 * `CompanyObligationOverride(action:"reassign")` EMAS. Ikkinchisi faqat
 * KELAJAKDA generatsiya qilinadigan majburiyatlarga ta'sir qiladi va
 * direktor bosgan kechikkan qatorga umuman tegmasdi: tugma "bajarildi"
 * deb ko'rsatib, ish o'sha odamda qolib ketardi.
 *
 * Sabab `reassignObligationTo` ichida `ObligationAssignmentEvent.reason` ga
 * yoziladi, ya'ni bu yerda ikkinchi audit qatori kerak emas.
 */
export async function reassignObligationFromCockpit(
  id: string,
  toUserId: string,
  reason: string,
) {
  await requireDirector();
  const why = requireReason(reason);
  if (!toUserId) throw new Error("Kimga o'tkazilishini tanlang");

  return serialize(await reassignObligation(id, toUserId, why));
}

/** Qayta tayinlash uchun nomzodlar — faol xodimlar. */
export async function getReassignCandidates() {
  await requireDirector();
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["chief_accountant", "supervisor", "accountant"] } },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });
  return serialize(users);
}
