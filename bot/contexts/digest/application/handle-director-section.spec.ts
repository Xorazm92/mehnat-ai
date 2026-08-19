// RBAC qo'riqchisining testi — DB'ga tegmasdan.
//
// Imzo faqat tugmani BIZ chizganimizni isbotlaydi. Hisobot esa butun firma
// kesimini beradi: kim bo'lsa ham bosa oladigan bo'lsa (xabar ko'chirib
// yuborilgan bo'lishi mumkin), butun qarzdorlik manzarasi tashqariga chiqadi.
// Shuning uchun rad etish yo'li so'rovdan OLDIN turishi kerak — bu test aynan
// shuni ushlaydi: prisma o'rniga tegilsa portlaydigan qo'g'irchoq berilgan.
import { describe, it, expect } from "vitest";
import { handleDirectorSection } from "./handle-director-section";
import { DIRECTOR_SECTION } from "./render-director-section";

const explodingPrisma = new Proxy(
  {},
  {
    get() {
      throw new Error("RBAC tekshiruvidan oldin bazaga so'rov ketdi");
    },
  },
) as never;

const opts = { secret: "test-secret" };

describe("handleDirectorSection RBAC", () => {
  it("direktor bo'lmagan rolni bazaga yetkazmasdan rad etadi", async () => {
    for (const role of ["accountant", "chief_accountant", "supervisor", "bank_manager"]) {
      const out = await handleDirectorSection(
        explodingPrisma,
        DIRECTOR_SECTION.OVERDUE,
        { id: "u1", role },
        opts,
      );
      expect(out.alert).toBe(true);
      expect(out.answer).toContain("faqat rahbariyat");
      expect(out.edit).toBeUndefined();
    }
  });

  // Eski/buzilgan kalit ham bazani bezovta qilmasligi kerak.
  it("noma'lum bo'lim kalitini 'eskirgan' deb javob beradi", async () => {
    const out = await handleDirectorSection(
      explodingPrisma,
      "zzz",
      { id: "u1", role: "super_admin" },
      opts,
    );
    expect(out.answer).toContain("eskirgan");
  });
});
