import { describe, it, expect } from "vitest";
import { BASE_REPORT_COLUMNS } from "./reportColumns";
import {
  COL_KEY_TO_TEMPLATE_CODES,
  UNMAPPED_TEMPLATE_CODES,
  cellValueToStatus,
} from "./obligationBridge";

/**
 * MATRITSA KATAGI → MAJBURIYAT ZANJIRI
 *
 * Bu ko'prik JIM ishlaydi: mos shablon topilmasa hech qanday xato bermay
 * o'tib ketadi (matritsada majburiyatsiz ustunlar bor va bu normal). Aynan shu
 * sabab uzilishi bilinmasdi — auditda uchta mapping YO'Q ustunga ishora qilib
 * turgani aniqlandi:
 *
 *   "qqs" → QQS_DECL          — o'shanda bunday ustun yo'q edi
 *   "aylanma_soliq" → …       — bunday ustun yo'q
 *   "payroll_posted" → …      — bunday ustun yo'q
 *
 * Ya'ni QQS deklaratsiyasi ham, aylanma soliq ham matritsadan HECH QACHON
 * harakatlanmagan: buxgalter katakni belgilagan, majburiyat esa "kechikkan"
 * bo'lib qolavergan. Test shu sinfdagi xatoni qaytib kelishiga yo'l qo'ymaydi.
 *
 * 2026-08: "aylanma_qqs" ustuni `qqs` va `aylanma` ga bo'lindi, ya'ni yuqoridagi
 * birinchi qator endi haqiqiy ustunga ishora qiladi.
 */

const matrixKeys = new Set<string>();
for (const c of BASE_REPORT_COLUMNS as ReadonlyArray<{ key: string; payKey?: string }>) {
  matrixKeys.add(c.key);
  if (c.payKey) matrixKeys.add(c.payKey);
}

describe("matritsa → majburiyat mappingi", () => {
  it("har bir bog'langan kalit HAQIQIY matritsa ustuni", () => {
    const unknown = Object.keys(COL_KEY_TO_TEMPLATE_CODES).filter((k) => !matrixKeys.has(k));
    expect(unknown).toEqual([]);
  });

  it("har bir ustunda kamida bitta shablon kodi bor", () => {
    const empty = Object.entries(COL_KEY_TO_TEMPLATE_CODES)
      .filter(([, codes]) => !codes.length)
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("bitta shablon ikki xil ustunga bog'lanmagan", () => {
    // Aks holda qaysi katak majburiyatni harakatga keltirishi noaniq bo'lardi
    // va ikkita ustun bir-birining holatini bosib yozardi.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [colKey, codes] of Object.entries(COL_KEY_TO_TEMPLATE_CODES)) {
      for (const code of codes) {
        const prev = seen.get(code);
        if (prev) clashes.push(`${code}: ${prev} va ${colKey}`);
        else seen.set(code, colKey);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("ataylab bog'lanmagan shablonlar mapping'da qatnashmaydi", () => {
    const mapped = new Set(Object.values(COL_KEY_TO_TEMPLATE_CODES).flat());
    const contradictions = Object.keys(UNMAPPED_TEMPLATE_CODES).filter((c) => mapped.has(c));
    expect(contradictions).toEqual([]);
  });

  /**
   * 2026-08: "Aylanma/QQS" ustuni IKKIGA bo'lindi. Endi har ustun bitta
   * shablonga bog'lanadi — birlashgan holatda maxraj "QQS to'lovchilar +
   * aylanma rejimidagilar" bo'lib, foiz ikki xil majburiyatni aralashtirardi.
   */
  it("QQS va aylanma ustunlari o'z shabloniga bog'langan", () => {
    expect(COL_KEY_TO_TEMPLATE_CODES.qqs).toEqual(["QQS_DECL"]);
    expect(COL_KEY_TO_TEMPLATE_CODES.aylanma).toEqual(["AYLANMA_SOLIQ"]);
  });

  /**
   * TO'LOV YARMI HAM BOG'LANGAN BO'LISHI SHART.
   *
   * Bu tekshiruv 7-NINE dagi shikoyatdan keyin qo'shildi: "QQS to'lov"
   * katagi ishlamayotgandek ko'rinardi, chunki uning ortida majburiyat yo'q
   * edi — muddat "Ishlar"ga chiqmasdi, foizga kirmasdi. Bo'linadigan ustun
   * qo'shilib, `payKey` bog'lanmay qolsa, shu test yiqiladi.
   */
  it("bo'linadigan ustunning TO'LOV yarmi ham shablonga bog'langan", () => {
    const unlinked = (BASE_REPORT_COLUMNS as ReadonlyArray<{ payKey?: string }>)
      .map((c) => c.payKey)
      .filter((k): k is string => !!k)
      .filter((k) => !COL_KEY_TO_TEMPLATE_CODES[k]?.length);
    expect(unlinked).toEqual([]);
  });

  it("birlashgan eski kalit endi mapping'da yo'q", () => {
    // Qolib ketsa, o'chirilgan ustun uchun maxraj hisoblanaverardi.
    expect(COL_KEY_TO_TEMPLATE_CODES.aylanma_qqs).toBeUndefined();
  });
});

describe("katak qiymati → majburiyat holati", () => {
  it("nazoratchi tasdig'i qabul qilingan holatga o'tadi", () => {
    expect(cellValueToStatus("+")).toBe("accepted");
  });

  it("topshirildi → yuborilgan", () => {
    expect(cellValueToStatus("topshirildi")).toBe("sent");
  });

  it("nol hisobot ham yuborilgan — 'topshirildi' bilan bir xil", () => {
    // Regressiya: 'nol' hech qayerda ushlanmasdi va oxirgi "erkin matn"
    // tarmog'iga tushib `in_progress` qaytarardi. Natijada nol deklaratsiya
    // topshirgan buxgalterning majburiyati ochiq qolib, u muddati o'tgan ish
    // uchun ogohlantirish olishda davom etardi.
    expect(cellValueToStatus("nol")).toBe("sent");
    expect(cellValueToStatus("nol")).not.toBe("in_progress");
  });

  it("nol hisobot majburiyatni O'ZI YOPMAYDI (self-approval bloki)", () => {
    // `allowedCellActions` da 'nol' buxgalterga ochiq. Uni `accepted` ga
    // bog'lasak, buxgalter nazoratchisiz o'z ishini yopib qo'yardi.
    expect(cellValueToStatus("nol")).not.toBe("accepted");
  });

  it("minus → rad etilgan", () => {
    expect(cellValueToStatus("-")).toBe("rejected");
  });

  it("bo'sh va nol katak majburiyatni ortga qaytaradi", () => {
    expect(cellValueToStatus("")).toBe("planned");
    expect(cellValueToStatus("0")).toBe("planned");
    expect(cellValueToStatus(null)).toBe("planned");
  });

  it("kartoteka holatga TEGMAYDI", () => {
    // Kartoteka — to'lov topshirig'i bankda turgani, hisobot holati emas.
    // Uni holatga aylantirsak to'lov muammosi KPI'da hisobot kechikishi
    // bo'lib ko'rinardi.
    expect(cellValueToStatus("kartoteka")).toBeNull();
  });

  it("erkin matn (sana, izoh) ish boshlangani deb o'qiladi", () => {
    expect(cellValueToStatus("20.07")).toBe("in_progress");
    expect(cellValueToStatus("mijozdan hujjat kutilmoqda")).toBe("in_progress");
  });
});
