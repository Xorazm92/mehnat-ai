import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/evidenceStore";
import { logServerError } from "@/lib/platform/logger";

export const runtime = "nodejs";

/**
 * XODIM AVATARI.
 *
 * Ruxsat `ReportProof` rasmidan SODDAROQ: avatar firma ma'lumoti emas, u
 * tizim ichidagi odamning yuzi va u allaqachon har ro'yxatda ismi bilan
 * ko'rinadi. Shuning uchun tekshiruv bitta — tizimga kirgan bo'lish.
 * Anonim so'rov esa 401 oladi: rasm ochiq internetga chiqmaydi.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarRef: true },
    });
    if (!user?.avatarRef) {
      // 404 — chaqiruvchi uchun bu XATO emas, "rasm yo'q" degani; komponent
      // shu javobda initsial doiraga qaytadi.
      //
      //
      // BU JAVOB KESHLANMAYDI. Bir vaqtlar keshlangan edi — "rasmsiz
      // xodimlar uchun ortiqcha so'rov ketmasin" deb — va natijada rasm
      // yuklagan odam o'z suratini besh daqiqa ko'rmadi: brauzer eski
      // "yo'q" javobini qaytaraverdi. Ortiqcha so'rov muammosi boshqa
      // joyda hal qilingan: chaqiruvchi `avatarRef` orqali rasm
      // yo'qligini BILADI va bu manzilni umuman so'ramaydi.
      return NextResponse.json({ error: "Avatar yo'q" }, { status: 404 });
    }

    const stored = await readStoredFile(user.avatarRef, null);
    if (!stored) return NextResponse.json({ error: "Fayl topilmadi" }, { status: 404 });

    return new NextResponse(new Uint8Array(stored.bytes), {
      status: 200,
      headers: {
        "Content-Type": stored.mime ?? "image/jpeg",
        "Content-Length": stored.bytes.length.toString(),
        // Ombor mazmun-adresli: fayl mazmuni o'zgarsa HAVOLA o'zgaradi,
        // shuning uchun uzoq kesh xavfsiz. `private` — bu shaxsiy rasm,
        // oraliq proksilar saqlamasin.
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    logServerError("api.avatar", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
