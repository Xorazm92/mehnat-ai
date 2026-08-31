/**
 * TOZALANGAN AVGUST DAFTARI — REGRESSIYA.
 *
 * Bu test 2026-09-01 auditining raqamlarini QOTIRADI. Import quvuri o'zgarsa
 * yoki fayl almashsa, jim ravishda kam ma'lumot yozilishi aynan shu yerda
 * ushlanadi — avvalgi safar (Excel manbasidan) 109 mln kirim va 169 mln
 * chiqim jimgina yo'qolgan edi va buni hech qanday test tutmagan.
 *
 * Fayl repozitoriyda emas (`kassa/` .gitignore da) — bo'lmasa test
 * o'tkazib yuboriladi, chunki CI da ichki moliyaviy fayl yo'q.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseCleanCash,
  cleanCashTotals,
  balanceByRegister,
  resolveRegister,
} from "@/lib/kassaClean";

const FILE = path.resolve(process.cwd(), "kassa/json_clean/cash_transactions.json");
const present = fs.existsSync(FILE);
const load = () => parseCleanCash(JSON.parse(fs.readFileSync(FILE, "utf8")));

describe.skipIf(!present)("avgust daftari (kassa/json_clean)", () => {
  it("audit yig'indilariga tiyinigacha mos keladi", () => {
    const t = cleanCashTotals(load());

    expect(t.rows).toBe(151);
    expect(t.inCount).toBe(120);
    expect(t.outCount).toBe(116);
    expect(t.totalIn).toBeCloseTo(768_968_738.58, 2);
    expect(t.totalOut).toBeCloseTo(767_169_546.62, 2);
    expect(t.totalFee).toBe(237_586);
    expect(t.registers).toHaveLength(31);
  });

  it("31 kassadan 30 tasi nolda yopilgan, ochiq qoldiq faqat Alisherda", () => {
    const balances = balanceByRegister(load());
    const open = [...balances].filter(([, v]) => Math.abs(v) >= 1);

    expect(open).toHaveLength(1);
    expect(open[0][0]).toBe("Alisher");
    expect(open[0][1]).toBeCloseTo(1_561_605.96, 2);
  });

  it("har qatorda sana bor", () => {
    expect(load().every((m) => !Number.isNaN(m.date.getTime()))).toBe(true);
  });
});

describe("resolveRegister", () => {
  const channels = [
    { label: "RADJABOVA GO‘ZAL" },
    { label: "BOBOJONOV ABRORBEK" },
    { label: "ISOMIDDINOV AZIZBEK" },
    { label: "XASANOV AZIZBEK" },
    { label: "ASHUROV ABDUG'ANI" },
  ];

  it("imlo farq qilganda taxmin qilmaydi, alias ishlatadi", () => {
    expect(resolveRegister("Guzaloy", channels)).toEqual([{ label: "RADJABOVA GO‘ZAL" }]);
  });

  it("qisqartmani to'liq ismga bog'laydi", () => {
    expect(resolveRegister("Abror", channels)).toEqual([{ label: "BOBOJONOV ABRORBEK" }]);
  });

  it("bir xil ismli ikki odamni familiya bosh harfi bilan ajratadi", () => {
    expect(resolveRegister("Azizbek I", channels)).toEqual([{ label: "ISOMIDDINOV AZIZBEK" }]);
    expect(resolveRegister("Azizbek X", channels)).toEqual([{ label: "XASANOV AZIZBEK" }]);
  });

  it("apostrof farqini e'tiborsiz qoldiradi", () => {
    expect(resolveRegister("Abdugani", channels)).toEqual([{ label: "ASHUROV ABDUG'ANI" }]);
  });

  it("nomzod topilmasa bo'sh qaytaradi — tanlamaydi", () => {
    expect(resolveRegister("Nomavjud", channels)).toEqual([]);
  });
});
