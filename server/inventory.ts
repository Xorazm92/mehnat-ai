"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";

// =====================================================
// INVENTORY (Inventar) — texnika/jihozlar
// =====================================================

export async function getInventory() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return prisma.inventoryItem.findMany({
    include: {
      assignedTo: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function upsertInventoryItem(data: {
  id?: string;
  name: string;
  serialNumber?: string;
  status: string;
  condition: string;
  assignedToId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const { id, ...fields } = data;
  const payload = {
    ...fields,
    serialNumber: fields.serialNumber || null,
    assignedToId: fields.assignedToId || null,
  };

  if (id) {
    return prisma.inventoryItem.update({ where: { id }, data: payload });
  }

  return prisma.inventoryItem.create({ data: payload });
}

export async function deleteInventoryItem(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return prisma.inventoryItem.delete({ where: { id } });
}
