// Sof (DB'siz) test: bank vipiskasi parserlari.
//
// Fixture'lar real 07.2026 vipiskalaridan olingan, lekin FAYLGA BOG'LIQ EMAS —
// `cash_json_files/` git'da kuzatilmaydi, shuning uchun testlar undan mustaqil
// ishlashi kerak. Papka mavjud bo'lsa, oxirida qo'shimcha "haqiqiy fayl"
// tekshiruvi ham bajariladi.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseStatementRows, parseWorkbook, transactionHash } from "@/lib/bank/parseStatement";
import { BankStatementParseError } from "@/lib/bank/types";
import { extractContract, parseContractCell } from "@/lib/bank/extractContract";
import {
  classifyExpense,
  extractCardTransfer,
  isPostableExpense,
} from "@/lib/bank/classifyExpense";
import { toAmount, toDate, extractInn, extractAccount, looksLikeDate } from "@/lib/bank/normalize";
import { parsePlastikFile } from "@/lib/bank/parsePlastik";
import { looksLikeHtml, decodeHtml, readHtmlTables } from "@/lib/bank/readHtmlTables";

// ── FORMAT A: "Лицевой счет" — bitta tranzaksiya 3-4 qatorda ──────────────
const D = "01 августа 2026 г. 12:10";
const litsevoyRows = [
  { [D]: "Лицевой счет No 20208000600767792001", __EMPTY: null, __EMPTY_1: null, "Выписка": null, __EMPTY_2: null, __EMPTY_3: null },
  { [D]: "Клиент: 00767792 ИНН: 304868808", __EMPTY: null, __EMPTY_1: null, "Выписка": null, __EMPTY_2: null, __EMPTY_3: null },
  { [D]: 'ООО "BAROKAT TEAM"', __EMPTY: null, __EMPTY_1: null, "Выписка": null, __EMPTY_2: null, __EMPTY_3: null },
  { [D]: "Период выписки с 01.07.2026 по 31.07.2026", __EMPTY: null, __EMPTY_1: null, "Выписка": null, __EMPTY_2: null, __EMPTY_3: null },
  { [D]: "Входящий остаток за 01.07.2026", __EMPTY: null, __EMPTY_1: null, "Выписка": null, __EMPTY_2: "1,183,896.25", __EMPTY_3: null },
  { [D]: "Дата/время", __EMPTY: "Номер документа", __EMPTY_1: "Оп", "Выписка": "Корреспондент", __EMPTY_2: "Дебет", __EMPTY_3: "Кредит" },
  { [D]: "проводки", __EMPTY: null, __EMPTY_1: null, "Выписка": "Наименование", __EMPTY_2: null, __EMPTY_3: null },
  { [D]: null, __EMPTY: null, __EMPTY_1: null, "Выписка": "Назначение платежа", __EMPTY_2: null, __EMPTY_3: null },
  // 1-tranzaksiya — KIRIM
  { [D]: "02.07.2026", __EMPTY: "20", __EMPTY_1: "21", "Выписка": "МФО:00440 Счет:20208000400243219001 ИНН:207189989", __EMPTY_2: 0, __EMPTY_3: "1,000,000.00" },
  { [D]: "12:27:34", __EMPTY: null, __EMPTY_1: null, "Выписка": 'ООО "MAGISTRAL TRANS QURILISH"', __EMPTY_2: null, __EMPTY_3: null },
  { [D]: null, __EMPTY: null, __EMPTY_1: null, "Выписка": "00111оплата за бух услуги сог дог №02/26БК от 05.01.2026г", __EMPTY_2: null, __EMPTY_3: null },
  // 2-tranzaksiya — CHIQIM (karta to'ldirish)
  { [D]: "06.07.2026", __EMPTY: "3920208163", __EMPTY_1: "21", "Выписка": "МФО:01158 Счет:23120000700001158008 ИНН:207275139", __EMPTY_2: "5,040,000.00", __EMPTY_3: 0 },
  { [D]: "10:00:00", __EMPTY: null, __EMPTY_1: null, "Выписка": '"КАПИТАЛБАНК" АТ', __EMPTY_2: null, __EMPTY_3: null },
  { [D]: null, __EMPTY: null, __EMPTY_1: null, "Выписка": "00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение карты 07.01.2026 йилдаги узини узи банд килган шахс", __EMPTY_2: null, __EMPTY_3: null },
];

