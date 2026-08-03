import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { BASE_REPORT_COLUMNS } from "./reportColumns";
import { FIELD_TO_DB_COLUMN } from "./operationTemplates";

/**
 * MATRITSA KALITI → DB USTUNI ZANJIRI
 *
 * Amallar matritsasi kalitlari `snake_case` ("pul_oqimlari"), `MonthlyReport`
 * ustunlari esa `camelCase` ("pulOqimlari"). Ular FAQAT `FIELD_TO_DB_COLUMN`
 * orqali bog'lanadi, ya'ni zanjirning istalgan bo'g'ini uzilsa ish buziladi —
 * va aynan qaysi ustunda ekani foydalanuvchi bosib ko'rmaguncha bilinmaydi.
 *
 * Ikki haqiqiy nosozlik shu yerdan chiqqan:
 *   1. `clearColumnForPeriod` kalitni mapping'siz ishlatgan → nomi tasodifan
 *      bir xil bo'lgan ustunlar (didox, xatlar, inps) tozalangan, qolganlari
 *      "Unknown argument" bilan yiqilgan;
 *   2. `ekologiya` schema'ga qo'shilib migratsiyasiz qolgan → matritsaning
 *      HAMMA kataki saqlanmay qolgan.
 */

const monthlyReportFields = new Set(
  Prisma.dmmf.datamodel.models.find((m) => m.name === "MonthlyReport")!.fields.map((f) => f.name),
);

const matrixKeys = (BASE_REPORT_COLUMNS as ReadonlyArray<{ key: string }>).map((c) => c.key);
const mapping = FIELD_TO_DB_COLUMN as Record<string, string>;

describe("amallar matritsasi ustunlari", () => {
  it("har bir matritsa ustunida DB mappingi bor", () => {
    const missing = matrixKeys.filter((k) => !mapping[k]);
    expect(missing).toEqual([]);
  });

  it("har bir mapping haqiqiy MonthlyReport ustuniga tegishli", () => {
    // Aynan shu tekshiruv `ekologiya` schema'ga qo'shilganda uni migratsiyasiz
    // qoldirishga yo'l qo'ymaydi: DMMF'da maydon bo'lmasa test qulaydi.
    const broken = matrixKeys
      .map((k) => [k, mapping[k]] as const)
      .filter(([, col]) => col && !monthlyReportFields.has(col));
    expect(broken).toEqual([]);
  });

  it("ikki ustun bitta DB maydoniga yozmaydi", () => {
    // Aks holda bir ustunni tozalash ikkinchisini ham o'chirib yuborardi.
    const cols = matrixKeys.map((k) => mapping[k]).filter(Boolean);
    expect(new Set(cols).size).toBe(cols.length);
  });

  it("matritsa kalitlari takrorlanmaydi", () => {
    expect(new Set(matrixKeys).size).toBe(matrixKeys.length);
  });
});
