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
  pinfl: true,
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

// Sanani xavfsiz Date'ga aylantirish (bo'sh satr → undefined)
function toDate(v: string | Date | undefined | null): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

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
        pinfl: true,
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
      select: SAFE_USER_SELECT,
    })
  );
}

// Joriy foydalanuvchining o'z profili (har qanday autentifikatsiyalangan xodim ko'ra oladi)
export async function getMyProfile() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return serialize(
    await prisma.user.findUnique({
      where: { id: session.user.id },
      select: SAFE_USER_SELECT,
    })
  );
}

export async function createUser(data: {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  phone?: string;
  pinfl?: string;
  department?: string;
  gender?: string;
  birthDate?: string | Date;
  education?: string;
  hiredAt?: string | Date;
  status?: string;
  avatarColor?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  if (!data.email?.trim()) throw new Error("Email (login) kiritilishi shart");
  if (!data.password || data.password.length < 8) {
    throw new Error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
  }

  // Email band emasligini tekshirish — ochiq xato xabari bilan
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("Bu email (login) allaqachon band");

  const passwordHash = await bcrypt.hash(data.password, 12);

  const result = await prisma.user.create({
    data: {
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: data.role,
      phone: data.phone || null,
      pinfl: data.pinfl || null,
      department: data.department || null,
      gender: data.gender || null,
      birthDate: toDate(data.birthDate) ?? null,
      education: data.education || null,
      hiredAt: toDate(data.hiredAt) ?? new Date(),
      status: data.status || "active",
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
    pinfl: string;
    department: string;
    gender: string;
    birthDate: string | Date;
    education: string;
    hiredAt: string | Date;
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

  // Can only update own profile unless senior
  if (id !== userId && !isSeniorRole(role)) throw new Error("Forbidden");

  // Sana maydonlarini xavfsiz Date'ga aylantirish
  const { birthDate, hiredAt, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (birthDate !== undefined) updateData.birthDate = toDate(birthDate) ?? null;
  if (hiredAt !== undefined) updateData.hiredAt = toDate(hiredAt) ?? null;

  const result = await prisma.user.update({
    where: { id },
    data: updateData,
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

  if (!newPassword || newPassword.length < 8) {
    throw new Error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
  }

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
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
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