// ── FORMAT B: "Сведения о работе счета" — bitta qator = bitta tranzaksiya ──
const B = "00083 / HAMKORBANK";
const svedeniyaRows = [
  { [B]: "Сведения о работе счета c 01.07.2026 по 31.07.2026", "ABS": null, __EMPTY: null, __EMPTY_1: null, __EMPTY_2: null, __EMPTY_3: null, __EMPTY_4: null, __EMPTY_5: null },
  { [B]: "Cчет: 20208000905169375001          MOLIYA AI XK          ИНН : 307077420", "ABS": null, __EMPTY: null, __EMPTY_1: null, __EMPTY_2: null, __EMPTY_3: null, __EMPTY_4: null, __EMPTY_5: null },
  { [B]: "Остаток на начало периода: 308 826.49", "ABS": "Остаток на конец периода: 529 619.29", __EMPTY: null, __EMPTY_1: null, __EMPTY_2: null, __EMPTY_3: null, __EMPTY_4: null, __EMPTY_5: null },
  { [B]: "Дата", "ABS": "Cчет/ИНН", __EMPTY: "№ док", __EMPTY_1: "Оп", __EMPTY_2: "МФО", __EMPTY_3: "Оборот Дебет", __EMPTY_4: "Оборот Кредит", __EMPTY_5: "Назначение платежа" },
  { [B]: 46211.700520833336, "ABS": '20208000805596161002/310079710/"RAHMATJON-HALOL-MARKET" MCHJ', __EMPTY: 5045, __EMPTY_1: 4, __EMPTY_2: "00083", __EMPTY_3: null, __EMPTY_4: 15000000, __EMPTY_5: "00664 оплата за бух услуги за июнь 2026г согласно договору № 08/26БК от 05.01.2026 г." },
  { [B]: 46213.55803240741, "ABS": "22628000700011580999/200946011/Чирчик шахар ДСИ", __EMPTY: 36, __EMPTY_1: 1, __EMPTY_2: "01125", __EMPTY_3: 15252, __EMPTY_4: null, __EMPTY_5: "08101 101 Фукароларнинг пенсия бадалига ажратма $TAX_ID$26191002066775" },
];

