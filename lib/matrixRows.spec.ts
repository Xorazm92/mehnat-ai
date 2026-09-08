import { describe, it, expect } from "vitest";
import {
  mergeRows,
  pendingCellKey,
  parsePendingCellKey,
  readRowCells,
  reconcilePendingCells,
  type MatrixColumnKeys,
  type PendingCell,
} from "./matrixRows";

/** Haqiqiy matritsadagi kabi: bo'linadigan ustun + oddiy ustun. */
const columns: MatrixColumnKeys[] = [
  { key: "qqs", payKey: "qqs_tolov" },
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
      { qqs: "+", qqs_tolov: "topshirildi", inps_tolov: "nol" },
      columns,
    );
    expect(cells.qqs).toBe("+");
    expect(cells.qqs_tolov).toBe("topshirildi");
    expect(cells.inps_tolov).toBe("nol");
  });

  it("har bir ustun uchun kalit bo'ladi — hatto yozuv bo'sh bo'lsa ham", () => {
    const cells = readRowCells(undefined, columns);
    expect(Object.keys(cells).sort()).toEqual([
      "didox",
      "inps",
      "inps_tolov",
      "qqs",
      "qqs_tolov",
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
    const key = pendingCellKey("firma-1", "qqs_tolov");
    expect(parsePendingCellKey(key)).toEqual({
      companyId: "firma-1",
      colKey: "qqs_tolov",
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

/**
 * `mergeRows` — sahifa har yangilanganda matritsaning butunlay qayta
 * chizilishini to'xtatadi (havolalarni saqlab qoladi).
 */
describe("mergeRows", () => {
  const build = () => [
    { companyId: "a", qqs: "+", activeServices: ["qqs"] },
    { companyId: "b", qqs: "", activeServices: [] },
  ];

  it("mazmun bir xil bo'lsa ESKI massivning o'zini qaytaradi", () => {
    const prev = build();
    expect(mergeRows(prev, build())).toBe(prev);
  });

  it("o'zgargan qator yangi, qolganlari eski havolada qoladi", () => {
    const prev = build();
    const next = build();
    next[1].qqs = "topshirildi";

    const merged = mergeRows(prev, next);
    expect(merged).not.toBe(prev);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[1]).toBe(next[1]);
  });

  /** `activeServices` massiv — havolasi har renderda yangi bo'ladi. */
  it("massiv katakni MAZMUNI bo'yicha solishtiradi", () => {
    const prev = [{ companyId: "a", activeServices: ["qqs", "inps"] }];
    const next = [{ companyId: "a", activeServices: ["qqs", "inps"] }];
    expect(mergeRows(prev, next)).toBe(prev);

    const changed = [{ companyId: "a", activeServices: ["qqs"] }];
    expect(mergeRows(prev, changed)).not.toBe(prev);
  });

  it("qatorlar soni o'zgarsa yangi massiv qaytadi", () => {
    const prev = build();
    const next = [...build(), { companyId: "c", qqs: "", activeServices: [] }];
    const merged = mergeRows(prev, next);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toBe(prev[0]);
  });
});
