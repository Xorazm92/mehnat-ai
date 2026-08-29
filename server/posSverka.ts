"use server";

// =====================================================
// KASSA APPARATI ↔ BANK SVERKASI
// =====================================================
//
// ROL CHEGARASI: vipiska bilan ishlaydigan rollar (super_admin, admin,
// bank_manager) — `requireStatementRole`. Sverka bank tushumini o'qiydi va
// terminalni doiraga kiritish qarorini yozadi; ikkalasi ham vipiska ishining
// davomi, alohida rol ochilmaydi.
//
// PosSettlement — HOSILA jadval. Uni istalgan payt qayta qurish mumkin
// (`rebuildSettlements`), shuning uchun tuzatish kiritilganda ma'lumot
// yo'qolmaydi: klassifikator yangilanadi va qayta ajratiladi.

import { prisma } from "@/lib/prisma";
import { requireStatementRole } from "@/server/guards";
import { revalidatePath } from "next/cache";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { readWorkbook } from "@/lib/bank/readWorkbook";
import type { Workbook } from "@/lib/bank/types";
import { classifySettlement, defaultInScope, settlementSign, CHANNEL_LABELS } from "@/lib/pos/classifySettlement";
import { parseFiscalWorkbook, fmHintFromFileName, matchDeviceByHint } from "@/lib/pos/parseFiscalReport";
import { reconcile, dayKey, type DeviceDay, type SettlementDay } from "@/lib/pos/reconcile";
import { FiscalReportParseError } from "@/lib/pos/types";

/** Kutilgan xato (format tanilmadi, apparat topilmadi) otilmaydi — qaytariladi. */
export type SverkaOutcome<T> = { ok: true; data: T } | { ok: false; error: string };

