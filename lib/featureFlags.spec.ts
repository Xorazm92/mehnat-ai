// Migratsiya bayroqlari — standart qiymatlar va birlashtirish qoidasi.
import { describe, it, expect } from "vitest";
import { mergeFlags, MIGRATION_FLAGS, getMigrationFlags } from "@/lib/featureFlags";

describe("mergeFlags", () => {
  it("qator bo'lmasa — bugungi xulq", () => {
    expect(mergeFlags(null)).toEqual(MIGRATION_FLAGS);
    expect(mergeFlags(undefined)).toEqual(MIGRATION_FLAGS);
  });

  it("qisman override birlashadi, qolgani standart qoladi", () => {
    const f = mergeFlags({ matrix_dual_write: true });
    expect(f.matrix_dual_write).toBe(true);
    expect(f.monthly_report_write).toBe(true);
    expect(f.matrix_read_projection).toBe(false);
  });

  it("noma'lum kalit e'tiborsiz qoldiriladi", () => {
    expect(mergeFlags({ nimadir: true })).toEqual(MIGRATION_FLAGS);
  });

  it("noto'g'ri tip e'tiborsiz qoldiriladi — 'false' satri true qilmaydi", () => {
    expect(mergeFlags({ matrix_dual_write: "true" }).matrix_dual_write).toBe(false);
    expect(mergeFlags({ matrix_dual_write: 1 }).matrix_dual_write).toBe(false);
  });

  it("massiv obyekt emas — standartga qaytadi", () => {
    expect(mergeFlags([1, 2])).toEqual(MIGRATION_FLAGS);
  });
});

describe("getMigrationFlags", () => {
  it("DB yiqilsa migratsiya YOQILMAYDI — standartga qaytadi", async () => {
    // Fail-safe yo'nalishi: nosozlik tufayli yarim ko'chirilgan holatga
    // tushishdan ko'ra, migratsiyani yoqmaslik xavfsizroq.
    const db = { systemSetting: { findUnique: async () => { throw new Error("db down"); } } };
    expect(await getMigrationFlags(db as never)).toEqual(MIGRATION_FLAGS);
  });

  it("saqlangan qiymatni o'qiydi", async () => {
    const db = { systemSetting: { findUnique: async () => ({ value: { import_gateway: true } }) } };
    expect((await getMigrationFlags(db as never)).import_gateway).toBe(true);
  });
});
