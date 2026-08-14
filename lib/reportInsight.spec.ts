import { describe, it, expect } from "vitest";
import {
  INSIGHT_DIMENSIONS,
  buildInsight,
  pendingAsText,
  type InsightSourceRow,
} from "./reportInsight";

const row = (over: Partial<InsightSourceRow> & { cells: unknown[] }): InsightSourceRow => ({
  companyId: over.name ?? "c",
  name: "FIRMA",
  inn: "123",
  accountant: "Mirahmad",
  supervisor: "Go'zaloy",
  chief: "Yorqinoy",
  bank: "Ruslan",
  department: "Yorqinoy bo'limi",
  ...over,
});

describe("buildInsight — bitta hisobot kesimi", () => {
  it("foiz faqat TALAB QILINGAN kataklardan hisoblanadi", () => {
    const { overall } = buildInsight(
      [
        row({ name: "A", cells: ["+"] }),
        row({ name: "B", cells: ["-"] }),
        // Bo'sh katak — bu firmada hisobot shart emas, maxrajga kirmaydi.
        row({ name: "C", cells: [""] }),
      ],
      "accountant"
    );
    expect(overall.tally.required).toBe(2);
    expect(overall.percent).toBe(50);
    expect(overall.companies).toBe(3);
  });

  it("nol hisobot topshirilgan deb sanaladi", () => {
    const { overall } = buildInsight([row({ cells: ["nol"] })], "accountant");
    expect(overall.percent).toBe(100);
    expect(overall.pending).toHaveLength(0);
  });

  it("topshirmaganlar ro'yxati ish qolgan firmalardan iborat", () => {
    const { overall } = buildInsight(
      [
        row({ name: "YAXSHI", cells: ["+"] }),
        row({ name: "KECHIKKAN", cells: ["-"] }),
        row({ name: "KARTOTEKA", cells: ["kartoteka"] }),
        row({ name: "SHART EMAS", cells: [""] }),
      ],
      "accountant"
    );
    expect(overall.pending.map((p) => p.name)).toEqual(["KECHIKKAN", "KARTOTEKA"]);
  });

  it("topshirmaganlar jiddiylik bo'yicha tartiblanadi", () => {
    // Topshirilmagan (-) kartoteka va izohdan oldin turadi.
    const { overall } = buildInsight(
      [
        row({ name: "IZOH", cells: ["bank javob bermadi"] }),
        row({ name: "KARTOTEKA", cells: ["kartoteka"] }),
        row({ name: "MINUS", cells: ["-"] }),
      ],
      "accountant"
    );
    expect(overall.pending.map((p) => p.name)).toEqual(["MINUS", "KARTOTEKA", "IZOH"]);
  });

  it("hech narsa talab qilinmasa foiz 0 (nolga bo'linish yo'q)", () => {
    const { overall } = buildInsight([row({ cells: [""] })], "accountant");
    expect(overall.percent).toBe(0);
    expect(overall.tally.required).toBe(0);
  });
});

describe("buildInsight — guruhlash", () => {
  const rows = [
    row({ name: "A", supervisor: "Go'zaloy", cells: ["+"] }),
    row({ name: "B", supervisor: "Go'zaloy", cells: ["-"] }),
    row({ name: "C", supervisor: "Muslimbek", cells: ["+"] }),
    row({ name: "D", supervisor: "Muslimbek", cells: ["+"] }),
  ];

  it("nazoratchi kesimida har guruh o'z foizini oladi", () => {
    const { groups } = buildInsight(rows, "supervisor");
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.percent]));
    expect(byLabel["Go'zaloy"]).toBe(50);
    expect(byLabel["Muslimbek"]).toBe(100);
  });

  it("eng ko'p ish qolgan guruh tepada", () => {
    const { groups } = buildInsight(rows, "supervisor");
    expect(groups[0].label).toBe("Go'zaloy");
  });

  it("firma kesimida har qator alohida guruh", () => {
    const { groups } = buildInsight(rows, "company");
    expect(groups).toHaveLength(4);
    expect(groups[0].label).toBe("B"); // yagona ishi qolgani
  });

  it("mas'uli yo'q qator alohida guruhga tushadi, yo'qolmaydi", () => {
    const { groups, overall } = buildInsight(
      [row({ name: "A", supervisor: "—", cells: ["-"] }), row({ name: "B", supervisor: "", cells: ["-"] })],
      "supervisor"
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Nazoratchisiz");
    expect(overall.companies).toBe(2);
  });

  it("guruhlar yig'indisi umumiy hisobga teng", () => {
    const { groups, overall } = buildInsight(rows, "supervisor");
    const sum = groups.reduce((n, g) => n + g.tally.required, 0);
    expect(sum).toBe(overall.tally.required);
    expect(groups.reduce((n, g) => n + g.companies, 0)).toBe(overall.companies);
  });
});

describe("buildInsight — bir nechta ustun", () => {
  it("barcha hisobotlar bo'yicha firma foizi", () => {
    // "Korxonamning foizi" — bitta firma, hamma hisobot.
    const { groups } = buildInsight(
      [row({ name: "MENING FIRMAM", cells: ["+", "+", "-", "", "nol"] })],
      "company"
    );
    // Talab qilingan 4 ta (bo'sh katak hisobga kirmaydi), yopilgani 3 ta.
    expect(groups[0].tally.required).toBe(4);
    expect(groups[0].percent).toBe(75);
    expect(groups[0].pending[0].tally.outstanding).toBe(1);
  });

  it("qatorning 'worst' belgisi eng jiddiy ochiq muammo", () => {
    const { overall } = buildInsight(
      [row({ cells: ["+", "kartoteka", "-"] })],
      "company"
    );
    expect(overall.pending[0].worst).toBe("failed");
  });
});

describe("pendingAsText", () => {
  it("bo'sh ro'yxat uchun aniq xabar", () => {
    expect(pendingAsText("INPS", [])).toContain("hammasi topshirilgan");
  });

  it("raqamlangan ro'yxat va sabab", () => {
    const { overall } = buildInsight(
      [row({ name: "VENU", accountant: "Mirahmad", cells: ["-"] })],
      "company"
    );
    const text = pendingAsText("INPS — Go'zaloy", overall.pending);
    expect(text).toContain("INPS — Go'zaloy — 1 ta");
    expect(text).toContain("1. VENU — Mirahmad (Topshirilmagan)");
  });
});

describe("INSIGHT_DIMENSIONS", () => {
  it("har bir kesim yagona va bo'sh yorlig'i bor", () => {
    const values = new Set(INSIGHT_DIMENSIONS.map((d) => d.value));
    expect(values.size).toBe(INSIGHT_DIMENSIONS.length);
    for (const d of INSIGHT_DIMENSIONS) expect(d.empty).toBeTruthy();
  });
});
