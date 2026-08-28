import { describe, it, expect } from "vitest";
import { classifySettlement, parseMoney, parseDetailDate, defaultInScope, settlementSign } from "./classifySettlement";

// Matnlar REAL vipiskalardan olingan (Ipoteka-bank 20208 va Ipak yo'li 23510).
// Ular o'zgarmaydi — shuning uchun aynan shu shakl bilan tekshiriladi.

describe("parseMoney — bank formatlari aralash", () => {
  it("vergul ming ajratgich", () => expect(parseMoney("4,200,000.00")).toBe(4200000));
  it("bo'sh joy ming ajratgich, nuqta kasr", () => expect(parseMoney("121 860 500.00")).toBe(121860500));
  it("bo'sh joy ming ajratgich, vergul kasr", () => expect(parseMoney("20 216 000,00")).toBe(20216000));
  it("kichik summa vergul bilan", () => expect(parseMoney("42,000.00")).toBe(42000));
  it("toza son", () => expect(parseMoney("29500500.00")).toBe(29500500));
  it("bo'sh qiymat null", () => expect(parseMoney("")).toBeNull());
});

describe("parseDetailDate", () => {
  it("kun.oy.yil", () => expect(parseDetailDate("31.12.2024")).toEqual(new Date(Date.UTC(2024, 11, 31))));
  it("ikki xonali yil", () => expect(parseDetailDate("03.01.25")).toEqual(new Date(Date.UTC(2025, 0, 3))));
  it("Payme shakli", () => expect(parseDetailDate("31-07-2026")).toEqual(new Date(Date.UTC(2026, 6, 31))));
  it("Multicard shakli", () => expect(parseDetailDate("2026-07-30")).toEqual(new Date(Date.UTC(2026, 6, 30))));
  it("yaroqsiz oy null", () => expect(parseDetailDate("31.13.2024")).toBeNull());
});

describe("HUMO terminali — yalpi va komissiya matnda ochiq", () => {
  const p =
    "МФО:00419 Счет:23508000905166775201 ИНН:307058508 Юридик шахсларга ажратилган терминаллар-HUMO 00634 " +
    "HUMO:Перечисление на счет клиента инкассированной выручки за 03.08.2026 Терминал 0111953L " +
    "На общую сумму:4,200,000.00, в том числе комиссия:42,000.00";
  const r = classifySettlement(p);
  it("kanal", () => expect(r.channel).toBe("humo"));
  it("terminal", () => expect(r.terminalCode).toBe("HUMO 0111953L"));
  it("savdo sanasi tafsilotdan", () => expect(r.opDate).toEqual(new Date(Date.UTC(2026, 7, 3))));
  it("yalpi summa", () => expect(r.grossAmount).toBe(4200000));
  it("komissiya 1%", () => expect(r.commissionAmount).toBe(42000));
});

describe("HUMO EPOS — 'на сумму' SOF summa, yalpi emas", () => {
  const p =
    "INTEST MAX 00634 Возмещение клиенту по покупкам ТСП договор N ``№EK-01 01.02.2023 humo`` " +
    "Устр-во EPOS № 19610FZO с учетом транзакций за 03.08.2026, 04.08.2026, 05.08.2026 " +
    "покупок за вычетом комиссий на сумму 89 466 001.00 UZS сумма комиссии 894 660.01 UZS";
  const r = classifySettlement(p);
  it("kanal", () => expect(r.channel).toBe("humo_epos"));
  it("terminal", () => expect(r.terminalCode).toBe("EPOS 19610FZO"));
  it("bir nechta sanadan OXIRGISI olinadi", () =>
    expect(r.opDate).toEqual(new Date(Date.UTC(2026, 7, 5))));
  it("yalpi = sof + komissiya", () => expect(r.grossAmount).toBeCloseTo(90360661.01, 2));
});

