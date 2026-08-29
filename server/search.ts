"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { companyScopeWhere, scopedStaffIds } from "@/lib/platform/access";
import { serialize } from "@/lib/serialize";
import type { Prisma } from "@prisma/client";

export interface SearchResults {
  companies: { id: string; name: string; inn: string }[];
  staff: { id: string; name: string; role: string }[];
}

// Global qidiruv — topbar qidiruv qutisi uchun.
// Firmalar (rolga qarab) + xodimlar (faqat senior rollar) bo'yicha.
export async function globalSearch(term: string): Promise<SearchResults> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const q = (term || "").trim();
  if (q.length < 2) return { companies: [], staff: [] };

  const userId = session.user.id;
  const role = session.user.role as string;
  const senior = isSeniorRole(role);

  // Qidiruv sharti (nom yoki INN)
  const searchOr: Prisma.CompanyWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { inn: { contains: q } },
  ];

  // Firmalar — faqat portfeldagilar (admin uchun companyScopeWhere bo'sh)
  const companyWhere: Prisma.CompanyWhereInput = {
    isActive: true,
    AND: [companyScopeWhere({ id: userId, role }), { OR: searchOr }],
  };

  const [companies, staff] = await Promise.all([
    prisma.company.findMany({
      where: companyWhere,
      select: { id: true, name: true, inn: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    // Xodimlar qidiruvi faqat senior rollar uchun, va faqat PORTFELдаги
    // firmalarga biriktirilgan xodimlar bo'yicha.
    senior
      ? scopedStaffIds(prisma, { id: userId, role }).then((staffIds) =>
        prisma.user.findMany({
          where: {
            isActive: true,
            ...(staffIds ? { id: { in: staffIds } } : {}),
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { pinfl: { contains: q } },
            ],
          },
          select: { id: true, fullName: true, role: true },
          orderBy: { fullName: "asc" },
          take: 6,
        }))
      : Promise.resolve([] as { id: string; fullName: string; role: string }[]),
  ]);

  return serialize({
    companies,
    staff: staff.map((s) => ({ id: s.id, name: s.fullName, role: s.role })),
  });
}
