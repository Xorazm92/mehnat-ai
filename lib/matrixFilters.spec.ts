import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  FILTER_URL_KEYS,
  COL_STATUS_OPTIONS,
  activeChips,
  activeFilterCount,
  matchesColStatus,
  matchesFacets,
  matchesSearch,
  parseFilters,
  regimeLabel,
  type MatrixFilters,
} from "./matrixFilters";

const facets = (over: Partial<Parameters<typeof matchesFacets>[0]> = {}) => ({
  accountant: "Mirahmad",
  supervisor: "Go'zaloy",
  chief: "Yorqinoy",
  bank: "Ruslan",
  regime: "vat",
  department: "Yorqinoy bo'limi",
  ...over,
});

const filters = (over: Partial<MatrixFilters> = {}): MatrixFilters => ({ ...EMPTY_FILTERS, ...over });

describe("matchesColStatus", () => {
  it("'any' hamma katakni o'tkazadi", () => {
    for (const v of ["", "+", "kartoteka", "nol", "izoh"]) {
      expect(matchesColStatus(v, "any")).toBe(true);
    }
  });

  it("'outstanding' — belgilangan, lekin yopilmagan", () => {
    expect(matchesColStatus("-", "outstanding")).toBe(true);
    expect(matchesColStatus("kartoteka", "outstanding")).toBe(true);
    expect(matchesColStatus("bank javob bermadi", "outstanding")).toBe(true);
    expect(matchesColStatus("+", "outstanding")).toBe(false);
    // Bo'sh katak "qolgan ish" EMAS — u "shart emas" degani.
    expect(matchesColStatus("", "outstanding")).toBe(false);
    expect(matchesColStatus("0", "outstanding")).toBe(false);
  });

  it("'settled' — nol hisobot ham yopilgan deb sanaladi", () => {
    expect(matchesColStatus("+", "settled")).toBe(true);
    expect(matchesColStatus("topshirildi", "settled")).toBe(true);
    expect(matchesColStatus("nol", "settled")).toBe(true);
    expect(matchesColStatus("kartoteka", "settled")).toBe(false);
  });

  it("aniq holat bo'yicha", () => {
    expect(matchesColStatus("kartoteka", "blocked")).toBe(true);
    expect(matchesColStatus("kartoteka", "failed")).toBe(false);
    expect(matchesColStatus("", "none")).toBe(true);
  });

  it("'settled' va 'outstanding' bir-birini istisno qiladi", () => {
    for (const v of ["+", "topshirildi", "nol", "kartoteka", "-", "oshibka", "izoh"]) {
      expect(matchesColStatus(v, "settled") && matchesColStatus(v, "outstanding")).toBe(false);
    }
  });
});

describe("matchesFacets", () => {
  it("filtrsiz hamma qator o'tadi", () => {
    expect(matchesFacets(facets(), EMPTY_FILTERS)).toBe(true);
  });

  it("nazoratchi bo'yicha filtr ishlaydi", () => {
    expect(matchesFacets(facets(), filters({ supervisor: "Go'zaloy" }))).toBe(true);
    expect(matchesFacets(facets(), filters({ supervisor: "Muslimbek" }))).toBe(false);
  });

  it("bir nechta filtr VA bilan birlashadi", () => {
    const f = filters({ accountant: "Mirahmad", regime: "vat" });
    expect(matchesFacets(facets(), f)).toBe(true);
    expect(matchesFacets(facets({ regime: "turnover" }), f)).toBe(false);
  });

  it("mas'uli YO'Q firma tanlangan odamga mos kelmaydi", () => {
    // "—" va bo'sh satr — matritsada mas'ul yo'qligining ikki ko'rinishi.
    expect(matchesFacets(facets({ supervisor: "—" }), filters({ supervisor: "Go'zaloy" }))).toBe(false);
    expect(matchesFacets(facets({ supervisor: "" }), filters({ supervisor: "Go'zaloy" }))).toBe(false);
  });

  it("bo'shliq e'tiborga olinmaydi", () => {
    expect(matchesFacets(facets({ accountant: "  Mirahmad  " }), filters({ accountant: "Mirahmad" }))).toBe(true);
  });
});

describe("matchesSearch", () => {
  it("bo'sh so'rov hammasini o'tkazadi", () => {
    expect(matchesSearch(["LIDER ELITE"], "")).toBe(true);
    expect(matchesSearch(["LIDER ELITE"], "   ")).toBe(true);
  });

  it("registrga bog'liq emas va qism bo'yicha topadi", () => {
    expect(matchesSearch(["LIDER ELITE", "306951197"], "lider")).toBe(true);
    expect(matchesSearch(["LIDER ELITE", "306951197"], "9511")).toBe(true);
  });

  it("nazoratchi/bank kabi qo'shimcha maydonlarda ham qidiradi", () => {
    // Avval faqat nom + INN + buxgalter qidirilardi.
    expect(matchesSearch(["VENU", "303917761", "Mirahmad", "Go'zaloy"], "go'zaloy")).toBe(true);
  });

  it("undefined maydonlar yiqilmaydi", () => {
    expect(matchesSearch(["VENU", undefined], "venu")).toBe(true);
    expect(matchesSearch([undefined, undefined], "venu")).toBe(false);
  });
});

