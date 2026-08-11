import { describe, it, expect } from "vitest";
import {
  allowedCellActions,
  canApproveCell,
  canEditMatrix,
  checkCellWrite,
  isCompanyReviewer,
  isReviewerOwnedValue,
} from "@/lib/reportPermissions";
import type { CompanyRelation } from "@/lib/access";

const SENIOR = ["super_admin", "admin", "chief_accountant", "supervisor"];

// Huquq rolning o'zidan emas, SHU FIRMADAGI biriktiruvdan kelib chiqadi.
// Admin uchun relations ahamiyatsiz; nazoratchi/bosh buxgalter esa firmaga
// biriktirilgan bo'lishi shart.
const relFor = (role: string): CompanyRelation[] =>
  role === "chief_accountant" ? ["chief_accountant"] : role === "supervisor" ? ["supervisor"] : [];

describe("canEditMatrix", () => {
  it("bank_manager biriktirilmagan firmada tahrirlay olmaydi", () => {
    expect(canEditMatrix("bank_manager")).toBe(false);
    expect(canEditMatrix("bank_manager", [])).toBe(false);
  });

  it("bank_manager O'ZI BUXGALTER bo'lgan firmada tahrirlay oladi", () => {
    // Ruslan: 65 firmada bank-klient, 10 tasida buxgalter — o'sha 10 tasida
    // matritsani u to'ldiradi.
    expect(canEditMatrix("bank_manager", ["accountant"])).toBe(true);
  });

  it("buxgalter va senior rollar tahrirlay oladi", () => {
    expect(canEditMatrix("accountant")).toBe(true);
    for (const role of SENIOR) expect(canEditMatrix(role)).toBe(true);
  });
});

describe("canApproveCell — asosiy talab", () => {
  it("buxgalter TASDIQLAY OLMAYDI", () => {
    expect(canApproveCell("accountant")).toBe(false);
  });

  it("nazoratchi rollar O'Z firmasida tasdiqlay oladi", () => {
    for (const role of SENIOR) expect(canApproveCell(role, relFor(role))).toBe(true);
  });
});

describe("allowedCellActions — menyu tarkibi", () => {
  it("buxgalter menyusida '+' (tasdiqlash) YO'Q", () => {
    expect(allowedCellActions("accountant")).not.toContain("+");
  });

  it("buxgalterda topshirish/nol/bajarilmadi/kartoteka/izoh/tozalash bor", () => {
    expect(allowedCellActions("accountant")).toEqual([
      "topshirildi",
      "nol",
      "-",
      "kartoteka",
      "izoh",
      "0",
    ]);
  });

  // "nol" (nol hisobot topshirildi) va "0" (shart emas) — IKKI BOSHQA narsa.
  // Ular bir qiymatga tushib qolsa matritsa yolg'on gapiradi: "bu firmada
  // bunday hisobot talab qilinmaydi" ham "bajarildi" deb sanalardi.
  it("'nol' va '0' alohida amallar bo'lib qoladi", () => {
    const menu = allowedCellActions("accountant");
    expect(menu).toContain("nol");
    expect(menu).toContain("0");
    expect(menu.filter((v) => v === "nol" || v === "0")).toHaveLength(2);
  });

  it("nazoratchida ham 'nol' bor", () => {
    for (const role of SENIOR) expect(allowedCellActions(role, relFor(role))).toContain("nol");
  });

  it("nazoratchida '+' bor", () => {
    for (const role of SENIOR) expect(allowedCellActions(role, relFor(role))).toContain("+");
  });

  it("bank_manager uchun menyu bo'sh", () => {
    expect(allowedCellActions("bank_manager")).toEqual([]);
  });
});

describe("checkCellWrite — server majburlashi", () => {
  it("buxgalter '+' yozolmaydi", () => {
    const reason = checkCellWrite({ role: "accountant", nextValue: "+" });
    expect(reason).toMatch(/nazoratchi/i);
  });

  it("buxgalter 'accepted' (sinonim) ham yozolmaydi", () => {
    expect(checkCellWrite({ role: "accountant", nextValue: "accepted" })).not.toBeNull();
  });

  it("buxgalter dalilsiz 'topshirildi' yozolmaydi", () => {
    const reason = checkCellWrite({ role: "accountant", nextValue: "topshirildi" });
    expect(reason).toMatch(/skrinshot/i);
  });

  it("buxgalter '-' va 'kartoteka' yoza oladi", () => {
    expect(checkCellWrite({ role: "accountant", nextValue: "-" })).toBeNull();
    expect(checkCellWrite({ role: "accountant", nextValue: "kartoteka" })).toBeNull();
  });

  it("buxgalter erkin matn yoza oladi", () => {
    expect(checkCellWrite({ role: "accountant", nextValue: "kutilmoqda 15-kun" })).toBeNull();
  });

  it("buxgalter TASDIQLANGAN katakni o'zgartira olmaydi", () => {
    const reason = checkCellWrite({
      role: "accountant",
      nextValue: "-",
      currentValue: "+",
    });
    expect(reason).toMatch(/tasdiqlangan|tekshiruvdagi/i);
  });

  it("buxgalter tekshiruvdagi katakni tozalay olmaydi", () => {
    const reason = checkCellWrite({
      role: "accountant",
      nextValue: "0",
      currentValue: "topshirildi",
    });
    expect(reason).not.toBeNull();
  });

  it("buxgalter bo'sh katakni to'ldira oladi", () => {
    expect(
      checkCellWrite({ role: "accountant", nextValue: "-", currentValue: null })
    ).toBeNull();
  });

  it("nazoratchi O'Z firmasida hamma qiymatni yoza oladi", () => {
    for (const role of SENIOR) {
      for (const v of ["+", "-", "topshirildi", "kartoteka", "0", "matn"]) {
        expect(
          checkCellWrite({ role, relations: relFor(role), nextValue: v, currentValue: "+" })
        ).toBeNull();
      }
    }
  });

  it("bank_manager hech narsa yozolmaydi", () => {
    expect(checkCellWrite({ role: "bank_manager", nextValue: "-" })).not.toBeNull();
  });
});

