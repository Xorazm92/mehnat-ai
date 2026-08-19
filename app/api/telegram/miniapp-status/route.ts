import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInitData } from "@/lib/telegramInitData";
import { diagnoseAccount, diagnoseInitData } from "@/lib/telegramMiniAppDiagnosis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Nega kira olmadim?" — Mini App handshake muvaffaqiyatsiz tugaganda SO'RALADI.
 *
 * Kirishning o'zi bu yerda bo'lmaydi: sessiyani baribir NextAuth "telegram"
 * provider'i beradi. Bu route faqat AYNI o'sha tekshiruvni takrorlab, nima
 * to'xtatganini aytadi — busiz ekranda har doim bitta va ko'pincha noto'g'ri
 * jumla turardi ("botda /start bosing"), va sozlama xatosini hech kim
 * ko'rmasdi.
 *
 * Yangi hisob ochmaydi, sessiya bermaydi, hech narsa yozmaydi — faqat sabab.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let initData = "";
  try {
    const body = (await req.json()) as { initData?: unknown };
    if (typeof body.initData === "string") initData = body.initData;
  } catch {
    // Bo'sh tana ham javob oladi: "Telegram ma'lumot bermadi".
  }

  const verified = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN ?? "");
  const signatureProblem = diagnoseInitData(verified);
  if (signatureProblem) {
    return NextResponse.json({ ok: false, ...signatureProblem });
  }
  if (!verified.ok) {
    // Bu yerga yetib bo'lmaydi (diagnoseInitData har sababni qoplaydi), lekin
    // tip darajasida qisqartiruv kerak.
    return NextResponse.json({ ok: false, code: "not_in_telegram", message: "Kirib bo'lmadi.", admin: false });
  }

  const user = await prisma.user.findUnique({
    where: { telegramUserId: verified.telegramUserId },
    select: { isActive: true },
  });
  const accountProblem = diagnoseAccount(verified.telegramUserId, user);
  if (accountProblem) {
    return NextResponse.json({ ok: false, ...accountProblem });
  }

  // Imzo ham, hisob ham joyida. Demak to'xtatgan narsa sessiya cookie'si —
  // deyarli har doim HTTPS/cookie sozlamasi (AUTH_TRUST_HOST, __Secure-).
  return NextResponse.json({
    ok: true,
    code: "session",
    message:
      "Telegram tekshiruvi o'tdi, lekin sessiya cookie'si o'rnatilmadi. " +
      "Sayt sozlamasini tekshirish kerak (AUTH_URL / AUTH_TRUST_HOST).",
    admin: true,
  });
}
