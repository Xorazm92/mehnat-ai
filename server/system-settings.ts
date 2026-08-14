"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import {
  SYSTEM_SETTING_DEFAULTS,
  type SystemSettings,
} from "@/lib/admin/system-settings-config";

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session;
}

/** Returns all settings merged over defaults, so callers always get a full object. */
export async function getSystemSettings(): Promise<SystemSettings> {
  await requireAdmin();
  const rows = await prisma.systemSetting.findMany();
  const merged: Record<string, unknown> = {
    ...SYSTEM_SETTING_DEFAULTS,
    features: { ...SYSTEM_SETTING_DEFAULTS.features },
  };
  for (const row of rows) {
    if (row.key === "features" && row.value && typeof row.value === "object") {
      merged.features = {
        ...(merged.features as object),
        ...(row.value as Record<string, boolean>),
      };
    } else {
      merged[row.key] = row.value;
    }
  }
  return serialize(merged) as SystemSettings;
}

export async function upsertSystemSetting(key: string, value: Prisma.InputJsonValue) {
  const session = await requireAdmin();
  const result = await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedBy: session.user.id },
    create: { key, value, updatedBy: session.user.id },
  });
  updateTag("system-settings");
  return serialize(result);
}
