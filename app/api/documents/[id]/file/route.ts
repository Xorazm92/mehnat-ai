import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission } from "@/lib/platform/access";
import { readStoredFile } from "@/lib/evidenceStore";

export const runtime = "nodejs";

/**
 * Hujjat faylini berish — `/api/proofs/[id]/file` ning egizagi.
 *
 * Huquq HAR SO'ROVDA qayta tekshiriladi: havola brauzer tarixida qolishi
 * mumkin, ya'ni id ni bilish o'z-o'zidan ruxsat bermaydi. Hujjat arxivida
 * shartnoma va pasport nusxasi turadi — bu tekshiruvni yumshatib bo'lmaydi.
 *
 * Har doim `attachment`: PDF/Word ni inline berish keraksiz xavf tug'diradi.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        companyId: true,
        storageRef: true,
        fileData: true,
        fileName: true,
        fileType: true,
        deletedAt: true,
      },
    });

    if (!doc || doc.deletedAt) {
      return NextResponse.json({ error: "Hujjat topilmadi" }, { status: 404 });
    }

    try {
      await assertCompanyPermission(
        prisma,
        { id: session.user.id as string, role: session.user.role as string },
        doc.companyId,
        "company:read"
      );
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stored = await readStoredFile(doc.storageRef, doc.fileData);
    if (!stored) return NextResponse.json({ error: "Fayl buzilgan" }, { status: 422 });
    const buffer = stored.bytes;

    // Nom foydalanuvchidan keladi — sarlavhaga qo'yishdan oldin tozalanadi,
    // aks holda tirnoq yoki yangi qator sarlavhani buzardi.
    const safe = (doc.fileName || `hujjat_${id}`)
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 120);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": doc.fileType || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": `attachment; filename="${safe}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