describe("UZCARD 20208 — tafsilotda sana YO'Q", () => {
  const p =
    'МФО:00419 Счет:23508000005166775002 ИНН:307058508 "INTEST MAX" Масулияти чекланган жамияти ' +
    "00667 Терминал савдо тушуми 100% от сальдо 15550000 ID=100113154";
  const r = classifySettlement(p);
  it("kanal", () => expect(r.channel).toBe("uzcard"));
  it("terminal kodi ID bo'yicha", () => expect(r.terminalCode).toBe("UZCARD 100113154"));
  it("ID bo'lmasa hisobvaraq oxiri zaxira sifatida ishlatiladi", () =>
    expect(
      classifySettlement('Счет:23508000005166775002 Терминал савдо тушуми 100% от сальдо 500000').terminalCode,
    ).toBe("UZCARD 775002"));
  it("sana yo'q — chaqiruvchi hujjat sanasini qo'yadi", () => expect(r.opDate).toBeNull());
  it("100% — komissiya ushlanmagan", () => expect(r.commissionAmount).toBe(0));
});

describe("UZCARD 23510 — transit hisobvaraq, tafsilotda sana bor", () => {
  const p =
    "00634UnionPayРасчеты со своими торгово сервисными предприятиями при оплате с участием " +
    "карточек других банков тер:ТЕР:50219; за 31.12.2024";
  const r = classifySettlement(p);
  it("kanal", () => expect(r.channel).toBe("uzcard"));
  it("terminal", () => expect(r.terminalCode).toBe("UZCARD 50219"));
  it("savdo sanasi", () => expect(r.opDate).toEqual(new Date(Date.UTC(2024, 11, 31))));
});

describe("Multicard — komissiya aynan 0,2%", () => {
  const p =
    "MULTICARD PAYMENT AJ транз счет для расчета с мерч 00634Выручка по POS (TerminalID 24E11N7B) " +
    "за 2026-07-30 на сумму 1 050 000,00 сум. Удержанная комиссия: 2 100,00 сум";
  const r = classifySettlement(p);
  it("terminal", () => expect(r.terminalCode).toBe("MULTICARD 24E11N7B"));
  it("sana", () => expect(r.opDate).toEqual(new Date(Date.UTC(2026, 6, 30))));
  it("yalpi", () => expect(r.grossAmount).toBe(1050000));
  it("komissiya", () => expect(r.commissionAmount).toBe(2100));
});

describe("Onlayn kanallar", () => {
  it("Payme — karta turi bo'yicha ajraladi", () => {
    const r = classifySettlement(
      'Транзитный счёт для рассчёта с коммерсантами (Payme) 00634Зачисление денежных средств поставщику "INTEST MAX" ' +
        "MCHJ (ИНН: 307058508) от PAYME за 31-07-2026 за услуги или товары через UZCARD. С автоудержанем (Без оплат) 1% с пользователя",
    );
    expect(r.channel).toBe("payme");
    expect(r.terminalCode).toBe("PAYME UZCARD");
    expect(r.opDate).toEqual(new Date(Date.UTC(2026, 6, 31)));
  });
  it("Click — sotuv summasi matnda", () => {
    const r = classifySettlement(
      "AO CLICK 00111Оплата за товары, услуги за 31.07.2026 по сервису №30406 Оплата за услуги Inter Nation " +
        "cог-но дог.№BI/D 4157 от 2023-11-10 через Click. Сумма продаж 29500500.00 сум.",
    );
    expect(r.channel).toBe("click");
    expect(r.terminalCode).toBe("CLICK 30406");
    expect(r.grossAmount).toBe(29500500);
  });
  it("Paynet — shartnoma sanasi savdo sanasi deb olinmaydi", () => {
    const r = classifySettlement(
      "АO PAYNET 00111Оплата 100 % прин. плат. за услуги INTER NATION, INTER NATION (mobile) за 31.07.2026 " +
        "Сог дог. S-2075 от 17.12.2024",
    );
    expect(r.channel).toBe("paynet");
    expect(r.opDate).toEqual(new Date(Date.UTC(2026, 6, 31)));
  });
});