describe("parseFilters", () => {
  const from = (map: Record<string, string>) => parseFilters((k) => map[k] ?? null);

  it("bo'sh manbadan standart qiymatlar chiqadi", () => {
    expect(from({})).toEqual(EMPTY_FILTERS);
  });

  it("URL kalitlari o'qiladi", () => {
    const f = from({ [FILTER_URL_KEYS.supervisor]: "Go'zaloy", [FILTER_URL_KEYS.regime]: "vat" });
    expect(f.supervisor).toBe("Go'zaloy");
    expect(f.regime).toBe("vat");
    expect(f.accountant).toBe("all");
  });

  it("noma'lum ustun holati 'any' ga tushadi (matritsa bo'sh qolmasin)", () => {
    expect(from({ [FILTER_URL_KEYS.colStatus]: "xyz" }).colStatus).toBe("any");
    expect(from({ [FILTER_URL_KEYS.colStatus]: "blocked" }).colStatus).toBe("blocked");
  });

  it("barcha e'lon qilingan holatlar qayta o'qiladi", () => {
    for (const o of COL_STATUS_OPTIONS) {
      expect(from({ [FILTER_URL_KEYS.colStatus]: o.value }).colStatus).toBe(o.value);
    }
  });

  it("bo'sh satr standart qiymat deb qaraladi", () => {
    expect(from({ [FILTER_URL_KEYS.accountant]: "" }).accountant).toBe("all");
  });
});

describe("activeFilterCount", () => {
  it("filtrsiz 0", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it("har bir yoqilgan filtr sanaladi", () => {
    expect(activeFilterCount(filters({ accountant: "Mirahmad" }))).toBe(1);
    expect(activeFilterCount(filters({ accountant: "Mirahmad", regime: "vat" }))).toBe(2);
  });

  it("ustun + holat BITTA filtr deb sanaladi", () => {
    // Ular birga ma'noga ega: "AQh ustunida kartoteka" — bitta savol.
    expect(activeFilterCount(filters({ colKey: "aylanma_qqs", colStatus: "blocked" }))).toBe(1);
  });
});

describe("activeChips", () => {
  const label = (k: string) => (k === "aylanma_qqs" ? "Aylanma Hisobot" : k);

  it("filtrsiz bo'sh", () => {
    expect(activeChips(EMPTY_FILTERS, label)).toEqual([]);
  });

  it("har bir yoqilgan filtr uchun chip beradi", () => {
    const chips = activeChips(filters({ supervisor: "Go'zaloy", regime: "vat" }), label);
    expect(chips.map((c) => c.key)).toEqual(["supervisor", "regime"]);
    // Rejim kodi emas, o'qiladigan nom ko'rinadi.
    expect(chips[1].value).toBe("QQS (VAT)");
  });

  it("ustun kesimi bitta chipga birlashadi", () => {
    const chips = activeChips(filters({ colKey: "aylanma_qqs", colStatus: "blocked" }), label);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ key: "colKey", label: "Aylanma Hisobot", value: "Kartoteka" });
  });

  it("holatsiz ustun tanlansa ham chip ko'rinadi", () => {
    const chips = activeChips(filters({ colKey: "aylanma_qqs" }), label);
    expect(chips[0].value).toBe("har qanday holat");
  });
});

describe("regimeLabel", () => {
  it("ma'lum kodlar tarjima qilinadi", () => {
    expect(regimeLabel("vat")).toBe("QQS (VAT)");
    expect(regimeLabel("turnover")).toBe("Aylanma");
  });

  it("noma'lum kod o'zi qaytadi (bo'sh yorliq ko'rsatmaydi)", () => {
    expect(regimeLabel("xyz")).toBe("xyz");
  });
});

describe("colOnly — bitta hisobot rejimi", () => {
  const from = (map: Record<string, string>) => parseFilters((k) => map[k] ?? null);

  it("sukut bo'yicha YOQIQ", () => {
    // Ustun tanlagan odam o'sha ustunni ko'rmoqchi bo'ladi, 47 ta chiziqchani emas.
    expect(EMPTY_FILTERS.colOnly).toBe("1");
    expect(from({}).colOnly).toBe("1");
  });

  it("faqat aniq '0' o'chiradi — noto'g'ri qiymat yoqiq qoldiradi", () => {
    expect(from({ [FILTER_URL_KEYS.colOnly]: "0" }).colOnly).toBe("0");
    expect(from({ [FILTER_URL_KEYS.colOnly]: "xyz" }).colOnly).toBe("1");
    expect(from({ [FILTER_URL_KEYS.colOnly]: "" }).colOnly).toBe("1");
  });

  it("filtr sanog'iga QO'SHILMAYDI — u ustun kesimining bir qismi", () => {
    const f = { ...EMPTY_FILTERS, colKey: "inps", colStatus: "outstanding" as const, colOnly: "0" };
    expect(activeFilterCount(f)).toBe(1);
  });

  it("alohida chip chiqarmaydi", () => {
    const chips = activeChips({ ...EMPTY_FILTERS, colOnly: "0" }, (k) => k);
    expect(chips).toEqual([]);
  });
});
