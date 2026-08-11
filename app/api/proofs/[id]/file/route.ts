import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission } from "@/lib/access";

export const runtime = "nodejs";

/**
 * Hisobot faylini berish — skrinshot yo'lining (`../image`) egizagi.
 *
 * Huquq AYNAN o'sha: dalil portfeldagi firmaga tegishli bo'lishi shart. Fayl
 * skrinshotdan ko'ra ko'proq ma'lumot ochadi (hisobotning o'zi), shuning uchun
 * bu yerda tekshiruvni yumshatib bo'lmaydi.
 *
 * Har doim `attachment`: hisobot fayli brauzerda ochilishi shart emas, va
 * PDF/Excel ni inline berish keraksiz xavf tug'diradi.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const proof = await prisma.reportProof.findUnique({
      where: { id },
      select: {
        companyId: true,
        colKey: true,
        period: true,
        fileData: true,
        fileName: true,
        fileType: true,
        company: { select: { name: true } },
      },
    });

    if (!proof) {
      return NextResponse.json({ error: "Dalil topilmadi" }, { status: 404 });
    }
    if (!proof.fileData) {
      return NextResponse.json({ error: "Bu dalilga fayl biriktirilmagan" }, { status: 404 });
    }

    try {
      await assertCompanyPermission(
        prisma,
        { id: session.user.id as string, role: session.user.role as string },
        proof.companyId,
        "proof:read",
      );
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comma = proof.fileData.indexOf(",");
    if (comma < 0) {
      return NextResponse.json({ error: "Fayl buzilgan" }, { status: 422 });
    }
    const buffer = Buffer.from(proof.fileData.slice(comma + 1), "base64");

    // Nom bazadan keladi (foydalanuvchi bergan) — sarlavhaga qo'yishdan oldin
    // tozalanadi, aks holda tirnoq yoki yangi qator sarlavhani buzardi.
    const safe = (proof.fileName || `hisobot_${proof.colKey}_${proof.period}`)
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 120);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": proof.fileType || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `attachment; filename="${safe}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
