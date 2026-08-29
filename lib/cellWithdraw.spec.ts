import { describe, it, expect } from "vitest";
import { checkCellWrite, CELL_EMPTY, CELL_SUBMITTED, CELL_APPROVED, CELL_ZERO_REPORT } from "./reportPermissions";
import type { CompanyRelation } from "./platform/permissions";

/**
 * O'Z TOPSHIRIG'INI QAYTARIB OLISH.
 *
 * Buxgalter noto'g'ri ustunga skrinshot yuborsa, katak "topshirildi" bo'lardi
 * va u yerdan CHIQIB BO'LMASDI: "Tozalash" ham, boshqa qiymat ham to'silardi
 * ("Tasdiqlangan yoki tekshiruvdagi katakni o'zgartirib bo'lmaydi"), qayta
 * yuklash esa faqat rasmni almashtirardi — katak baribir "topshirildi" bo'lib
 * qolaverardi. Yagona chora nazoratchidan rad etishni so'rash edi.
 *
 * Yangi qoida: nazoratchi HALI KO'RMAGAN (`pending`) va topshirgan odam O'ZI
 * bo'lsa — qaytarib olsa bo'ladi. Nazoratchi qaror qilgandan keyin yo'l
 * yopiladi.
 */

const ACC: CompanyRelation[] = ["accountant"];
const SUP: CompanyRelation[] = ["supervisor"];
const mine = { status: "pending", isMine: true };
const notMine = { status: "pending", isMine: false };
const approved = { status: "approved", isMine: true };
const rejected = { status: "rejected", isMine: true };

describe("buxgalter: o'z kutilayotgan topshirig'i", () => {
  it("tozalay oladi", () => {
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_EMPTY, currentValue: CELL_SUBMITTED, evidence: mine })
    ).toBeNull();
  });

  it("boshqa qiymatga o'zgartira oladi (masalan nol hisobot)", () => {
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_ZERO_REPORT, currentValue: CELL_SUBMITTED, evidence: mine })
    ).toBeNull();
  });

  it("lekin baribir O'ZI tasdiqlay olmaydi", () => {
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_APPROVED, currentValue: CELL_SUBMITTED, evidence: mine })
    ).toContain("nazoratchi");
  });
});

describe("chegaralar saqlanadi", () => {
  it("BOSHQA odamning topshirig'ini qaytarib ololmaydi", () => {
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_EMPTY, currentValue: CELL_SUBMITTED, evidence: notMine })
    ).toBeTruthy();
  });

  it("nazoratchi TASDIQLAGANDAN keyin o'zgartirib bo'lmaydi", () => {
    const reason = checkCellWrite({
      role: "accountant", relations: ACC, nextValue: CELL_EMPTY, currentValue: CELL_APPROVED, evidence: approved,
    });
    expect(reason).toBeTruthy();
    // Sabab nima qilish kerakligini AYTADI.
    expect(reason).toContain("qayta ko'rishni so'rang");
  });

  it("rad etilgandan keyin ham to'g'ridan-to'g'ri o'zgartirilmaydi", () => {
    // Rad etilganda katak "-" bo'ladi (nazoratchiga tegishli qiymat emas),
    // lekin "topshirildi" qolgan holatda qaytarib olish yo'li yopiq.
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_EMPTY, currentValue: CELL_SUBMITTED, evidence: rejected })
    ).toBeTruthy();
  });

  it("dalil umuman bo'lmasa (nazoratchi qo'lda qo'ygan) — yopiq", () => {
    expect(
      checkCellWrite({ role: "accountant", relations: ACC, nextValue: CELL_EMPTY, currentValue: CELL_SUBMITTED, evidence: null })
    ).toBeTruthy();
  });

  it("nazoratchiga hech qanday cheklov qo'shilmadi", () => {
    for (const ev of [mine, notMine, approved, null]) {
      expect(
        checkCellWrite({ role: "supervisor", relations: SUP, nextValue: CELL_EMPTY, currentValue: CELL_APPROVED, evidence: ev })
      ).toBeNull();
    }
  });
});
