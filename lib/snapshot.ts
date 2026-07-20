// =====================================================
// FINANCIAL SNAPSHOT CHECKSUM — buzilmaslik kafolati
// =====================================================
// Moliyaviy maydonlar ustidan deterministik sha256. Snapshot yaratishda
// hisoblanadi va saqlanadi; keyin istalgan payt qayta hisoblab solishtirish
// mumkin — DB'ga to'g'ridan-to'g'ri qo'l urilgan bo'lsa checksum mos kelmaydi.
// Sof modul: DB'siz, testda to'g'ridan-to'g'ri tekshiriladi.
import { createHash } from "crypto";

export interface SnapshotFinancials {
  period: string;
  companyId: string | null;
  openingBalance: number;
  closingBalance: number;
  income: number;
  outflow: number;
  payrollTotal: number;
  cashIn: number;
  cashOut: number;
  ledgerBalance: number;
  profit: number;
  loss: number;
  employeeCount: number;
  companyCount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Kanonik satr — maydon tartibi qat'iy, sonlar 2 kasrga normallashtirilgan. */
function canonical(f: SnapshotFinancials): string {
  return [
    f.period,
    f.companyId ?? "",
    r2(f.openingBalance),
    r2(f.closingBalance),
    r2(f.income),
    r2(f.outflow),
    r2(f.payrollTotal),
    r2(f.cashIn),
    r2(f.cashOut),
    r2(f.ledgerBalance),
    r2(f.profit),
    r2(f.loss),
    f.employeeCount,
    f.companyCount,
  ].join("|");
}

export function computeSnapshotChecksum(f: SnapshotFinancials): string {
  return createHash("sha256").update(canonical(f)).digest("hex");
}

/** Saqlangan checksum qayta hisoblanganiga mosmi. */
export function verifySnapshotChecksum(
  f: SnapshotFinancials,
  storedChecksum: string | null | undefined
): boolean {
  if (!storedChecksum) return false;
  return computeSnapshotChecksum(f) === storedChecksum;
}
