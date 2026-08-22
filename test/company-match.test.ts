/**
 * 1C nomini bazadagi firmaga bog'lash.
 *
 * Eng muhim tekshiruv — IKKILANISHDA TANLAMASLIK. Mijoz qarzini boshqa
 * firmaga yozib qo'yish undirish ishini butunlay buzadi: to'lagan mijoz
 * qarzdor bo'lib qoladi, qarzdor esa toza ko'rinadi.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { normalizeCompanyName, matchCompanyByName, matchCompanyByInn } = await import("@/lib/companyMatch");

const co = (id: string, name: string) => ({ id, name });

describe("normalizeCompanyName", () => {
  it("huquqiy shaklni tashlaydi", () => {
    expect(normalizeCompanyName('"Alif Pharma" Mchj')).toBe("alif pharma");
    expect(normalizeCompanyName("ALIF PHARMA")).toBe("alif pharma");
    expect(normalizeCompanyName('"KESH LOGIST" mas\'uliyati cheklangan jamiyati')).toBe("kesh logist");
  });

  it("kirill ko'rinishdosh harflarni lotinga keltiradi", () => {
    // "ООО" kirill О bilan yozilgan — ko'z uchun lotin OOO bilan bir xil.
    expect(normalizeCompanyName('ООО "ABDUVALI OTA"')).toBe("abduvali ota");
  });

  it("harflari ajratib yozilgan nomni yig'adi", () => {
    expect(normalizeCompanyName('"R A H M A T J O N-Halol-Market" Mchj')).toBe("rahmatjon halol market");
  });

  it("tirnoq va tinish belgilari ta'sir qilmaydi", () => {
    expect(normalizeCompanyName('"Stroy-Market" Ok')).toBe(normalizeCompanyName("Stroy Market"));
  });
});

describe("matchCompanyByName", () => {
  const companies = [
    co("1", "ALIF PHARMA"),
    co("2", "ATAR SCIENCE TECH"),
    co("3", "Stroy Market"),
  ];

  it("aniq moslikni topadi", () => {
    expect(matchCompanyByName('"Alif Pharma" Mchj', companies)?.id).toBe("1");
    expect(matchCompanyByName('"Stroy-Market" Ok', companies)?.id).toBe("3");
  });

  it("topilmasa null", () => {
    expect(matchCompanyByName('"Yo\'q Firma" Mchj', companies)).toBeNull();
    expect(matchCompanyByName("", companies)).toBeNull();
  });

  it("IKKILANISHDA TANLAMAYDI", () => {
    const twins = [co("a", "SINHAI"), co("b", '"Sinhai" Mchj')];
    expect(matchCompanyByName("SINHAI", twins)).toBeNull();
  });

  it("qo'lda tasdiqlangan taxallus normalizatsiyadan ustun turadi", () => {
    const aliases = new Map([['"Dksp Amudaryo" Mchj', "2"]]);
    expect(matchCompanyByName('"Dksp Amudaryo" Mchj', companies, aliases)?.id).toBe("2");
  });

  it("taxallus mavjud bo'lmagan firmaga ishora qilsa null", () => {
    const aliases = new Map([["X", "yo'q"]]);
    expect(matchCompanyByName("X", companies, aliases)).toBeNull();
  });
});

describe("matchCompanyByInn", () => {
  const c = (id: string, name: string, inn: string, isActive = true) => ({ id, name, inn, isActive });

  it("yagona STIRni topadi", () => {
    const list = [c("1", "ALIF PHARMA", "301234567"), c("2", "ATAR", "309876543")];
    expect(matchCompanyByInn("301234567", list)?.id).toBe("1");
  });

  it("STIR formatidagi ajratgichlarga qaramaydi", () => {
    const list = [c("1", "ALIF PHARMA", "301234567")];
    expect(matchCompanyByInn("301 234 567", list)?.id).toBe("1");
    expect(matchCompanyByInn("301-234-567", list)?.id).toBe("1");
  });

  it("ARXIVLANGAN egizak to'siq bo'lmaydi — faol nusxa tanlanadi", () => {
    // Prodda 10 ta STIR shunday: bittasi faol, bittasi arxivlangan eski yozuv.
    const list = [
      c("eski", "AVVITAL NATURALS", "311824130", false),
      c("faol", '"AVVITAL NATURALS" MCHJ', "311824130", true),
    ];
    expect(matchCompanyByInn("311824130", list)?.id).toBe("faol");
  });

  it("IKKITA FAOL qator bo'lsa TANLAMAYDI — bu chinakam dublikat", () => {
    const list = [c("a", "X", "311824130"), c("b", "Y", "311824130")];
    expect(matchCompanyByInn("311824130", list)).toBeNull();
  });

  it("STIR bo'sh yoki topilmasa null", () => {
    const list = [c("1", "ALIF PHARMA", "301234567")];
    expect(matchCompanyByInn(null, list)).toBeNull();
    expect(matchCompanyByInn("", list)).toBeNull();
    expect(matchCompanyByInn("999999999", list)).toBeNull();
  });
});
