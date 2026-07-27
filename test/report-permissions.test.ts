import { describe, it, expect } from "vitest";
import {
  allowedCellActions,
  canApproveCell,
  canEditMatrix,
  checkCellWrite,
  isReviewerOwnedValue,
} from "@/lib/reportPermissions";

const SENIOR = ["super_admin", "admin", "chief_accountant", "supervisor"];

describe("canEditMatrix", () => {
  it("bank_manager matritsani tahrirlay olmaydi", () => {
    expect(canEditMatrix("bank_manager")).toBe(false);
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

  it("nazoratchi rollar tasdiqlay oladi", () => {
    for (const role of SENIOR) expect(canApproveCell(role)).toBe(true);
  });
});

describe("allowedCellActions — menyu tarkibi", () => {
  it("buxgalter menyusida '+' (tasdiqlash) YO'Q", () => {
    expect(allowedCellActions("accountant")).not.toContain("+");
  });

  it("buxgalterda topshirish/bajarilmadi/kartoteka/izoh/tozalash bor", () => {
    expect(allowedCellActions("accountant")).toEqual([
      "topshirildi",
      "-",
      "kartoteka",
      "izoh",
      "0",
    ]);
  });

  it("nazoratchida '+' bor", () => {
    for (const role of SENIOR) expect(allowedCellActions(role)).toContain("+");
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

  it("nazoratchi hamma qiymatni yoza oladi", () => {
    for (const role of SENIOR) {
      for (const v of ["+", "-", "topshirildi", "kartoteka", "0", "matn"]) {
        expect(checkCellWrite({ role, nextValue: v, currentValue: "+" })).toBeNull();
      }
    }
  });

  it("bank_manager hech narsa yozolmaydi", () => {
    expect(checkCellWrite({ role: "bank_manager", nextValue: "-" })).not.toBeNull();
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
