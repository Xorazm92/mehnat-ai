import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  OPERATIONAL_TABLES,
  REFERENCE_TABLES,
  REQUIRED_REFERENCE,
  AUDIT_MODEL,
} from "./operationalTables";

/** Prisma model nomi → client delegate kaliti ("OneCConnection" → "oneCConnection"). */
const delegateOf = (modelName: string) => modelName[0].toLowerCase() + modelName.slice(1);

const ALL_MODELS = Prisma.dmmf.datamodel.models.map((m) => delegateOf(m.name));
const OPERATIONAL = OPERATIONAL_TABLES.map((t) => t.model);

describe("operational/reference tasnifi", () => {
  it("har bir operatsion nom haqiqiy Prisma modeli", () => {
    // Reset skripti nomni topa olmasa o'sha jadval jimgina o'chmay qolardi —
    // typo bu yerda qulashi kerak, prodda emas.
    const unknown = OPERATIONAL.filter((m) => !ALL_MODELS.includes(m));
    expect(unknown).toEqual([]);
  });

  it("har bir spravochnik nomi haqiqiy Prisma modeli", () => {
    const unknown = REFERENCE_TABLES.filter((m) => !ALL_MODELS.includes(m));
    expect(unknown).toEqual([]);
    expect(ALL_MODELS).toContain(AUDIT_MODEL);
  });

  it("chelaklar kesishmaydi", () => {
    const both = OPERATIONAL.filter((m) => REFERENCE_TABLES.includes(m));
    expect(both).toEqual([]);
    expect(OPERATIONAL).not.toContain(AUDIT_MODEL);
    expect(REFERENCE_TABLES).not.toContain(AUDIT_MODEL);
  });

  it("ro'yxatlarda dublikat yo'q", () => {
    expect(new Set(OPERATIONAL).size).toBe(OPERATIONAL.length);
    expect(new Set(REFERENCE_TABLES).size).toBe(REFERENCE_TABLES.length);
  });

  it("REQUIRED_REFERENCE spravochnikning bir qismi", () => {
    const stray = REQUIRED_REFERENCE.filter((m) => !REFERENCE_TABLES.includes(m));
    expect(stray).toEqual([]);
  });

  it("HAR BIR Prisma modeli tasniflangan", () => {
    // Bu testning butun maqsadi: schema'ga yangi model qo'shilsa u shu yerda
    // qulaydi. Aks holda model hech kim o'ylamagan holda tozalashdan omon
    // qolib, "toza start" da eski ma'lumot bo'lib qolaveradi.
    const classified = new Set([...OPERATIONAL, ...REFERENCE_TABLES, AUDIT_MODEL]);
    const unclassified = ALL_MODELS.filter((m) => !classified.has(m));
    expect(unclassified).toEqual([]);
    expect(classified.size).toBe(ALL_MODELS.length);
  });
});
