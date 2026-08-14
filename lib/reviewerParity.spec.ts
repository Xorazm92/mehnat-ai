import { describe, it, expect } from "vitest";
import { isCompanyReviewer } from "./reportPermissions";
import { isReviewerOn } from "./access";
import type { CompanyRelation } from "./permissions";

/**
 * MIJOZ VA SERVER BIR XIL JAVOB BERSIN.
 *
 * Tasdiqlash huquqi ikki joyda hisoblanadi:
 *   · UI  — `lib/reportPermissions.ts` → `isCompanyReviewer`
 *   · server — `lib/access.ts` → `isReviewerOn`
 *
 * Ular ajralib ketganda foydalanuvchi bosa oladigan, lekin server rad
 * etadigan tugma paydo bo'ladi. Prod'da aynan shunday bo'ldi: dalil oynasi
 * huquqni FAQAT lavozimdan hisoblardi, shuning uchun Go'zaloy (lavozimi
 * nazoratchi, lekin 10 ta firmada buxgalter) o'sha firmalarda "Tasdiqlash"
 * tugmasini ko'rardi. Bosgach server "Bu firmada tasdiqlash huquqingiz
 * yo'q" deb rad etar, katak esa eski holatiga qaytardi — foydalanuvchi buni
 * "tasdiqladim, o'zi yechilib qoldi" deb ko'rardi.
 */

const ALL: CompanyRelation[] = ["accountant", "supervisor", "chief_accountant", "bank_manager"];

/** `relations` to'plamidan `CompanySlots` yasaydi (server shu shaklni kutadi). */
function slotsFor(rels: CompanyRelation[], userId: string) {
  return {
    accountantId: rels.includes("accountant") ? userId : null,
    supervisorId: rels.includes("supervisor") ? userId : null,
    chiefAccountantId: rels.includes("chief_accountant") ? userId : null,
    bankClientId: rels.includes("bank_manager") ? userId : null,
  };
}

/** 4 ta mas'uliyatning barcha 16 kombinatsiyasi. */
function combos(): CompanyRelation[][] {
  const out: CompanyRelation[][] = [];
  for (let mask = 0; mask < 1 << ALL.length; mask++) {
    out.push(ALL.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

const ROLES = ["super_admin", "admin", "chief_accountant", "supervisor", "accountant", "bank_manager"];

describe("tasdiqlash huquqi — UI va server bir xil", () => {
  it("barcha rol × biriktiruv kombinatsiyalarida javob bir xil", () => {
    const userId = "u1";
    const mismatches: string[] = [];

    for (const role of ROLES) {
      for (const rels of combos()) {
        const ui = isCompanyReviewer(role, rels);
        const server = isReviewerOn(slotsFor(rels, userId), { id: userId, role });
        if (ui !== server) {
          mismatches.push(`${role} [${rels.join(",") || "—"}]: UI=${ui} server=${server}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("o'z-o'zini nazorat bloki: buxgalter biriktiruvi tasdiqlashni yopadi", () => {
    // Go'zaloyning holati: lavozimi nazoratchi, shu firmada esa buxgalter.
    expect(isCompanyReviewer("supervisor", ["accountant"])).toBe(false);
    expect(isCompanyReviewer("supervisor", ["accountant", "supervisor"])).toBe(false);
    // Buxgalter emas — tasdiqlaydi.
    expect(isCompanyReviewer("supervisor", ["supervisor"])).toBe(true);
  });

  it("admin har doim tasdiqlay oladi", () => {
    for (const rels of combos()) {
      expect(isCompanyReviewer("super_admin", rels)).toBe(true);
      expect(isCompanyReviewer("admin", rels)).toBe(true);
    }
  });
});
