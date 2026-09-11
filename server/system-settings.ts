"use server";

import { requireAdmin } from "@/server/guards";
import { prisma } from "@/lib/prisma";
import { updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import {
  SYSTEM_SETTING_DEFAULTS,
  type SystemSettings,
} from "@/lib/admin/system-settings-config";

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
  const actor = await requireAdmin();
  const result = await prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedBy: actor.userId },
    create: { key, value, updatedBy: actor.userId },
  });
  updateTag("system-settings");
  return serialize(result);
}