const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function parseRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T00:00:00Z`) : dayStart(now);
  return { from: f, to: t };
}

// ─────────────────────────────────────────────────────────
// O'QISH
// ─────────────────────────────────────────────────────────

/** Sverka sahifasining butun holati: apparatlar, terminallar, kunlik jadval. */
export async function getSverkaData(input?: { from?: string; to?: string }) {
  await requireStatementRole();
  const { from, to } = parseRange(input?.from, input?.to);
  // Oxirgi kun to'liq kirsin.
  const toExclusive = new Date(to.getTime() + 86_400_000);

  const [devices, terminals, reports, settlements] = await Promise.all([
    prisma.fiscalDevice.findMany({
      where: { isActive: true },
      select: { id: true, fmNumber: true, label: true, inn: true, siteKey: true },
      orderBy: { label: "asc" },
    }),
    prisma.posTerminal.findMany({
      where: { isActive: true },
      select: { id: true, code: true, channel: true, label: true, inScope: true, scopeNote: true, siteKey: true },
      orderBy: [{ inScope: "desc" }, { channel: "asc" }, { code: "asc" }],
    }),
    prisma.fiscalDailyReport.findMany({
      where: { date: { gte: from, lt: toExclusive } },
      select: { deviceId: true, date: true, cardAmount: true, cashAmount: true },
    }),
    prisma.posSettlement.findMany({
      where: { opDate: { gte: from, lt: toExclusive } },
      select: {
        terminalId: true, opDate: true, dateSource: true,
        factAmount: true, grossAmount: true, commissionAmount: true,
        terminal: { select: { inScope: true } },
      },
    }),
  ]);

  const deviceDays: DeviceDay[] = reports.map((r) => ({
    deviceId: r.deviceId,
    date: dayKey(r.date),
    cardAmount: Number(r.cardAmount),
    cashAmount: Number(r.cashAmount),
  }));
  // Doiradan tashqaridagi terminal sverkaga KIRMAYDI — u yerda boshqa savdo
  // liniyasi turadi va uni qo'shish farqni butunlay chalg'itadi.
  const inScope: SettlementDay[] = settlements
    .filter((s) => s.terminal.inScope)
    .map((s) => ({
      terminalId: s.terminalId,
      date: dayKey(s.opDate),
      factAmount: Number(s.factAmount),
      grossAmount: Number(s.grossAmount),
      commissionAmount: Number(s.commissionAmount),
      fromDocumentDate: s.dateSource === "document",
    }));

  const range = { from: dayKey(from), to: dayKey(to) };
  const result = reconcile(deviceDays, inScope, range);

  // Doiradan tashqarida qolgan tushum — ekranda alohida ko'rsatiladi, chunki
  // "bu pul qayerda?" savoli aynan shu yerdan chiqadi.
  const outside = new Map<string, number>();
  for (const s of settlements) {
    if (s.terminal.inScope) continue;
    const k = dayKey(s.opDate);
    if (k < range.from || k > range.to) continue;
    outside.set(s.terminalId, (outside.get(s.terminalId) ?? 0) + Number(s.grossAmount));
  }

  return serialize({
    range,
    devices,
    terminals: terminals.map((t) => ({
      ...t,
      channelLabel: CHANNEL_LABELS[t.channel as keyof typeof CHANNEL_LABELS] ?? t.channel,
      outsideAmount: outside.get(t.id) ?? 0,
    })),
    ...result,
  });
}

// ─────────────────────────────────────────────────────────
// KASSA HISOBOTINI YUKLASH
// ─────────────────────────────────────────────────────────

export interface FiscalUploadResult {
  fileName: string;
  deviceLabel: string | null;
  periodFrom: string;
  periodTo: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsUpdated: number;
  cardTotal: number;
  warnings: string[];
}

/**
 * Kunlik hisobotni yuklaydi.
 *
 * Kun bo'yicha UPSERT: buxgalter kun yopilgach hisobotni qayta olishi odatiy
 * hol va qayta yuklash qator ko'paytirmasligi kerak.
 */
export async function uploadFiscalReport(formData: FormData): Promise<SverkaOutcome<FiscalUploadResult>> {
  const actor = await requireStatementRole();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Fayl yuborilmadi" };
  const deviceIdInput = String(formData.get("deviceId") ?? "").trim() || null;

  let workbook: Workbook;
  try {
    workbook = await readWorkbook(file);
  } catch (e) {
    return { ok: false, error: `Faylni o'qib bo'lmadi: ${(e as Error).message}` };
  }

  const hint = fmHintFromFileName(file.name);
  let parsed;
  try {
    parsed = parseFiscalWorkbook(workbook, hint);
  } catch (e) {
    if (e instanceof FiscalReportParseError) return { ok: false, error: e.message };
    throw e;
  }

  const devices = await prisma.fiscalDevice.findMany({
    where: { isActive: true },
    select: { id: true, fmNumber: true, label: true },
  });

  // Apparat uchta yo'l bilan aniqlanadi: foydalanuvchi tanlagani → faylning
  // o'zidagi FM raqami → fayl nomidagi qisqartma.
  const explicit = deviceIdInput ? devices.find((d) => d.id === deviceIdInput) ?? null : null;
  const byFile = devices.find((d) => parsed.rows.some((r) => r.fmNumber && d.fmNumber === r.fmNumber)) ?? null;
  const byHint = matchDeviceByHint(devices, hint);
  const device = explicit ?? byFile ?? byHint;
  if (!device) {
    const seen = [...new Set(parsed.rows.map((r) => r.fmNumber).filter(Boolean))].join(", ");
    return {
      ok: false,
      error:
        `Kassa apparati aniqlanmadi (fayl: ${file.name}${seen ? `, FM: ${seen}` : ""}). ` +
        "Ro'yxatdan apparatni tanlang yoki avval uni qo'shing.",
    };
  }

  const imp = await prisma.fiscalReportImport.create({
    data: {
      fileName: file.name,
      periodFrom: parsed.periodFrom!,
      periodTo: parsed.periodTo!,
      rowsParsed: parsed.rows.length,
      importedBy: actor.userId,
    },
    select: { id: true },
  });

  let inserted = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const existing = await prisma.fiscalDailyReport.findUnique({
      where: { deviceId_date: { deviceId: device.id, date: row.date } },
      select: { id: true },
    });
    const data = {
      cashAmount: row.cashAmount,
      cardAmount: row.cardAmount,
      totalAmount: row.totalAmount,
      returnedAmount: row.returnedAmount,
      receiptCount: row.receiptCount,
      importId: imp.id,
    };
    if (existing) {
      await prisma.fiscalDailyReport.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.fiscalDailyReport.create({ data: { ...data, deviceId: device.id, date: row.date } });
      inserted++;
    }
  }

  await prisma.fiscalReportImport.update({
    where: { id: imp.id },
    data: { rowsInserted: inserted, rowsUpdated: updated },
  });
  await recordAuditLog({
    userId: actor.userId,
    action: "create",
    tableName: "FiscalReportImport",
    recordId: imp.id,
    newData: { fileName: file.name, device: device.fmNumber, inserted, updated },
  });
  revalidatePath("/kassa/sverka");

  return {
    ok: true,
    data: {
      fileName: file.name,
      deviceLabel: device.label,
      periodFrom: dayKey(parsed.periodFrom!),
      periodTo: dayKey(parsed.periodTo!),
      rowsParsed: parsed.rows.length,
      rowsInserted: inserted,
      rowsUpdated: updated,
      cardTotal: parsed.rows.reduce((s, r) => s + r.cardAmount, 0),
      warnings: parsed.warnings,
    },
  };
}

// ─────────────────────────────────────────────────────────
// VIPISKADAN EKVAYRING TUSHUMINI AJRATISH
// ─────────────────────────────────────────────────────────

export interface RebuildResult {
  scanned: number;
  written: number;
  skipped: number;
  newTerminals: { code: string; channel: string; inScope: boolean }[];
}

/**
 * Vipiska qatorlaridan PosSettlement ni qayta quradi.
 *
 * Bekor qilingan operatsiya MINUS qator bo'lib yoziladi: shunda yig'indi
 * o'z-o'zidan to'g'rilanadi. Uni "chiqarib tashlash" yo'li bilan hisoblash
 * allaqachon xatoga olib kelgan — komissiya storno bilan qo'shilib summa
 * ikki barobar kamayib ketardi.
 */
export async function rebuildSettlements(input?: { from?: string; to?: string }): Promise<SverkaOutcome<RebuildResult>> {
  const actor = await requireStatementRole();
  const { from, to } = parseRange(input?.from, input?.to);
  const toExclusive = new Date(to.getTime() + 86_400_000);

  const txs = await prisma.bankTransaction.findMany({
    where: { valueDate: { gte: from, lt: toExclusive } },
    select: { id: true, accountId: true, valueDate: true, direction: true, amount: true, purpose: true, counterpartyName: true },
    orderBy: { valueDate: "asc" },
  });

  const terminals = new Map<string, { id: string; inScope: boolean }>();
  for (const t of await prisma.posTerminal.findMany({ select: { id: true, code: true, inScope: true } })) {
    terminals.set(t.code, { id: t.id, inScope: t.inScope });
  }

  const created: RebuildResult["newTerminals"] = [];
  let written = 0;
  let skipped = 0;

  for (const tx of txs) {
    const info = classifySettlement(tx.purpose, tx.counterpartyName);
    const sign = settlementSign(tx.direction as "income" | "expense", info);
    if (sign === 0) { skipped++; continue; }

    let terminal = terminals.get(info.terminalCode);
    if (!terminal) {
      const inScope = defaultInScope(info.channel);
      const row = await prisma.posTerminal.create({
        data: {
          code: info.terminalCode,
          channel: info.channel,
          accountId: tx.accountId,
          inScope,
          scopeNote: inScope ? null : "Yangi kanal — doiraga qo'shishni tasdiqlang",
        },
        select: { id: true, inScope: true },
      });
      terminal = { id: row.id, inScope: row.inScope };
      terminals.set(info.terminalCode, terminal);
      created.push({ code: info.terminalCode, channel: info.channel, inScope });
    }

    const fact = sign * Number(tx.amount);
    const gross = info.grossAmount != null ? sign * info.grossAmount : fact;
    const commission = info.commissionAmount != null ? sign * info.commissionAmount : gross - fact;
    const opDate = info.opDate ?? dayStart(tx.valueDate);

    const data = {
      accountId: tx.accountId,
      terminalId: terminal.id,
      opDate,
      dateSource: info.opDate ? "detail" : "document",
      docDate: dayStart(tx.valueDate),
      factAmount: fact,
      grossAmount: gross,
      commissionAmount: commission,
      isReversal: info.isReversal,
    };
    await prisma.posSettlement.upsert({
      where: { transactionId: tx.id },
      create: { transactionId: tx.id, ...data },
      update: data,
    });
    written++;
  }

  await recordAuditLog({
    userId: actor.userId,
    action: "update",
    tableName: "PosSettlement",
    newData: { from: dayKey(from), to: dayKey(to), written, newTerminals: created.length },
  });
  revalidatePath("/kassa/sverka");

  return { ok: true, data: { scanned: txs.length, written, skipped, newTerminals: created } };
}

// ─────────────────────────────────────────────────────────
// SOZLASH
// ─────────────────────────────────────────────────────────

/** Terminalni sverka doirasiga kiritadi yoki chiqaradi. */
export async function setTerminalScope(input: { id: string; inScope: boolean; note?: string }) {
  const actor = await requireStatementRole();
  const before = await prisma.posTerminal.findUnique({
    where: { id: input.id },
    select: { code: true, inScope: true },
  });
  if (!before) throw new Error("Terminal topilmadi");

  await prisma.posTerminal.update({
    where: { id: input.id },
    data: { inScope: input.inScope, scopeNote: input.note?.trim() || null },
  });
  await recordAuditLog({
    userId: actor.userId,
    action: "update",
    tableName: "PosTerminal",
    recordId: input.id,
    oldData: { inScope: before.inScope },
    newData: { code: before.code, inScope: input.inScope, note: input.note ?? null },
  });
  revalidatePath("/kassa/sverka");
  return { ok: true as const };
}

/** Kassa apparatini qo'shadi yoki tahrirlaydi. */
export async function saveFiscalDevice(input: {
  id?: string;
  fmNumber: string;
  label: string;
  inn: string;
  siteKey?: string;
}) {
  const actor = await requireStatementRole();
  const fmNumber = input.fmNumber.trim().toUpperCase();
  const label = input.label.trim();
  const inn = input.inn.trim();
  if (!fmNumber || !label) throw new Error("FM raqami va nom majburiy");

  const data = { fmNumber, label, inn, siteKey: input.siteKey?.trim() || null };
  const row = input.id
    ? await prisma.fiscalDevice.update({ where: { id: input.id }, data, select: { id: true } })
    : await prisma.fiscalDevice.create({ data, select: { id: true } });

  await recordAuditLog({
    userId: actor.userId,
    action: input.id ? "update" : "create",
    tableName: "FiscalDevice",
    recordId: row.id,
    newData: data,
  });
  revalidatePath("/kassa/sverka");
  return serialize({ id: row.id });
}

/** Apparatni ro'yxatdan yashiradi (yozuvlari saqlanadi). */
export async function deactivateFiscalDevice(id: string) {
  const actor = await requireStatementRole();
  await prisma.fiscalDevice.update({ where: { id }, data: { isActive: false } });
  await recordAuditLog({ userId: actor.userId, action: "update", tableName: "FiscalDevice", recordId: id, newData: { isActive: false } });
  revalidatePath("/kassa/sverka");
  return { ok: true as const };
}
