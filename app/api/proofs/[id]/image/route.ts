import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/platform/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission } from "@/lib/platform/access";
import { readStoredFile } from "@/lib/evidenceStore";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const role = session.user.role as string;

    const proof = await prisma.reportProof.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!proof) {
      return NextResponse.json({ error: "Dalil topilmadi" }, { status: 404 });
    }

    // Obyekt-scope: dalil portfeldagi firmaga tegishli bo'lishi shart
    try {
      await assertCompanyPermission(prisma, { id: userId, role }, proof.companyId, "proof:read");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isDownload = req.nextUrl.searchParams.get("download") === "1";
    // `n=2` — ikki ekranli ustunlarning IKKINCHI skrinshoti (`imageRef2`).
    // Uning eski base64 juftligi yo'q, shuning uchun ikkinchi yo'l `null`.
    const isSecond = req.nextUrl.searchParams.get("n") === "2";

    const stored = isSecond
      ? await readStoredFile(proof.imageRef2, null)
      : await readStoredFile(proof.imageRef, proof.imageData);
    if (!stored) {
      return NextResponse.json({ error: "Skrinshot topilmadi" }, { status: 404 });
    }
    const contentType = stored.mime ?? "image/jpeg";
    const buffer = stored.bytes;

    const safeColKey = proof.colKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeCompanyName = proof.company.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `skrinshot${isSecond ? "2" : ""}_${safeCompanyName}_${safeColKey}_${proof.period}.jpg`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
        "Content-Disposition": isDownload ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    logServerError("api.proofs.image", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
