"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";

// Safe field projection — never expose passwordHash to the client.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  avatarColor: true,
  phone: true,
  department: true,
  gender: true,
  birthDate: true,
  education: true,
  hiredAt: true,
  firedAt: true,
  status: true,
  rating: true,
  isActive: true,
  createdAt: true,
} as const;

export async function getUsers() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarColor: true,
        phone: true,
        department: true,
        gender: true,
        birthDate: true,
        education: true,
        hiredAt: true,
        status: true,
        rating: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    })
  );
}

export async function getUserById(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Can only view own profile unless senior
  if (id !== userId && !isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarColor: true,
        phone: true,
        department: true,
        gender: true,
        birthDate: true,
        education: true,
        hiredAt: true,
        firedAt: true,
        status: true,
        rating: true,
        isActive: true,
        createdAt: true,
      },
    })
  );
}

export async function createUser(data: {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  phone?: string;
  department?: string;
  gender?: string;
  avatarColor?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  const passwordHash = await bcrypt.hash(data.password, 12);

  const result = await prisma.user.create({
    data: {
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: data.role,
      phone: data.phone,
      department: data.department,
      gender: data.gender,
      avatarColor: data.avatarColor || `hsl(${Math.floor(Math.random() * 360)}, 60%, 50%)`,
    },
    select: SAFE_USER_SELECT,
  });
  revalidateTag("users", "max");
  return serialize(result);
}

export async function updateUser(
  id: string,
  data: Partial<{
    fullName: string;
    phone: string;
    department: string;
    gender: string;
    birthDate: Date;
    education: string;
    status: string;
    avatarColor: string;
    role: UserRole;
    isActive: boolean;
  }>
) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Only admins can change role/isActive
  if ((data.role || data.isActive !== undefined) && !["super_admin", "admin"].includes(role)) {
    throw new Error("Forbidden");
  }

  // Can only update own profile unless admin
  if (id !== userId && !isSeniorRole(role)) throw new Error("Forbidden");

  const result = await prisma.user.update({
    where: { id },
    data,
    select: SAFE_USER_SELECT,
  });
  revalidateTag("users", "max");
  return serialize(result);
}

export async function changePassword(
  id: string,
  currentPassword: string,
  newPassword: string
) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  if (id !== userId) throw new Error("Forbidden");

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new Error("Noto'g'ri hozirgi parol");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  return serialize(
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: SAFE_USER_SELECT,
    })
  );
}

export async function deactivateUser(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  const result = await prisma.user.update({
    where: { id },
    data: { isActive: false, firedAt: new Date() },
    select: SAFE_USER_SELECT,
  });
  revalidateTag("users", "max");
  return serialize(result);
}

// Admin-initiated password reset (no current-password check, unlike
// changePassword which is self-service). Admin/super_admin only.
export async function resetUserPassword(id: string, newPassword: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!["super_admin", "admin"].includes(session.user.role as string)) {
    throw new Error("Forbidden");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await prisma.user.update({
    where: { id },
    data: { passwordHash },
    select: SAFE_USER_SELECT,
  });
  revalidateTag("users", "max");
  return serialize(result);
}
