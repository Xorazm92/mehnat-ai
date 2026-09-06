/**
 * DIREKTOR KOKPITI — RBAC AJRATGICHI.
 *
 * M4 auditida topilgan chalkashlik: ekran "Director Cockpit" deb nomlangan,
 * amalda esa `cockpit` ko'rinishi TO'RT rolga berilgan (nazoratchi va bosh
 * buxgalter ham kiradi). Farq faqat `server/directorCockpit.ts` dagi rol
 * shartida yashardi — RBAC matritsasida ko'rinmasdi va admin uni boshqara
 * olmasdi.
 *
 * Endi ikki qavat: `cockpit` (ish oqimi, 4 rol) va `director_cockpit`
 * (moliya + tez harakat, 2 rol). Bu testlar ikkalasining CHEGARASINI
 * mahkamlaydi.
 *
 * SOF — DB kerak emas: `effectiveViewsForRole` va `canDirectorCockpit`
 * ikkalasi ham sof funksiya.
 */
import { describe, it, expect } from "vitest";
import {
  effectiveViewsForRole,
  canDirectorCockpit,
  ALL_VIEWS,
  VIEW_LABELS,
  type UserRole,
} from "@/lib/platform/permissions";

/** Rolning admin override'siz, biriktiruvsiz standart ko'rinishlari. */
const viewsOf = (role: UserRole) => effectiveViewsForRole(role);

describe("director_cockpit — rol chegarasi", () => {
  it("super_admin: ikkala ko'rinish ham bor", () => {
    const v = viewsOf("super_admin");
    expect(v).toContain("cockpit");
    expect(v).toContain("director_cockpit");
    expect(canDirectorCockpit("super_admin", v)).toBe(true);
  });

  it("admin: ikkala ko'rinish ham bor", () => {
    const v = viewsOf("admin");
    expect(v).toContain("cockpit");
    expect(v).toContain("director_cockpit");
    expect(canDirectorCockpit("admin", v)).toBe(true);
  });

  it("chief_accountant: kokpit BOR, direktor kokpiti YO'Q", () => {
    const v = viewsOf("chief_accountant");
    expect(v).toContain("cockpit");
    expect(v).not.toContain("director_cockpit");
    expect(canDirectorCockpit("chief_accountant", v)).toBe(false);
  });

  it("supervisor: kokpit BOR, direktor kokpiti YO'Q", () => {
    const v = viewsOf("supervisor");
    expect(v).toContain("cockpit");
    expect(v).not.toContain("director_cockpit");
    expect(canDirectorCockpit("supervisor", v)).toBe(false);
  });

  it("accountant: ikkalasi ham yo'q", () => {
    const v = viewsOf("accountant");
    expect(v).not.toContain("cockpit");
    expect(v).not.toContain("director_cockpit");
    expect(canDirectorCockpit("accountant", v)).toBe(false);
  });
});

describe("darvoza ikki qavatli — matritsa toraytiradi, kengaytirmaydi", () => {
  it("ko'rinish berilsa ham NOTO'G'RI rol o'ta olmaydi", () => {
    // Admin RBAC matritsasi `director_cockpit` ni nazoratchiga bera oladi
    // (u tahrirlanadigan qatlam), lekin rol sharti kodda va u tahrirlanmaydi.
    expect(canDirectorCockpit("supervisor", ["cockpit", "director_cockpit"])).toBe(false);
    expect(canDirectorCockpit("chief_accountant", ["director_cockpit"])).toBe(false);
  });

  it("to'g'ri rol bo'lsa ham ko'rinish o'chirilgan bo'lsa yopiladi", () => {
    // Direktor "menga kerak emas" desa, admin uni matritsadan o'chiradi.
    expect(canDirectorCockpit("admin", ["cockpit"])).toBe(false);
    expect(canDirectorCockpit("super_admin", [])).toBe(false);
  });
});

describe("ro'yxatga to'g'ri qo'shilgan", () => {
  it("ALL_VIEWS da bor — admin matritsasida ko'rinadi", () => {
    expect(ALL_VIEWS).toContain("director_cockpit");
  });

  it("yorlig'i bor — matritsada kalit emas, nom ko'rinadi", () => {
    expect(VIEW_LABELS.director_cockpit).toBeTruthy();
  });

  it("mavjud `cockpit` ko'rinishi TEGILMAGAN — orqaga mos", () => {
    // Yangi ko'rinish qo'shildi, eskisi o'chirilmadi: nazoratchi va bosh
    // buxgalter ish oqimini avvalgidek ko'radi.
    expect(ALL_VIEWS).toContain("cockpit");
    expect(viewsOf("supervisor")).toContain("cockpit");
    expect(viewsOf("chief_accountant")).toContain("cockpit");
  });
});
