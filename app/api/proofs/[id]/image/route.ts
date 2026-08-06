import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/platform/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission } from "@/lib/platform/access";

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

    // Base64 parsing
    let contentType = "image/jpeg";
    let buffer: Buffer;

    const match = proof.imageData.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
    if (match) {
      contentType = match[1];
      buffer = Buffer.from(match[2], "base64");
    } else if (proof.imageData.startsWith("data:")) {
      const commaIdx = proof.imageData.indexOf(",");
      const mime = proof.imageData.substring(5, proof.imageData.indexOf(";"));
      if (mime) contentType = mime;
      const rawBase64 = proof.imageData.substring(commaIdx + 1);
      buffer = Buffer.from(rawBase64, "base64");
    } else {
      buffer = Buffer.from(proof.imageData, "utf-8");
    }

    const safeColKey = proof.colKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeCompanyName = proof.company.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `skrinshot_${safeCompanyName}_${safeColKey}_${proof.period}.jpg`;

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
