/**
 * TASDIQ MANIFESTI — biznes qarorining o'qilishi.
 *
 * Eng muhim holat: `null` (javob berilmagan) va `false` (rad etilgan) BIR XIL
 * EMAS. Ikkovi ham qamrovdan tashqarida qoladi, lekin `null` migratsiyani
 * BLOKLAYDI, `false` esa bloklamaydi — chunki `false` qaror, `null` esa
 * qarорsizlik.
 */
import { describe, it, expect } from "vitest";
import {
  parseMappingManifest,
  selectScope,
  blockingReasons,
  type MappingManifest,
} from "@/lib/domains/accounting/mappingManifest";

const row = (o: Partial<MappingManifest["mappings"][number]> & { code: string }) => ({
  name: "Test",
  matrixKey: `${o.code.toLowerCase()}_key`,
  lifecycle: "active" as const,
  confirmed: null,
  confirmedBy: null,
  confirmedAt: null,
  auditAffected: 0,
  auditOpen: 0,
  auditCompanies: 0,
  note: "",
  ...o,
});

const manifest = (...mappings: ReturnType<typeof row>[]): MappingManifest =>
  parseMappingManifest({
    schemaVersion: 1,
    source: "test",
    measuredAt: "2026-09-06",
    howTo: [],
    mappings,
  });

describe("manifest o'qilishi", () => {
  it("takroriy kod → xato", () => {
    expect(() => manifest(row({ code: "A" }), row({ code: "A" }))).toThrow(/takroriy/);
  });

  it("confirmed=true, lekin confirmedBy bo'sh → xato (tasdiq egasiz qolmaydi)", () => {
    expect(() => manifest(row({ code: "A", confirmed: true }))).toThrow(/confirmedBy/);
  });

  it("confirmed=true + confirmedBy → o'qiladi", () => {
    const m = manifest(row({ code: "A", confirmed: true, confirmedBy: "bosh buxgalter" }));
    expect(m.mappings[0].confirmed).toBe(true);
  });

  it("noto'g'ri shakl → jimgina o'tmaydi", () => {
    expect(() => parseMappingManifest({ schemaVersion: 2, mappings: [] })).toThrow();
  });
});

describe("qamrov ajratish", () => {
  const m = manifest(
    row({ code: "TASDIQ", confirmed: true, confirmedBy: "bb" }),
    row({ code: "RAD", confirmed: false }),
    row({ code: "JAVOBSIZ", confirmed: null }),
    row({ code: "DRAFT_TASDIQ", confirmed: true, confirmedBy: "bb", lifecycle: "draft" }),
  );

  it("scope=active → faqat tasdiqlangan active qamrovga kiradi", () => {
    const s = selectScope(m, "active");
    expect(s.included.map((r) => r.code)).toEqual(["TASDIQ"]);
    expect(s.outOfScope.map((r) => r.code)).toEqual(["DRAFT_TASDIQ"]);
  });

  it("scope=draft → faqat draft (draftni active bilan bir tranzaksiyaga qo'ymaymiz)", () => {
    const s = selectScope(m, "draft");
    expect(s.included.map((r) => r.code)).toEqual(["DRAFT_TASDIQ"]);
  });

  it("scope=all → ikkovi ham", () => {
    expect(selectScope(m, "all").included.map((r) => r.code)).toEqual(["TASDIQ", "DRAFT_TASDIQ"]);
  });

  it("rad etilgan hech qachon qamrovga kirmaydi", () => {
    for (const f of ["active", "draft", "all"] as const) {
      expect(selectScope(m, f).included.map((r) => r.code)).not.toContain("RAD");
    }
  });
});

describe("bloklash qoidasi", () => {
  it("javobsiz qator BOR → bloklanadi, tasdiqlanganlari bo'lsa ham", () => {
    const s = selectScope(
      manifest(row({ code: "A", confirmed: true, confirmedBy: "bb" }), row({ code: "B", confirmed: null })),
      "active",
    );
    expect(blockingReasons(s)).toHaveLength(1);
    expect(blockingReasons(s)[0]).toContain("B");
  });

  it("rad etilgan qator bloklamaydi — bu qaror, qarorsizlik emas", () => {
    const s = selectScope(
      manifest(row({ code: "A", confirmed: true, confirmedBy: "bb" }), row({ code: "B", confirmed: false })),
      "active",
    );
    expect(blockingReasons(s)).toHaveLength(0);
  });

  it("hammasi rad etilgan → qamrov bo'sh, bloklanadi", () => {
    const s = selectScope(manifest(row({ code: "A", confirmed: false })), "active");
    expect(blockingReasons(s)[0]).toContain("birorta ham tasdiqlangan moslik yo'q");
  });

  it("hozirgi holat: hammasi javobsiz → bloklangan", () => {
    const s = selectScope(manifest(row({ code: "A" }), row({ code: "B" })), "active");
    expect(blockingReasons(s).length).toBeGreaterThan(0);
  });
});
