"use server";

// =====================================================
// TAVSIYALAR — sessiya darvozasi (M5.3)
// =====================================================
// Mantiq `lib/domains/accounting/recommendations.ts` da (u sessiyani
// bilmaydi — cron ham, AI tooli ham o'sha yerga boradi). Bu fayl faqat
// KIM so'rayotganini aniqlaydi va Telegram portini ulaydi.
//
// DARVOZA IKKI DARAJALI, ATAYLAB:
//
//   KO'RISH  — `isSeniorRole` (bosh buxgalter va nazoratchi ham ko'radi).
//   QAROR    — `canDirectorCockpit` (faqat direktor: super_admin | admin).
//
// Nega ajratildi. Qabul qilingan tavsiya HAQIQIY amal bajaradi va ish
// oqimini chetlab o'tadi: majburiyat boshqa odamga o'tadi, kechikish sababi
// tasdiqlanib qator KPI dan chiqadi, eskalatsiya zanjiri ko'tariladi.
// M4 da xuddi shu turdagi bir bosishli harakatlar uchun chegara allaqachon
// qo'yilgan (`server/directorCockpit.ts`) va bu yerda IKKINCHI, boshqacha
// chegara yaratilmaydi — bittasi albatta eskirardi.
//
// Ko'rish esa kengroq: navbatni yashirish bosh buxgalterni "nima kutmoqda"
// dan ayirardi, holbuki ish oxir-oqibat uning bo'limida bajariladi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/serialize";
import type { Actor } from "@/lib/platform/access";
import { canDirectorCockpit, isSeniorRole } from "@/lib/platform/permissions";
import { currentUserViews } from "@/server/rbac";
import { telegramQueueDispatcher } from "@/lib/notifyDispatch";
import type { AiClaim } from "@/lib/ai/claim";
import type { Recommendation, RecommendationKind } from "@/lib/ai/recommendation";
import {
  createRecommendationRecord,
  listPendingRecommendationRows,
  decideRecommendationRow,
  getRecommendationAdoption,
  PENDING_PAGE_SIZE,
  type AdoptionResult,
} from "@/lib/domains/accounting/recommendations";
import { updateTag } from "next/cache";

async function requireSenior(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) {
    throw new Error("Ruxsat yo'q: tavsiyalar rahbar va nazoratchilar uchun");
  }
  return { id: session.user.id as string, role };
}

/** Qaror darvozasi — M4 dagi `requireDirector` bilan bir xil shart. */
async function requireDirector(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  const views = await currentUserViews();
  if (!canDirectorCockpit(role, views)) {
    throw new Error("Ruxsat yo'q: tavsiya bo'yicha qaror faqat direktor (Admin/Superadmin) uchun");
  }
  return { id: session.user.id as string, role };
}

/**
 * Javob kutayotgan tavsiyalar — foydalanuvchining PORTFELI bo'yicha.
 *
 * Doira `companyScopeWhere` bilan domen qatlamida qo'llanadi: bosh buxgalter
 * o'z firmalarining tavsiyalarini ko'radi, direktor hammasini.
 */
export async function listPendingRecommendations(limit = PENDING_PAGE_SIZE): Promise<Recommendation[]> {
  const actor = await requireSenior();
  return serialize(await listPendingRecommendationRows(prisma, actor, limit));
}

export interface DecideRecommendationInput {
  id: string;
  decision: "accepted" | "dismissed";
  /** Sabab — MAJBURIY, qabulda ham, radda ham. */
  note: string;
}

/**
 * Qabul yoki rad.
 *
 * Qabulda payload BAJARILADI (domen qatlamida), radda hech narsa bajarilmaydi.
 * Telegram porti shu yerda ulanadi — `lib/` bot navbatini bilmaydi.
 */
export async function decideRecommendation(input: DecideRecommendationInput) {
  const actor = await requireDirector();
  const res = await decideRecommendationRow(
    prisma,
    { actor, id: input.id, decision: input.decision, note: input.note },
    { dispatchTelegram: telegramQueueDispatcher },
  );
  // Bajarilgan amal boshqa ekranlarga tegadi (majburiyat ko'chdi, vazifa
  // ochildi) — keshni ochiq qoldirish direktorga eski holatni ko'rsatardi.
  updateTag("obligations");
  updateTag("tasks");
  return serialize(res);
}

export interface CreateRecommendationInput {
  companyId: string;
  kind: RecommendationKind;
  rationale: string;
  payload: Record<string, unknown>;
  claims?: AiClaim[];
}

/**
 * Tavsiya yaratish — odam tomonidan (ekrandan) chaqirilganda.
 *
 * AI yo'li BU FAYLDAN O'TMAYDI: `lib/ai/tools.ts` domen funksiyasini
 * to'g'ridan-to'g'ri chaqiradi, chunki u allaqachon `auth()` qilgan va
 * assistant darvozasidan (`isSeniorRole`, M5.2) o'tgan. Ikkinchi sessiya
 * o'qishi qo'shimcha hech narsa bermasdi.
 */
export async function createRecommendation(input: CreateRecommendationInput) {
  const actor = await requireSenior();
  const res = await createRecommendationRecord(prisma, {
    actor,
    companyId: input.companyId,
    kind: input.kind,
    rationale: input.rationale,
    claims: input.claims ?? [],
    payload: input.payload,
    source: "assistant",
  });
  return serialize(res);
}

/**
 * Kokpit bloki uchun bitta o'qish: navbat + o'lchov.
 *
 * XATO TASHLAMAYDI — `getCockpitFinance` bilan bir xil qoida: kokpit
 * yorlig'i to'rt rolga ochiq va admin `roleViews` orqali uni beshinchisiga
 * ham berishi mumkin. Ruxsati yo'q foydalanuvchi buzilgan ekran emas,
 * BO'SH blok ko'radi.
 */
export async function getCockpitRecommendations(): Promise<{
  pending: Recommendation[];
  /** `null` ⇒ foydalanuvchi direktor emas; o'lchov unga ko'rsatilmaydi. */
  adoption: AdoptionResult | null;
}> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) return { pending: [], adoption: null };

  const actor: Actor = { id: session.user.id as string, role };
  const views = await currentUserViews();
  const [pending, adoption] = await Promise.all([
    listPendingRecommendationRows(prisma, actor),
    canDirectorCockpit(role, views) ? getRecommendationAdoption(prisma, { days: 7 }) : null,
  ]);
  return serialize({ pending, adoption });
}

/** 5-va'da o'lchovi (haftalik). Direktor bloki sarlavhasida ko'rinadi. */
export async function getRecommendationStats(days = 7): Promise<AdoptionResult> {
  await requireDirector();
  return serialize(await getRecommendationAdoption(prisma, { days }));
}
