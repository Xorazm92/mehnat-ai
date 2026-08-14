"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { updateTag } from "next/cache";
import { serialize } from "@/lib/serialize";
import {
  BASE_REPORT_COLUMNS,
  applyColumnConfig,
  type OperationColumnConfig,
  type OperationColumnRow,
  type ReportColumn,
} from "@/lib/reportColumns";

const SETTING_KEY = "operationColumns";

async function readConfig(): Promise<OperationColumnConfig[] | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row || !Array.isArray(row.value)) return null;
  return row.value as unknown as OperationColumnConfig[];
}

/**
 * Joriy amaldagi (config qo'llangan) ustunlar ro'yxati — OperationModule uchun.
 * Har qanday autentifikatsiyalangan foydalanuvchi o'qiy oladi.
 */
export async function getEffectiveReportColumns(): Promise<ReportColumn[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const config = await readConfig();
  return serialize(applyColumnConfig(BASE_REPORT_COLUMNS, config));
}

/**
 * Admin editor uchun — BARCHA baza ustunlari (o'chirilganlar ham) joriy
 * sozlama bilan birga, tartib bo'yicha. Faqat admin.
 */
export async function getOperationColumnsForAdmin(): Promise<OperationColumnRow[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");

  const config = await readConfig();
  const byKey = new Map((config ?? []).map((c) => [c.key, c]));

  const rows = BASE_REPORT_COLUMNS.map((col, i) => {
    const c = byKey.get(col.key);
    return {
      key: col.key,
      label: c?.label?.trim() ? c.label.trim() : col.label,
      baseLabel: col.label,
      short: col.short,
      group: c?.group?.trim() ? c.group.trim() : col.group,
      enabled: c?.enabled !== false,
      order: c?.order ?? i,
      isSplit: !!col.isSplit,
    };
  });
  rows.sort((a, b) => a.order - b.order);
  return serialize(rows);
}

/**
 * Admin sozlamani saqlaydi. Faqat mavjud baza kalitlari qabul qilinadi
 * (yangi kalit qo'shib bo'lmaydi — har kalit DB ustuniga bog'langan).
 */
export async function saveOperationColumns(rows: OperationColumnRow[]) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");

  const validKeys = new Set(BASE_REPORT_COLUMNS.map((c) => c.key));
  const config: OperationColumnConfig[] = rows
    .filter((r) => validKeys.has(r.key))
    .map((r, i) => ({
      key: r.key,
      enabled: r.enabled,
      order: i, // ro'yxatdagi joriy tartib
      label: r.label?.trim() || undefined,
      group: r.group?.trim() || undefined,
    }));

  // Kamida bitta ustun yoqilgan bo'lishi shart — bo'sh matritsani oldini olamiz
  if (!config.some((c) => c.enabled)) {
    throw new Error("Kamida bitta ustun yoqilgan bo'lishi kerak");
  }

  const result = await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: config as unknown as object, updatedBy: session.user.id },
    create: { key: SETTING_KEY, value: config as unknown as object, updatedBy: session.user.id },
  });
  updateTag("system-settings");
  return serialize(result);
}
