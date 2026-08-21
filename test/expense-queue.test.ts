/**
 * CHIQIM NAVBATINING QARORLARI.
 *
 * Eng muhim tekshiruv — HAQIQIY XARAJATNI YOPIB YUBORIB BO'LMASLIGI.
 * Prodda navbatda 211 mln soliq to'lovi turgan; agar "ichki harakat" deb
 * yopish yo'li ochiq bo'lsa, bitta noto'g'ri bosish o'sha pulni hisobdan
 * butunlay chiqarib yuborardi.
 *
 * Bazasiz — sof qaror mantiqi.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { expenseQueueGroup, ignorableRejectionReason } = await import("@/lib/bank/expenseQueue");

describe("expenseQueueGroup", () => {
  it("tashqi kontragent toifalari — xarajat", () => {
    for (const c of ["soliq", "ijara", "aloqa", "ovqat", "bank_komissiya", "boshqa"]) {
      expect(expenseQueueGroup(c)).toBe("xarajat");
    }
  });

  it("xodim kartasi — alohida guruh, chunki yakuni bog'lash", () => {
    expect(expenseQueueGroup("xodim_kartasi")).toBe("karta");
  });

  it("firmalararo va oylik — ichki, kassaga yozilmaydi", () => {
    expect(expenseQueueGroup("ichki_otkazma")).toBe("ichki");
    expect(expenseQueueGroup("oylik")).toBe("ichki");
  });

  it("noma'lum toifa xarajat deb qaraladi — pul jimgina yo'qolmasin", () => {
    expect(expenseQueueGroup("allaqanday_yangi_toifa")).toBe("xarajat");
  });
});

describe("ignorableRejectionReason", () => {
  it("ichki harakatlarni yopishga ruxsat beradi", () => {
    expect(ignorableRejectionReason("ichki_otkazma")).toBeNull();
    expect(ignorableRejectionReason("xodim_kartasi")).toBeNull();
    expect(ignorableRejectionReason("oylik")).toBeNull();
  });

  it("haqiqiy xarajatni yopishni RAD ETADI", () => {
    for (const c of ["soliq", "ijara", "aloqa", "ovqat", "bank_komissiya", "boshqa"]) {
      const reason = ignorableRejectionReason(c);
      expect(reason, `${c} yopilib ketmasligi kerak`).not.toBeNull();
      expect(reason).toContain("kassaga yozilishi kerak");
    }
  });

  it("rad javobida toifaning o'qiladigan nomi bo'ladi", () => {
    expect(ignorableRejectionReason("soliq")).toContain("Soliq va byudjet");
  });
});