describe("o'z-o'zini nazorat bloki — bitta odam, ikki xil firma", () => {
  // Bazadagi haqiqiy holat: Go'zaloy 134 firmada nazoratchi, 10 tasida buxgalter.
  it("nazoratchi O'ZI BUXGALTER bo'lgan firmada tasdiqlay OLMAYDI", () => {
    expect(canApproveCell("supervisor", ["accountant"])).toBe(false);
    expect(isCompanyReviewer("supervisor", ["accountant"])).toBe(false);
  });

  it("ikkala rolda ham biriktirilgan bo'lsa — buxgalterlik ustun keladi", () => {
    expect(canApproveCell("supervisor", ["supervisor", "accountant"])).toBe(false);
  });

  it("buxgalter bo'lgan firmasida menyusida '+' YO'Q", () => {
    expect(allowedCellActions("supervisor", ["accountant"])).not.toContain("+");
  });

  it("buxgalter bo'lgan firmasida '+' yoza olmaydi", () => {
    const reason = checkCellWrite({
      role: "supervisor",
      relations: ["accountant"],
      nextValue: "+",
    });
    expect(reason).toMatch(/nazoratchi/i);
  });

  it("nazorat qiladigan firmasida esa tasdiqlay oladi", () => {
    expect(canApproveCell("supervisor", ["supervisor"])).toBe(true);
    expect(
      checkCellWrite({ role: "supervisor", relations: ["supervisor"], nextValue: "+" })
    ).toBeNull();
  });

  it("biriktirilmagan firmada nazoratchi tasdiqlay olmaydi", () => {
    expect(canApproveCell("supervisor", [])).toBe(false);
  });

  it("admin uchun biriktiruv shart emas", () => {
    expect(canApproveCell("admin", [])).toBe(true);
    expect(canApproveCell("super_admin", ["accountant"])).toBe(true);
  });

  it("bosh buxgalter departament orqali biriktirilgan firmasida tasdiqlaydi", () => {
    expect(canApproveCell("chief_accountant", ["chief_accountant"])).toBe(true);
  });
});

describe("huquq lavozimdan emas, biriktiruvdan keladi", () => {
  // Zamira: lavozimi `accountant`, ammo 16 ta firmada aynan NAZORATCHI o'rnida.
  it("buxgalter lavozimidagi odam nazoratchi bo'lgan firmasida tasdiqlaydi", () => {
    expect(canApproveCell("accountant", ["supervisor"])).toBe(true);
    expect(allowedCellActions("accountant", ["supervisor"])).toContain("+");
    expect(
      checkCellWrite({ role: "accountant", relations: ["supervisor"], nextValue: "+" })
    ).toBeNull();
  });

  it("o'sha odam buxgalter bo'lgan firmasida tasdiqlay olmaydi", () => {
    expect(canApproveCell("accountant", ["accountant"])).toBe(false);
    expect(canApproveCell("accountant", ["accountant", "supervisor"])).toBe(false);
  });

  it("bank_manager buxgalter firmasida topshira oladi, tasdiqlay olmaydi", () => {
    const actions = allowedCellActions("bank_manager", ["accountant"]);
    expect(actions).toContain("topshirildi");
    expect(actions).not.toContain("+");
    expect(
      checkCellWrite({ role: "bank_manager", relations: ["accountant"], nextValue: "-" })
    ).toBeNull();
  });

  it("bank_manager nazoratchi bo'lgan firmasida tasdiqlaydi", () => {
    expect(canApproveCell("bank_manager", ["supervisor"])).toBe(true);
  });

  it("biriktiruvsiz hech kim yozolmaydi (bank_manager)", () => {
    expect(checkCellWrite({ role: "bank_manager", relations: [], nextValue: "-" })).not.toBeNull();
  });
});

describe("isReviewerOwnedValue", () => {
  it("'+' va 'topshirildi' nazoratchi qaroridagi qiymatlar", () => {
    expect(isReviewerOwnedValue("+")).toBe(true);
    expect(isReviewerOwnedValue("topshirildi")).toBe(true);
    expect(isReviewerOwnedValue("accepted")).toBe(true);
  });

  it("bo'sh, '-' va erkin matn — emas", () => {
    expect(isReviewerOwnedValue("")).toBe(false);
    expect(isReviewerOwnedValue(null)).toBe(false);
    expect(isReviewerOwnedValue("-")).toBe(false);
    expect(isReviewerOwnedValue("kartoteka")).toBe(false);
  });
});
