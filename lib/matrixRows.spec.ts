import { describe, it, expect } from "vitest";
import {
  pendingCellKey,
  parsePendingCellKey,
  readRowCells,
  reconcilePendingCells,
  type MatrixColumnKeys,
  type PendingCell,
} from "./matrixRows";

/** Haqiqiy matritsadagi kabi: bo'linadigan ustun + oddiy ustun. */
const columns: MatrixColumnKeys[] = [
  { key: "aylanma_qqs", payKey: "aylanma_qqs_tolov" },
  { key: "inps", payKey: "inps_tolov" },
  { key: "didox" },
];

describe("readRowCells", () => {
  it("oddiy ustunni o'qiydi", () => {
    expect(readRowCells({ didox: "+" }, columns).didox).toBe("+");
  });

  /**
   * ASOSIY REGRESSIYA: to'lov ustunlari (AQt, DSt, INt, FSt) bazaga yozilardi,
   * lekin jadvalga qaytmasdi — qator quruvchisi faqat `col.key` ni o'qigan edi.
   * Buxgalter buni "to'lovni belgiladim, o'chib ketdi" deb ko'rardi.
   */
  it("bo'linadigan ustunning TO'LOV yarmini ham o'qiydi", () => {
    const cells = readRowCells(
      { aylanma_qqs: "+", aylanma_qqs_tolov: "topshirildi", inps_tolov: "nol" },
      columns,
    );
    expect(cells.aylanma_qqs).toBe("+");
    expect(cells.aylanma_qqs_tolov).toBe("topshirildi");
    expect(cells.inps_tolov).toBe("nol");
  });

  it("har bir ustun uchun kalit bo'ladi — hatto yozuv bo'sh bo'lsa ham", () => {
    const cells = readRowCells(undefined, columns);
    expect(Object.keys(cells).sort()).toEqual([
      "aylanma_qqs",
      "aylanma_qqs_tolov",
      "didox",
      "inps",
      "inps_tolov",
    ]);
    expect(Object.values(cells).every((v) => v === "")).toBe(true);
  });

  it("null/undefined — bo'sh satr ('shart emas' holati)", () => {
    const cells = readRowCells({ didox: null, inps: undefined }, columns);
    expect(cells.didox).toBe("");
    expect(cells.inps).toBe("");
  });

  it("erkin matnli izoh o'zgarmasdan o'tadi", () => {
    expect(readRowCells({ didox: "bank javob bermadi" }, columns).didox).toBe(
      "bank javob bermadi",
    );
  });
});

describe("pending katak kaliti", () => {
  it("qurish va ajratish teng", () => {
    const key = pendingCellKey("firma-1", "aylanma_qqs_tolov");
    expect(parsePendingCellKey(key)).toEqual({
      companyId: "firma-1",
      colKey: "aylanma_qqs_tolov",
    });
  });
});

describe("reconcilePendingCells", () => {
  const TTL = 60_000;
  const NOW = 1_000_000;
  const entry = (value: string, ageMs = 0): PendingCell => ({ value, at: NOW - ageMs });

  const noServerData = () => "";

  it("server hali yetmagan qiymat ekranda ushlanadi", () => {
    const pending = new Map([[pendingCellKey("c1", "didox"), entry("izoh matni")]]);
    const { overrides, settled } = reconcilePendingCells(pending, noServerData, NOW, TTL);

    expect(settled).toEqual([]);
    expect(overrides.get("c1")?.get("didox")).toBe("izoh matni");
  });

  it("server qiymatga yetgach kuzatuv tugaydi", () => {
    const pending = new Map([[pendingCellKey("c1", "didox"), entry("nol")]]);
    const { overrides, settled } = reconcilePendingCells(
      pending,
      (companyId, colKey) => (companyId === "c1" && colKey === "didox" ? "nol" : ""),
      NOW,
      TTL,
    );

    expect(settled).toEqual([pendingCellKey("c1", "didox")]);
    expect(overrides.size).toBe(0);
  });

  /** Aynan shu holat "yozdim — o'chdi" bo'lib ko'rinardi. */
  it("kechikkan ESKI javob yangi qiymatni bosib ketmaydi", () => {
    const pending = new Map([[pendingCellKey("c1", "inps_tolov"), entry("topshirildi")]]);
    // Kesh eski qiymatni qaytardi — buxgalter yozganidan oldingi holat.
    const { overrides, settled } = reconcilePendingCells(pending, () => "-", NOW, TTL);

    expect(settled).toEqual([]);
    expect(overrides.get("c1")?.get("inps_tolov")).toBe("topshirildi");
  });

  it("muddati o'tgan yozuv tashlanadi (server jim qolsa)", () => {
    const pending = new Map([
      [pendingCellKey("c1", "didox"), entry("izoh", TTL + 1)],
    ]);
    const { overrides, settled } = reconcilePendingCells(pending, noServerData, NOW, TTL);

    expect(settled).toEqual([pendingCellKey("c1", "didox")]);
    expect(overrides.size).toBe(0);
  });

  it("katakni tozalash ham kuzatiladi (bo'sh qiymat)", () => {
    const pending = new Map([[pendingCellKey("c1", "didox"), entry("")]]);
    // Serverda hali eski qiymat turibdi — tozalash ekranda saqlanishi kerak.
    const { overrides, settled } = reconcilePendingCells(pending, () => "+", NOW, TTL);

    expect(settled).toEqual([]);
    expect(overrides.get("c1")?.get("didox")).toBe("");
  });

  it("bir firmada bir nechta katak birga kuzatiladi", () => {
    const pending = new Map([
      [pendingCellKey("c1", "didox"), entry("a")],
      [pendingCellKey("c1", "inps"), entry("b")],
      [pendingCellKey("c2", "didox"), entry("c")],
    ]);
    const { overrides } = reconcilePendingCells(pending, noServerData, NOW, TTL);

    expect(overrides.get("c1")?.size).toBe(2);
    expect(overrides.get("c2")?.get("didox")).toBe("c");
  });

  it("kirish xaritasini O'ZGARTIRMAYDI (sof funksiya)", () => {
    const pending = new Map([[pendingCellKey("c1", "didox"), entry("nol")]]);
    reconcilePendingCells(pending, () => "nol", NOW, TTL);
    expect(pending.size).toBe(1);
  });
});
