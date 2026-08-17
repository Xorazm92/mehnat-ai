import { describe, it, expect } from "vitest";
import {
  hiddenMatchOnly,
  matchedFields,
  matchesCompanySearch,
  type CompanySearchSubject,
} from "./companySearch";

const co = (over: Partial<CompanySearchSubject> = {}): CompanySearchSubject => ({
  name: "XORAZMIY ENERGY TEAM",
  brandName: "XORAZMIY",
  inn: "313035787",
  directorName: "Salanets Darya",
  ...over,
});

describe("matchesCompanySearch", () => {
  it("bo'sh so'rov hamma qatorni o'tkazadi", () => {
    expect(matchesCompanySearch(co(), "")).toBe(true);
    expect(matchesCompanySearch(co(), "   ")).toBe(true);
  });

  it("nom bo'yicha qism-satr", () => {
    expect(matchesCompanySearch(co(), "energy")).toBe(true);
    expect(matchesCompanySearch(co(), "ENERGY")).toBe(true);
  });

  it("STIR bo'yicha", () => {
    expect(matchesCompanySearch(co(), "3130")).toBe(true);
  });

  it("mos kelmasa false", () => {
    expect(matchesCompanySearch(co(), "montaj")).toBe(false);
  });

  /**
   * O'XSHASHLIK (fuzzy) YO'Q — bu ataylab shunday. Foydalanuvchi "tizim
   * o'xshash so'zlarni topyaptimi?" deb so'ragan; javob: yo'q, faqat aniq
   * qism-satr. Shu testlar buni qulflab qo'yadi.
   */
  it("o'xshashlik bo'yicha TOPMAYDI — faqat aniq qism-satr", () => {
    expect(matchesCompanySearch(co({ name: "FAXRIDDIN SAVDO" }), "faks")).toBe(false);
    expect(matchesCompanySearch(co({ name: "FAXRIDDIN SAVDO" }), "fxr")).toBe(false);
    expect(matchesCompanySearch(co({ name: "FAXRIDDIN SAVDO" }), "fax")).toBe(true);
  });
});

describe("matchedFields — moslik SABABI", () => {
  it("qaysi maydon mos kelganini aytadi", () => {
    expect(matchedFields(co(), "energy")).toEqual(["name"]);
    expect(matchedFields(co(), "3130")).toEqual(["inn"]);
    expect(matchedFields(co(), "salanets")).toEqual(["director"]);
  });

  it("bir nechta maydon birga mos kelishi mumkin", () => {
    expect(matchedFields(co(), "xorazmiy")).toEqual(["name", "brand"]);
  });

  it("bo'sh so'rov — bo'sh natija", () => {
    expect(matchedFields(co(), "")).toEqual([]);
  });

  it("bo'sh maydonlar sanalmaydi", () => {
    expect(matchedFields(co({ brandName: null, directorName: null }), "xorazmiy")).toEqual(["name"]);
  });
});

describe("hiddenMatchOnly — 'nega bu qator chiqdi?'", () => {
  /**
   * ASOSIY HOLAT: buxgalter "fax" deb yozdi, jadvalda nomida "fax" yo'q qator
   * chiqdi. Sabab — DIREKTOR ismi, u esa jadvalda ustun sifatida yo'q.
   */
  it("faqat direktor bo'yicha topilgan qator belgilanadi", () => {
    const c = co({ name: "ATOMIK ENERGY MCHJ", brandName: null, directorName: "Faxriddin Aliyev" });
    expect(hiddenMatchOnly(c, "fax")).toBe(true);
  });

  it("nom bo'yicha topilgan qator belgilanmaydi", () => {
    expect(hiddenMatchOnly(co({ name: "FAXRIDDIN SAVDO" }), "fax")).toBe(false);
  });

  it("ham nom, ham direktor mos kelsa — belgilanmaydi (sabab ko'rinib turadi)", () => {
    const c = co({ name: "FAXRIDDIN SAVDO", directorName: "Faxriddin Aliyev" });
    expect(hiddenMatchOnly(c, "fax")).toBe(false);
  });

  it("umuman mos kelmagan qator belgilanmaydi", () => {
    expect(hiddenMatchOnly(co(), "montaj")).toBe(false);
  });

  it("bo'sh so'rovda belgilanmaydi", () => {
    expect(hiddenMatchOnly(co(), "")).toBe(false);
  });
});
