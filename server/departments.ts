"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { serialize } from "@/lib/serialize";

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session;
}

export async function getDepartments() {
  await requireAdmin();
  return serialize(
    await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        chiefAccountant: { select: { id: true, fullName: true, email: true } },
        _count: { select: { companies: true } },
      },
    })
  );
}

export async function createDepartment(data: {
  name: string;
  chiefAccountantId?: string | null;
}) {
  await requireAdmin();
  const name = data.name?.trim();
  if (!name) throw new Error("Bo'lim nomi kiritilishi shart");

  const result = await prisma.department.create({
    data: {
      name,
      chiefAccountantId: data.chiefAccountantId || null,
      isActive: true,
    },
  });
  revalidateTag("departments", "max");
  return serialize(result);
}

export async function updateDepartment(
  id: string,
  data: Partial<{ name: string; chiefAccountantId: string | null; isActive: boolean }>
) {
  await requireAdmin();
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error("Bo'lim nomi bo'sh bo'lishi mumkin emas");
  }
  const result = await prisma.department.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.chiefAccountantId !== undefined
        ? { chiefAccountantId: data.chiefAccountantId || null }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  revalidateTag("departments", "max");
  return serialize(result);
}

export async function deactivateDepartment(id: string) {
  await requireAdmin();
  const result = await prisma.department.update({
    where: { id },
    data: { isActive: false },
  });
  revalidateTag("departments", "max");
  return serialize(result);
}
