"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
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

  // Firmalar — senior barchasini, boshqalar faqat biriktirilganini ko'radi
  const companyWhere: Prisma.CompanyWhereInput = senior
    ? { isActive: true, OR: searchOr }
    : {
        isActive: true,
        AND: [
          {
            OR: [
              { accountantId: userId },
              { supervisorId: userId },
              { chiefAccountantId: userId },
              { bankClientId: userId },
            ],
          },
          { OR: searchOr },
        ],
      };

  const [companies, staff] = await Promise.all([
    prisma.company.findMany({
      where: companyWhere,
      select: { id: true, name: true, inn: true },
      orderBy: { name: "asc" },
      take: 6,
    }),
    // Xodimlar qidiruvi faqat senior rollar uchun
    senior
      ? prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { pinfl: { contains: q } },
            ],
          },
          select: { id: true, fullName: true, role: true },
          orderBy: { fullName: "asc" },
          take: 6,
        })
      : Promise.resolve([] as { id: string; fullName: string; role: string }[]),
  ]);

  return serialize({
    companies,
    staff: staff.map((s) => ({ id: s.id, name: s.fullName, role: s.role })),
  });
}
