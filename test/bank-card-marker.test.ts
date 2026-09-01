/**
 * KARTA BELGISI — 16 raqamli karta ≠ 20 xonali hisob raqami.
 *
 * 2026-09-01 tahlilida bu farq bo'yicha xato qilindi: "maqsadda 16 raqam
 * bormi" degan qidiruv (`\d{16}`) 20 xonali HISOB RAQAMINING ichiga ham
 * tushdi va 53 ta bank komissiyasidan 47 tasi "kartaga o'tkazma" bo'lib
 * ko'rindi. Shu asosda "toifalagich buzuq" degan noto'g'ri xulosa chiqdi.
 *
 * `extractCardTransfer` boshidan to'g'ri ishlagan: u `~` bilan ajratilgan
 * AYNAN 16 raqamli bo'lakni qidiradi. Bu test o'sha farqni qotiradi.
 */
import { describe, it, expect } from "vitest";
import { extractCardTransfer, classifyExpense } from "@/lib/bank/classifyExpense";

const KOMISSIYA =
  "00667Комиссия за операционное обслуживание счета 20208000005723186001 за 21.08.2026";
const KARTA = "00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение карты 07.01.2026";

describe("extractCardTransfer", () => {
  it("hisob raqamini karta deb o'qimaydi", () => {
    expect(extractCardTransfer(KOMISSIYA)).toBeNull();
  });

  it("haqiqiy karta raqamini niqoblab qaytaradi", () => {
    const res = extractCardTransfer(KARTA);
    expect(res).not.toBeNull();
    expect(res!.cardMask).toBe("8600****4957");
    expect(res!.holderName).toBe("UCHQUN AZIMBOYEV COO");
  });

  it("to'liq karta raqamini QAYTARMAYDI", () => {
    expect(JSON.stringify(extractCardTransfer(KARTA))).not.toContain("8600492970804957");
  });
});

describe("classifyExpense — chalkashadigan holatlar", () => {
  const base = { counterpartyName: null, counterpartyInn: null };

  it("hisob raqami bor komissiyani komissiya deb qoldiradi", () => {
    expect(classifyExpense({ ...base, purpose: KOMISSIYA })).toBe("bank_komissiya");
  });

  it("karta to'ldirishni soliq deb yozmaydi", () => {
    // Karta to'ldirish izohida soliq organi tilga olinadi — shu sababdan
    // karta qoidasi soliqdan OLDIN turishi shart.
    expect(
      classifyExpense({
        ...base,
        purpose:
          "00634~8600492970804957~UCHQUN AZIMBOYEV~Пополнение карты узини узи банд килган шахс ДАВЛАТ СОЛИК ХИЗМАТИ",
      })
    ).toBe("xodim_kartasi");
  });

  it("o'z firmamizga o'tkazma matndan qat'i nazar ichki o'tkazma", () => {
    expect(
      classifyExpense({
        purpose: "оплата за аренду",
        counterpartyName: 'ООО "BAROKAT TEAM"',
        counterpartyInn: "304868808",
        ownFirmInns: new Set(["304868808"]),
      })
    ).toBe("ichki_otkazma");
  });
});