describe("Bekor qilingan operatsiyalar", () => {
  it("Отмена операции — bekor deb belgilanadi", () => {
    const r = classifySettlement(
      "00634UnionPay Отмена операции (Расчеты со своими торгово сервисными предприятиями при оплате " +
        "с участием карточек других банков тер:ТЕР:50219;) за17.05.2025",
    );
    expect(r.isReversal).toBe(true);
  });
  it("o'z-o'zini yopadigan reversal juftligi doiraga kirmaydi", () => {
    const r = classifySettlement(
      "00634HUMO:(80606_17118LGA) Взаиморасчеты по операциям (reversal) c ПК другого банка (МежБанк): 98603501***0784",
    );
    expect(r.channel).toBe("other");
    expect(r.isReversal).toBe(true);
  });
});

describe("defaultInScope — EPOS va onlayn odam tasdig'ini kutadi", () => {
  it("POS terminallari sukut bo'yicha doirada", () => {
    expect(defaultInScope("uzcard")).toBe(true);
    expect(defaultInScope("humo")).toBe(true);
    expect(defaultInScope("multicard")).toBe(true);
  });
  it("EPOS va onlayn tizimlar doiradan tashqarida", () => {
    expect(defaultInScope("humo_epos")).toBe(false);
    expect(defaultInScope("payme")).toBe(false);
    expect(defaultInScope("click")).toBe(false);
    expect(defaultInScope("other")).toBe(false);
  });
});

describe("settlementSign — bitta bekor qilish faqat BIR MARTA kamaytiradi", () => {
  const income = classifySettlement("00634UnionPayРасчеты со своими ТСП тер:ТЕР:50219; за 31.12.2024");
  const revDebit = classifySettlement(
    "00634UnionPay Отмена операции (Расчеты со своими ТСП тер:ТЕР:50219;) за17.05.2025",
  );
  const revCommission = classifySettlement(
    "00634UnionPay Отмена операции (Комиссия банка за обработку транзакций ТСП тер:ТЕР:50219;) за17.05.2025",
  );
  it("oddiy tushum — plus", () => expect(settlementSign("income", income)).toBe(1));
  it("tushum stornosi (debet) — minus", () => expect(settlementSign("expense", revDebit)).toBe(-1));
  it("komissiya stornosi (kredit) HISOBGA OLINMAYDI", () =>
    expect(settlementSign("income", revCommission)).toBe(0));
  it("oddiy chiqim (komissiya, o'tkazma) hisobga olinmaydi", () =>
    expect(settlementSign("expense", income)).toBe(0));
  it("tanilmagan kanal hech qachon kirmaydi", () =>
    expect(settlementSign("income", classifySettlement("boshqa to'lov"))).toBe(0));
});

describe("kanal nomi kontragent ustunida bo'lsa ham tanilishi kerak", () => {
  // Ba'zi parserlar kontragent nomini to'lov maqsadidan ajratib oladi —
  // o'shanda "MULTICARD" / "AO CLICK" so'zi maqsadda umuman qolmaydi.
  it("Multicard kontragent nomidan", () => {
    const r = classifySettlement(
      "Выручка по POS (TerminalID 24E11N7B) за 2026-07-30 на сумму 1 050 000,00 сум. Удержанная комиссия: 2 100,00 сум",
      "MULTICARD PAYMENT AJ транз счет для расчета с мерч",
    );
    expect(r.channel).toBe("multicard");
    expect(r.terminalCode).toBe("MULTICARD 24E11N7B");
  });
  it("Click kontragent nomidan", () => {
    const r = classifySettlement(
      "Оплата за товары, услуги за 31.07.2026 по сервису №30406 через Click. Сумма продаж 29500500.00 сум.",
      "AO CLICK",
    );
    expect(r.channel).toBe("click");
  });
  it("UZCARD kodi ID bo'yicha barqaror", () => {
    const r = classifySettlement("Терминал савдо тушуми 100% от сальдо 15550000 ID=100113154", "INTEST MAX");
    expect(r.terminalCode).toBe("UZCARD 100113154");
  });
});