describe("normalize", () => {
  it("vergulli matn summani songa aylantiradi", () => {
    expect(toAmount("1,000,000.00")).toBe(1_000_000);
    expect(toAmount("1,183,896.25")).toBe(1_183_896.25);
    expect(toAmount("308 826.49")).toBe(308_826.49);
    expect(toAmount(15_000_000)).toBe(15_000_000);
    expect(toAmount(0)).toBe(0);
    expect(toAmount(null)).toBe(0);
    expect(toAmount("")).toBe(0);
  });

  it("kasr vergul bilan yozilgan summani ham tushunadi", () => {
    expect(toAmount("9 500 000,00")).toBe(9_500_000);
  });

  it("ikkala sana ko'rinishini o'qiydi", () => {
    expect(toDate("02.07.2026")?.toISOString().slice(0, 10)).toBe("2026-07-02");
    // Excel serial (Format B). 46211 → 08.07.2026 — vipiska davri (01–31.07.2026)
    // ichida; kasr qismi (soat) ATAYIN tashlanadi.
    expect(toDate(46211.700520833336)?.toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(toDate(46213.55803240741)?.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(toDate("salom")).toBeNull();
    expect(toDate(null)).toBeNull();
  });

  it("STIR va hisob raqamini ajratadi", () => {
    expect(extractInn("МФО:00440 Счет:20208000400243219001 ИНН:207189989")).toBe("207189989");
    expect(extractInn("Клиент: 00767792 ИНН: 304868808")).toBe("304868808");
    expect(extractInn("ИНН : 307077420")).toBe("307077420");
    expect(extractAccount("Лицевой счет No 20208000600767792001")).toBe("20208000600767792001");
  });
});

describe("Format A — Лицевой счет", () => {
  const parsed = parseStatementRows(litsevoyRows);

  it("formatni to'g'ri aniqlaydi", () => {
    expect(parsed.format).toBe("litsevoy");
  });

  it("sarlavhadan hisob ma'lumotini oladi", () => {
    expect(parsed.accountNumber).toBe("20208000600767792001");
    expect(parsed.accountInn).toBe("304868808");
    expect(parsed.holderName).toContain("BAROKAT TEAM");
    expect(parsed.periodFrom?.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(parsed.periodTo?.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(parsed.openingBalance).toBe(1_183_896.25);
  });

  it("3 qatorli tranzaksiyani bitta yozuvga yig'adi", () => {
    expect(parsed.transactions).toHaveLength(2);
    const [income] = parsed.transactions;
    expect(income.direction).toBe("income");
    expect(income.amount).toBe(1_000_000);
    expect(income.valueDate.toISOString().slice(0, 10)).toBe("2026-07-02");
    expect(income.docNumber).toBe("20");
    expect(income.counterpartyInn).toBe("207189989");
    expect(income.counterpartyName).toContain("MAGISTRAL TRANS QURILISH");
    expect(income.purpose).toContain("02/26БК");
  });

  it("Дебет ustunini chiqim deb o'qiydi", () => {
    const expense = parsed.transactions[1];
    expect(expense.direction).toBe("expense");
    expect(expense.amount).toBe(5_040_000);
  });

  it("sarlavha qatori bo'lmasa aniq xato beradi", () => {
    expect(() => parseStatementRows([{ a: "salom", b: null, c: null, d: null, e: null, f: null }])).toThrow(
      BankStatementParseError
    );
  });
});

describe("Format B — Сведения о работе счета", () => {
  const parsed = parseStatementRows(svedeniyaRows);

  it("formatni to'g'ri aniqlaydi", () => {
    expect(parsed.format).toBe("svedeniya");
  });

  it("sarlavhadan hisob, davr va qoldiqlarni oladi", () => {
    expect(parsed.accountNumber).toBe("20208000905169375001");
    expect(parsed.accountInn).toBe("307077420");
    expect(parsed.holderName).toContain("MOLIYA AI");
    expect(parsed.openingBalance).toBe(308_826.49);
    expect(parsed.closingBalance).toBe(529_619.29);
  });

  it("Excel serial sanani va slesh bilan yozilgan kontragentni o'qiydi", () => {
    const [income] = parsed.transactions;
    expect(income.direction).toBe("income");
    expect(income.amount).toBe(15_000_000);
    expect(income.counterpartyInn).toBe("310079710");
    expect(income.counterpartyAccount).toBe("20208000805596161002");
    expect(income.counterpartyName).toContain("RAHMATJON");
  });

  it("Дебет qatorini chiqim deb o'qiydi", () => {
    const expense = parsed.transactions[1];
    expect(expense.direction).toBe("expense");
    expect(expense.amount).toBe(15_252);
    expect(expense.counterpartyName).toContain("ДСИ");
  });
});

describe("parseWorkbook", () => {
  it("sahifa nomidan qat'i nazar mazmun bo'yicha topadi", () => {
    expect(parseWorkbook({ "1785568242542": litsevoyRows }).format).toBe("litsevoy");
    expect(parseWorkbook({ "CBreport21": svedeniyaRows }).format).toBe("svedeniya");
  });

  it("tanilmagan faylni JIM YUTMAYDI", () => {
    // Bo'sh natija qaytarish eng yomoni bo'lardi: foydalanuvchi faylni bo'sh
    // deb o'ylaydi, aslida format tanilmagan bo'ladi.
    expect(() => parseWorkbook({ Sheet1: [{ a: 1, b: 2 }] })).toThrow(BankStatementParseError);
    expect(() => parseWorkbook({})).toThrow(BankStatementParseError);
  });
});

describe("transactionHash", () => {
  const base = {
    accountNumber: "20208000600767792001",
    valueDate: new Date(Date.UTC(2026, 6, 2)),
    docNumber: "20",
    amount: 1_000_000,
    direction: "income",
    purpose: "оплата за бух услуги",
  };

  it("bir xil tranzaksiya uchun bir xil hash (qayta yuklash dublikat yaratmaydi)", () => {
    expect(transactionHash(base)).toBe(transactionHash({ ...base }));
  });

  it("har bir maydon o'zgarsa hash o'zgaradi", () => {
    const h = transactionHash(base);
    expect(transactionHash({ ...base, amount: 1_000_001 })).not.toBe(h);
    expect(transactionHash({ ...base, docNumber: "21" })).not.toBe(h);
    expect(transactionHash({ ...base, direction: "expense" })).not.toBe(h);
    expect(transactionHash({ ...base, valueDate: new Date(Date.UTC(2026, 6, 3)) })).not.toBe(h);
  });
});

describe("extractContract", () => {
  const cases: [string, string | null][] = [
    ["00111оплата за бух услуги сог дог №02/26БК от 05.01.2026г", "02/26БК"],
    ["00111бух услуги согл дог №12/26БК от 05.01.26г", "12/26БК"],
    ["00664 согласно договору № 08/26БК от 05.01.2026 г.", "08/26БК"],
    ["00111 согл. к договору №18/26БК от 05.01.2026", "18/26БК"],
    ["0011100111 за бух услуги по дог-у № 05/БК от 03.01.2025г", "05/БК"],
    ["00111бугалтерия услуги дог 11/БК 03 01 2024", "11/БК"],
    ["00111~за бухгалтерские услуги Дог 19/26БК от 03.01.2026", "19/26БК"],
    ["00659~оплата за фин займ сог дог №1 от 15.04.2026г", "1"],
    ["00111~оплата за аренду по дог-у № 7 от 26.12.2025г.", "7"],
    ["00111Оплата сог дог №-33/26БК от 01.05.2026г", "33/26БК"],
    ["00111~Оплата сог дог №№03/26БК от 05.01.2026г", "03/26БК"],
    // O'zbekcha so'z tartibi — raqam kalit so'zdan OLDIN
    ["0011101.03.2026 йил №15/26БК шартномага асосан", "15/26БК"],
    ["00111 01.04.24 йилдаги 13/БК сонли шартномага асосан", "13/БК"],
    ["00104 7- сонли шартномага асосан бухгалтерия хизматлари учун", "7"],
    // Shartnomasiz to'lovlar
    ["08101 101 Фукароларнинг пенсия бадалига ажратма", null],
    ["00634~8600492970804957~Пополнение карты", null],
    ["", null],
  ];

  for (const [purpose, expected] of cases) {
    it(`"${purpose.slice(0, 45)}" → ${JSON.stringify(expected)}`, () => {
      expect(extractContract(purpose)?.number ?? null).toBe(expected);
    });
  }

  it("bir nechta № bo'lsa SHARTNOMA raqamini oladi, vedomost raqamini emas", () => {
    // 14/БК — shartnoma, №1 — oylik vedomosti.
    const r = extractContract("00664оплата по дог-у №14/БК от 03.01.2025г З/П,№1 от 30.04.2026");
    expect(r?.number).toBe("14/БК");
  });

  it("shartnoma sanasini oladi, 2 raqamli yilni to'ldiradi", () => {
    expect(extractContract("сог дог №02/26БК от 05.01.2026г")?.signedAt?.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(extractContract("согл дог №12/26БК от 05.01.26г")?.signedAt?.toISOString().slice(0, 10)).toBe("2026-01-05");
  });

  it("1C reestr katagini xuddi shu ko'rinishga keltiradi", () => {
    expect(parseContractCell("№11/26БК от 05.01.2026")).toEqual({
      number: "11/26БК",
      signedAt: new Date(Date.UTC(2026, 0, 5)),
    });
    expect(parseContractCell("№02/К от 03.01.2026")?.number).toBe("02/К");
    expect(parseContractCell(null)).toBeNull();
    expect(parseContractCell("")).toBeNull();
  });

  it("vipiska va 1C reestridan chiqqan raqam bir xil bo'ladi", () => {
    const fromBank = extractContract("00111оплата сог дог №11/26БК от 05.01.2026г")?.number;
    const fromRegistry = parseContractCell("№11/26БК от 05.01.2026")?.number;
    expect(fromBank).toBe(fromRegistry);
  });
});

describe("classifyExpense", () => {
  const own = new Set(["304868808", "309850241"]);

  it("soliq to'lovini tanidi", () => {
    expect(
      classifyExpense({
        purpose: "08101~2001108600274193212120093~36 Ижтимоий солик учун олдиндан тулов $TAX_ID$26195008133969",
        counterpartyName: "Узбекистон Республикаси Молия вазирлиги Газначилиги",
        counterpartyInn: "201122919",
      })
    ).toBe("soliq");
  });

  it("karta to'ldirishni soliqdan ajratadi", () => {
    // Karta izohida "давлат солик хизмати" tilga olinadi — soliq qoidasi
    // oldin tursa, bu pul xato toifaga tushardi.
    expect(
      classifyExpense({
        purpose:
          "00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение карты 07.01.2026 йилдаги узини узи банд килган шахс сифатида давлат солик хизмати органларида руйхатдан утганлиги",
        counterpartyName: '"КАПИТАЛБАНК" АТ',
        counterpartyInn: "207275139",
      })
    ).toBe("xodim_kartasi");
  });

  it("o'zini-o'zi band qilganlar UCHUN to'lanadigan soliqni kartaga qo'shmaydi", () => {
    // "узини узи банд" o'zi yetarli belgi emas — bu soliq to'lovi.
    expect(
      classifyExpense({
        purpose:
          "08102~1000228606262663112533093~208 Узини узи банд килган фукаролар томонидан туланадиган айланмадан олинадиган солиги учун тулов",
        counterpartyName: "Газначилиги",
        counterpartyInn: "201122578",
      })
    ).toBe("soliq");
  });

  it("kontragent o'z firmamiz bo'lsa — firmalararo o'tkazma", () => {
    // Bu pul tizim ichida qoldi. Chiqim deb yozilsa, qabul qiluvchi firmaning
    // vipiskasida kirim bo'lib turgani uchun balans buzilardi.
    expect(
      classifyExpense({
        purpose: "00698~возврат фин помощь сог дог №27/04 от 28.04.2025г.",
        counterpartyName: 'ООО "TOOLSTREK CA"',
        counterpartyInn: "309850241",
        ownFirmInns: own,
      })
    ).toBe("ichki_otkazma");
  });

  it("matn boshqa narsa desa ham o'z firmamiz — ichki o'tkazma", () => {
    expect(
      classifyExpense({
        purpose: "оплата за услуги",
        counterpartyName: "BAROKAT TEAM",
        counterpartyInn: "304868808",
        ownFirmInns: own,
      })
    ).toBe("ichki_otkazma");
  });

  it("bank komissiyasi, ijara va aloqani tanidi", () => {
    expect(classifyExpense({ purpose: "комиссия за обслуживание", counterpartyName: null, counterpartyInn: null })).toBe("bank_komissiya");
    expect(classifyExpense({ purpose: "оплата за аренду за июнь 2026г", counterpartyName: null, counterpartyInn: null })).toBe("ijara");
    expect(classifyExpense({ purpose: "предоплата за услуги сот.связи", counterpartyName: null, counterpartyInn: null })).toBe("aloqa");
  });

  it("tanimagan chiqim 'boshqa' bo'ladi (yo'qolmaydi)", () => {
    expect(classifyExpense({ purpose: "нечто непонятное", counterpartyName: null, counterpartyInn: null })).toBe("boshqa");
  });

  it("ikki marta sanaladigan toifalar avtomatik yozilmaydi", () => {
    expect(isPostableExpense("ichki_otkazma")).toBe(false);
    expect(isPostableExpense("oylik")).toBe(false);
    expect(isPostableExpense("xodim_kartasi")).toBe(false);
    expect(isPostableExpense("soliq")).toBe(true);
    expect(isPostableExpense("bank_komissiya")).toBe(true);
    expect(isPostableExpense("ijara")).toBe(true);
  });
});

describe("extractCardTransfer", () => {
  it("kartani niqoblab, egasining ismini oladi", () => {
    const r = extractCardTransfer("00634~8600492970804957~UCHQUN AZIMBOYEV COO~Пополнение карты 07.01.2026");
    expect(r).toEqual({ cardMask: "8600****4957", holderName: "UCHQUN AZIMBOYEV COO" });
  });

  it("to'liq karta raqamini QAYTARMAYDI", () => {
    const r = extractCardTransfer("00111~5614681280782107~BEKCHANOVA YORQINOY~Пополнение карты физлица");
    expect(r?.cardMask).toBe("5614****2107");
    expect(JSON.stringify(r)).not.toContain("5614681280782107");
  });

  it("karta yo'q bo'lsa null", () => {
    expect(extractCardTransfer("оплата за бух услуги")).toBeNull();
    expect(extractCardTransfer(null)).toBeNull();
  });
});

// ── Haqiqiy fayllar (papka mavjud bo'lsa) ────────────────────────────────
const REAL_DIR = path.join(process.cwd(), "cash_json_files");
const hasRealFiles = fs.existsSync(REAL_DIR);

describe.skipIf(!hasRealFiles)("haqiqiy 07.2026 vipiskalari", () => {
  it("10 ta faylning hammasi o'qiladi va hash'lar takrorlanmaydi", () => {
    // plastik.json — bank vipiskasi EMAS, 1C reestri (alohida parser bilan
    // yuqorida tekshiriladi), shuning uchun bu ro'yxatdan chiqariladi.
    const files = fs
      .readdirSync(REAL_DIR)
      .filter(
        (f) => f.endsWith(".json") && !f.includes("conversion_log") && f !== "plastik.json"
      );
    expect(files.length).toBe(10);

    const hashes = new Set<string>();
    let total = 0;
    let income = 0;
    for (const file of files) {
      const wb = JSON.parse(fs.readFileSync(path.join(REAL_DIR, file), "utf8"));
      const st = parseWorkbook(wb);
      expect(st.accountNumber, `${file}: hisob raqami`).toBeTruthy();
      expect(st.accountInn, `${file}: hisob STIR`).toBeTruthy();
      expect(st.transactions.length, `${file}: tranzaksiya`).toBeGreaterThan(0);

      for (const t of st.transactions) {
        total++;
        if (t.direction === "income") income += t.amount;
        hashes.add(
          transactionHash({
            accountNumber: st.accountNumber!,
            valueDate: t.valueDate,
            docNumber: t.docNumber,
            amount: t.amount,
            direction: t.direction,
            purpose: t.purpose,
          })
        );
      }
    }
    expect(total).toBe(494);
    expect(hashes.size).toBe(494); // hash to'qnashuvi yo'q
    expect(Math.round(income)).toBe(889_847_725);
  });
});

// ── PLASTIK KARTA REESTRI (1C) ───────────────────────────────────────────
describe("parsePlastik", () => {
  // Fayl QOIDAGA TO'G'RI KELMAYDIGAN JSON: tashqi qavs yo'q, `null` aralashgan,
  // ustun kalitlari "Column2" ko'rinishida.
  const raw = `
 { "Plastik": "Реестр документов \\"Реализация (акт, накладная)\\" за Июль 2026 г." },
 null,
 { "Plastik": "№ п/п", "Column2": "Дата", "Column5": "Номер", "Column6": "Сумма",
   "Column11": "Информация", "Column14": "Контрагент.ИНН", "Column17": "Договор" },
 { "Plastik": 1, "Column2": "31.07.2026", "Column5": "3563", "Column6": 700000,
   "Column11": "\\"ASIA PRO GROUP\\" MCHJ", "Column14": "301502362", "Column17": "Без договора" },
 { "Plastik": 2, "Column2": "31.07.2026", "Column5": "3999", "Column6": 300000,
   "Column11": "SOBIROV I YATT", "Column17": "Без договора" },
 { "Plastik": "Итого", "Column6": 1000000 },
 null,
 { "Plastik": "Ответственный:" }
`;

  it("qavssiz JSON va null qatorlarni o'qiydi", () => {
    const { receipts, declaredTotal } = parsePlastikFile(raw);
    expect(receipts).toHaveLength(2);
    expect(declaredTotal).toBe(1_000_000);
    expect(receipts.reduce((s, r) => s + r.amount, 0)).toBe(declaredTotal);
  });

  it("ustun kalitlarini sarlavhadan topadi (qattiq yozilmagan)", () => {
    const [first] = parsePlastikFile(raw).receipts;
    expect(first.docNumber).toBe("3563");
    expect(first.amount).toBe(700_000);
    expect(first.counterpartyInn).toBe("301502362");
    expect(first.counterpartyName).toContain("ASIA PRO GROUP");
    expect(first.date.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("STIRsiz mijozni ham oladi (YATT — real holat)", () => {
    const yatt = parsePlastikFile(raw).receipts[1];
    expect(yatt.counterpartyInn).toBeNull();
    expect(yatt.counterpartyName).toBe("SOBIROV I YATT");
  });

  it("'Итого' va 'Ответственный' xizmat qatorlarini tushum deb sanamaydi", () => {
    expect(parsePlastikFile(raw).receipts.every((r) => r.amount > 0)).toBe(true);
  });

  it("sarlavhasiz faylni JIM YUTMAYDI", () => {
    expect(() => parsePlastikFile('{ "a": 1 }')).toThrow(BankStatementParseError);
  });
});

// ── IKKI SAHIFALI VIPISKA (real prod holati) ─────────────────────────────
describe("ikki sahifali vipiska", () => {
  // Ruslan yuklagan faylda sarlavha "Sheet1" da, tranzaksiyalar "Sheet2" da
  // edi — va sana Excel serial ko'rinishida. Har ikkalasi ham parserni
  // to'xtatib qo'ygan.
  const sheet1 = [
    { A: "Лицевой счет No 20208000600767792001", B: null, C: null, D: null, E: null, F: null },
    { A: "Клиент: 00767792 ИНН: 304868808", B: null, C: null, D: null, E: null, F: null },
    { A: 'ООО "BAROKAT TEAM"', B: null, C: null, D: null, E: null, F: null },
    { A: "Период выписки с 01.08.2026 по 07.08.2026", B: null, C: null, D: null, E: null, F: null },
  ];
  const sheet2 = [
    { A: "Дата/время", B: "Номер документа", C: "Оп", D: "Корреспондент", E: "Дебет", F: "Кредит" },
    { A: "проводки", B: null, C: null, D: "Наименование", E: null, F: null },
    { A: null, B: null, C: null, D: "Назначение платежа", E: null, F: null },
    // Sana — SERIAL son, matn emas.
    { A: 46150.46194444445, B: "260804068", C: "21", D: "МФО:01121 Счет:20208000807186204001 ИНН:301234567", E: 0, F: 2000000 },
    { A: null, B: null, C: null, D: 'ООО "TEST MIJOZ"', E: null, F: null },
    { A: null, B: null, C: null, D: "оплата сог дог №09/26БК от 05.01.2026г", E: null, F: null },
    { A: 46150.4969212963, B: "760", C: "21", D: "МФО:01158 Счет:20208000304408186001 ИНН:302345678", E: 0, F: 20000000 },
  ];

  it("sarlavhani BOSHQA sahifadan to'ldiradi", () => {
    const parsed = parseWorkbook({ Sheet1: sheet1, Sheet2: sheet2 });
    expect(parsed.accountNumber).toBe("20208000600767792001");
    expect(parsed.accountInn).toBe("304868808");
    expect(parsed.holderName).toContain("BAROKAT TEAM");
    expect(parsed.periodFrom?.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("serial sanali tranzaksiyalarni o'qiydi", () => {
    const parsed = parseWorkbook({ Sheet1: sheet1, Sheet2: sheet2 });
    expect(parsed.transactions).toHaveLength(2);
    const [first] = parsed.transactions;
    expect(first.direction).toBe("income");
    expect(first.amount).toBe(2_000_000);
    expect(first.counterpartyInn).toBe("301234567");
    expect(first.counterpartyName).toContain("TEST MIJOZ");
    expect(first.purpose).toContain("09/26БК");
    // Serial 46150 → 2026-05-08 (1900 tizimi). Davr esa avgust deb yozilgan,
    // ya'ni fayl ichida nomuvofiqlik bor — parser buni OGOHLANTIRISH bilan
    // belgilaydi, jim o'tkazib yubormaydi.
    expect(first.valueDate.toISOString().slice(0, 10)).toBe("2026-05-08");
  });

  it("sana davrdan tashqarida bo'lsa OGOHLANTIRADI", () => {
    const parsed = parseWorkbook({ Sheet1: sheet1, Sheet2: sheet2 });
    expect(parsed.warnings?.length).toBeGreaterThan(0);
    expect(parsed.warnings?.[0]).toContain("davridan tashqarida");
  });

  it("sahifa tartibi teskari bo'lsa ham ishlaydi", () => {
    const parsed = parseWorkbook({ Sheet2: sheet2, Sheet1: sheet1 });
    expect(parsed.accountNumber).toBe("20208000600767792001");
    expect(parsed.transactions).toHaveLength(2);
  });

  it("looksLikeDate serial sonni ham tanidi", () => {
    expect(looksLikeDate(46150.46)).toBe(true);
    expect(looksLikeDate("02.07.2026")).toBe(true);
    expect(looksLikeDate(21)).toBe(false); // "Оп" kodi sana emas
    expect(looksLikeDate("salom")).toBe(false);
  });
});

// ── HTML KO'RINISHIDAGI VIPISKA (".xls" deb nomlangan) ───────────────────
describe("HTML vipiska (Klient-Bank eksporti)", () => {
  // Bu fixture Ruslan yuklagan REAL faylning aynan tuzilishi.
  // Uch nozik joyi bor va uchalasi ham parserni yiqitgan edi:
  //   1) cp1251 kodlash (kirill "����" bo'lib ketardi);
  //   2) sarlavha Sheet1 da, tranzaksiyalar Sheet2 da;
  //   3) sana/nom/maqsad BITTA katakda <br> bilan ajratilgan.
  const html = `<HTML><head><title>Выписка</title>
<meta http-equiv="Content-Type" content="text/html; charset=windows-1251"/></head><body>
<table>
<tr><td>07 августа 2026 г. 17:26</td><td>Выписка</td><td></td></tr>
<tr><td>Лицевой счет No 20208000600767792001</td></tr>
<tr><td>Клиент: 00767792 ИНН: 304868808</td></tr>
<tr><td>ООО "BAROKAT TEAM"</td></tr>
<tr><td>Период выписки с 01.08.2026 по 07.08.2026</td></tr>
<tr><td>Входящий остаток за 01.08.2026</td><td>2,464,726.95</td></tr>
</table>
<table>
<tr><td>Дата/время<br>проводки</td><td>Номер документа</td><td>Оп</td><td>Корреспондент<br>Наименование<br>Назначение платежа</td><td>Дебет</td><td>Кредит</td></tr>
<tr><td>05.08.2026<br>11:05:01</td><td>0260804068</td><td>21</td><td>МФО:01121 Счет:20208000807186204001 ИНН:311824130<br>MCHJ AVVITAL NATURALS<br>00111оплата за Бухгалтерские услуги 07/2026 сог дог №16/26БК от 05.01.2026г</td><td>.00</td><td>2,000,000.00</td></tr>
<tr><td>06.08.2026<br>20:32:16</td><td>ОК77</td><td>06</td><td>МФО:00901 Счет:45249000900000901101 ИНН:202579253<br>Комиссионные доходы<br>00667Комиссия за операционное обслуживание</td><td>50,000.00</td><td>.00</td></tr>
</table></body></HTML>`;

  const buffer = Buffer.from(
    new Uint8Array(Array.from(html).map((ch) => {
      const code = ch.charCodeAt(0);
      // Kirill → cp1251 (А=0xC0). Fixture'ni haqiqiy fayl kabi kodlaymiz.
      if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
      if (code === 0x401) return 0xa8;
      if (code === 0x451) return 0xb8;
      if (code === 0x2116) return 0xb9; // №
      return code;
    }))
  );

  it("kengaytmaga emas, MAZMUNGA qarab HTML deb tanidi", () => {
    expect(looksLikeHtml(buffer)).toBe(true);
  });

  it("cp1251 dan kirillni to'g'ri o'qiydi", () => {
    const decoded = decodeHtml(buffer);
    expect(decoded).toContain("Выписка");
    expect(decoded).toContain("Лицевой счет");
    expect(decoded).not.toContain("�"); // buzuq belgi bo'lmasin
  });

  it("KUN va OY almashib ketmaydi — eng xavfli xato", () => {
    // `xlsx` bu faylni o'qiganda "05.08.2026" ni 8-MAY qilib qo'ygan edi.
    // Sana noto'g'ri bo'lsa to'lov boshqa oyga tushib, qarzdorlik buziladi.
    const parsed = parseWorkbook(readHtmlTables(buffer));
    expect(parsed.transactions[0].valueDate.toISOString().slice(0, 10)).toBe("2026-08-05");
    expect(parsed.transactions[1].valueDate.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("sarlavhani Sheet1 dan, qatorlarni Sheet2 dan oladi", () => {
    const parsed = parseWorkbook(readHtmlTables(buffer));
    expect(parsed.accountNumber).toBe("20208000600767792001");
    expect(parsed.accountInn).toBe("304868808");
    expect(parsed.periodFrom?.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(parsed.periodTo?.toISOString().slice(0, 10)).toBe("2026-08-07");
    expect(parsed.openingBalance).toBe(2_464_726.95);
  });

  it("hisob egasi sifatida fayl yaratilgan vaqtni OLMAYDI", () => {
    const parsed = parseWorkbook(readHtmlTables(buffer));
    expect(parsed.holderName).toContain("BAROKAT TEAM");
    expect(parsed.holderName).not.toContain("августа");
  });

  it("bitta katakdagi uch satrni ajratadi (hisob / nom / maqsad)", () => {
    const [income] = parseWorkbook(readHtmlTables(buffer)).transactions;
    expect(income.direction).toBe("income");
    expect(income.amount).toBe(2_000_000);
    expect(income.counterpartyInn).toBe("311824130");
    expect(income.counterpartyName).toBe("MCHJ AVVITAL NATURALS");
    expect(income.purpose).toContain("16/26БК");
    expect(extractContract(income.purpose)?.number).toBe("16/26БК");
  });

  it("'.00' ko'rinishidagi nol summani tushunadi", () => {
    const [, expense] = parseWorkbook(readHtmlTables(buffer)).transactions;
    expect(expense.direction).toBe("expense");
    expect(expense.amount).toBe(50_000);
  });
});
