/**
 * KARTA CHIQIMINI TASNIFLASH.
 *
 * Eng muhim tekshiruv — "O'ziga oylik" ning "Oylik" bilan ADASHMASLIGI.
 * Birinchisida oluvchi aniq (kartaning egasi), ikkinchisida noma'lum.
 * Tartib buzilsa 400 mln so'mlik to'lov "oluvchisi noma'lum" bo'lib
 * qolardi va hech qachon hisobga olinmasdi.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { classifyTransitOutflow, extractPayeeHint } = await import("@/lib/transitSalary");

describe("classifyTransitOutflow", () => {
  it("o'ziga oylik — egasiga to'lov, apostrof shakllaridan qat'i nazar", () => {
    for (const c of ["O'ziga oylik", "O‘ziga oylik", "oziga oylik", "  O'ZIGA OYLIK  "]) {
      expect(classifyTransitOutflow(c).kind, c).toBe("self_salary");
    }
  });

  it("o'ziga oylik ichida \"oylik\" bo'lsa ham boshqaga o'tib ketmaydi", () => {
    // Tartib xato bo'lsa bu `other_salary` bo'lib qolardi — 400 mln yo'qolardi.
    expect(classifyTransitOutflow("O'ziga oylik").kind).not.toBe("other_salary");
  });

  it("oylik va avans — boshqa odamga", () => {
    expect(classifyTransitOutflow("Oylik").kind).toBe("other_salary");
    expect(classifyTransitOutflow("Avans").kind).toBe("other_salary");
  });

  it("ta'sischiga taqsimot oylik deb sanalmaydi", () => {
    expect(classifyTransitOutflow("Otabek akaga").kind).toBe("founder_draw");
  });

  it("qolgan maqsadlar oddiy xarajat", () => {
    for (const c of ["Ovqat", "Texnika", "bank_komissiya", "Arenda", null, ""]) {
      expect(classifyTransitOutflow(c).kind, String(c)).toBe("expense");
    }
  });

  it("oluvchi izohda bo'lsa ajratiladi", () => {
    const v = classifyTransitOutflow("Oylik", "Oylik — Zamira opaga avans");
    expect(v.kind).toBe("other_salary");
    expect(v.payeeHint).toBe("Zamira opaga avans");
  });

  it("oluvchi ko'rsatilmagan bo'lsa TAXMIN QILINMAYDI", () => {
    expect(classifyTransitOutflow("Oylik", "Oylik").payeeHint).toBeNull();
    expect(classifyTransitOutflow("Oylik", null).payeeHint).toBeNull();
  });
});

describe("extractPayeeHint", () => {
  it("tiredan keyingi qismni oladi", () => {
    expect(extractPayeeHint("Oylik — Yorqinoy opa")).toBe("Yorqinoy opa");
  });

  it("tire yo'q bo'lsa null", () => {
    expect(extractPayeeHint("Oylik")).toBeNull();
    expect(extractPayeeHint("")).toBeNull();
    expect(extractPayeeHint(null)).toBeNull();
  });

  it("tiredan keyin bo'sh bo'lsa null", () => {
    expect(extractPayeeHint("Oylik — ")).toBeNull();
  });
});
