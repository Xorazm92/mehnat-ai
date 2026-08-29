import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token kerak" }, { status: 400 });

  const company = await prisma.company.findFirst({
    where: { portalToken: token },
    select: {
      id: true,
      name: true,
      inn: true,
    },
  });

  if (!company) return NextResponse.json({ error: "Topilmadi" }, { status: 404 });

  const payments = await prisma.payment.aggregate({
    where: { companyId: company.id, deletedAt: null },
    _sum: { amount: true },
  });

  return NextResponse.json({
    id: company.id,
    name: company.name,
    inn: company.inn,
    balance: Number(payments._sum.amount ?? 0),
  });
}
