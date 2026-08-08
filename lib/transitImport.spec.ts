// Sof (DB'siz) test: tranzit daftarini Excel eksportidan o'qish.
//
// Fixture'lar REAL fayl tuzilishini takrorlaydi. Uchala tuzoq ham shu yerda
// qulflanadi, chunki uchalasi ham JIM xato beradi — parser "muvaffaqiyatli"
// o'qigan bo'lib ko'rinadi, raqam esa noto'g'ri chiqadi.
import { describe, it, expect } from "vitest";
import {
  parseBandQilganlar,
  parseTransitSheet,
  parseTransitTotals,
  maskCard,
  TransitParseError,
} from "@/lib/transitImport";

// Abror varag'i: `comment` ustuni BOR (9 ustun).
const withComment = [
  { A: "#", B: "data", C: "Firma", D: "summa", E: "maqsad", F: "comment", G: "Summa", H: "bank comission", I: "summa" },
  { A: 1, B: 46204, C: "Tastify", D: 8000000, E: "Oylik", F: "Zamira opaga avans", G: 1000000, H: null, I: 42592250 },
  { A: 2, B: null, C: null, D: null, E: "Oylik", F: "Dilmurod avans", G: 3000000, H: null, I: 39592250 },
  // JAMI qatori: `#` bo'sh, kirim yig'indisini TAKRORLAYDI.
  { A: null, B: "TOTAL", C: null, D: 8000000, E: null, F: null, G: null, H: null, I: null },
];

// Otabek varag'i: `comment` ustuni YO'Q (8 ustun) — chiqim boshqa indeksda.
const withoutComment = [
  { A: "#", B: "data", C: "Firma", D: "summa", E: "maqsad", F: "Summa", G: "bank comission", H: "summa" },
  { A: 1, B: 46220, C: "Moliya AI", D: 10000000, E: "Otabek akaga", F: 10000000, G: null, H: 28900000 },
  { A: null, B: "TOTAL", C: null, D: 10000000, E: null, F: null, G: null, H: null },
];

describe("parseTransitSheet", () => {
  it("JAMI qatorini kirim deb sanamaydi", () => {
    // Bu tuzoqqa tushilganda Abrorning kirimi 43.6 mln o'rniga 87.2 mln
    // bo'lib ko'ringan edi — aniq ikki barobar.
    const s = parseTransitSheet("Abror", withComment);
    expect(s.totalIn).toBe(8_000_000);
    expect(s.movements).toHaveLength(2);
    expect(s.declaredTotalIn).toBe(8_000_000);
  });

  it("USTUNLAR TARTIBI har varaqda har xil bo'lsa ham chiqimni topadi", () => {
    // `comment` ustuni yo'q varaqda chiqim 6-emas, 5-ustunda. Qat'iy indeks
    // bilan o'qilganda Otabekning 38.9 mln chiqimi UMUMAN ko'rinmagan edi.
    const s = parseTransitSheet("Otabek", withoutComment);
    expect(s.totalIn).toBe(10_000_000);
    expect(s.totalOut).toBe(10_000_000);
    expect(s.balance).toBe(0);
    expect(s.movements[0].purpose).toBe("Otabek akaga");
  });

  it("uchta takrorlanuvchi 'summa' ustunini tartib bo'yicha ajratadi", () => {
    const s = parseTransitSheet("Abror", withComment);
    const [first] = s.movements;
    expect(first.amountIn).toBe(8_000_000); // 1-summa
    expect(first.amountOut).toBe(1_000_000); // 2-summa (Summa)
    expect(first.comment).toBe("Zamira opaga avans");
  });

  it("sanasi bo'sh qator oldingi kunga tegishli bo'ladi", () => {
    const s = parseTransitSheet("Abror", withComment);
    expect(s.movements[1].date).toEqual(s.movements[0].date);
    expect(s.movements[0].date?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("qoldiq = kirim − chiqim − KOMISSIYA", () => {
    // Musobekda 16 000 komissiya bor: hisobga olinmasa qoldiq 27 000
    // chiqadi, haqiqiysi esa 11 000.
    const rows = [
      withComment[0],
      { A: 1, B: 46219, C: "Fininfo best", D: 42772500, E: "Oylik", F: "Ilhom", G: 42745500, H: 16000, I: 11000 },
    ];
    const s = parseTransitSheet("Musobek", rows);
    expect(s.totalCommission).toBe(16_000);
    expect(s.balance).toBe(11_000);
  });

  it("bitta qatorda ham kirim, ham chiqim bo'lishi mumkin", () => {
    const rows = [
      withComment[0],
      { A: 1, B: 46211, C: "Seven's Up", D: 11592250, E: "O'ziga oylik", F: null, G: 11592250, H: null, I: 0 },
    ];
    const s = parseTransitSheet("Abror", rows);
    expect(s.movements[0].amountIn).toBe(11_592_250);
    expect(s.movements[0].amountOut).toBe(11_592_250);
    expect(s.balance).toBe(0);
  });

  it("bo'sh varaqni yiqilmasdan o'tkazadi", () => {
    const s = parseTransitSheet("Zubayda", []);
    expect(s.movements).toHaveLength(0);
    expect(s.balance).toBe(0);
  });

  it("summa ustunlari yetmasa aniq xato beradi", () => {
    expect(() => parseTransitSheet("X", [{ A: "#", B: "data" }])).toThrow(TransitParseError);
  });
});

describe("parseBandQilganlar", () => {
  const rows = [
    { A: "№", B: "F.I.O", C: "Lavozim", D: "Firma(mehnat)", E: "MFO", F: "INN", G: "Transit", H: "Karta nomer", I: "band sana", J: "soha", K: "Ma'lumotnoma #", L: "JSHSHIR" },
    { A: 1, B: "SHAVKATOV BEGZOD", C: null, D: "SARDORBEK HOUSE", E: "00444", F: null, G: "23120000800000444200", H: "9860170121905245", I: "10.06.2026", J: "Онлайн консультация бериш", K: "0013639192", L: null },
    { A: 2, B: "BOBOJONOV ABRORBEK", C: null, D: "THE POWERFUL TEAM", E: null, F: null, G: null, H: null, I: null, J: null, K: null, L: null },
  ];

  it("kartasi bor va yo'q xodimlarni ham oladi", () => {
    const people = parseBandQilganlar(rows);
    expect(people).toHaveLength(2);
    expect(people[0].cardNumber).toBe("9860170121905245");
    expect(people[0].transitAccount).toBe("23120000800000444200");
    expect(people[0].engagedAt?.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(people[1].cardNumber).toBeNull();
    expect(people[1].ownFirmName).toBe("THE POWERFUL TEAM");
  });

  it("sarlavhasiz varaqni rad etadi", () => {
    expect(() => parseBandQilganlar([{ A: "salom" }])).toThrow(TransitParseError);
  });
});

describe("maskCard", () => {
  it("to'liq karta raqamini SAQLAMAYDI", () => {
    expect(maskCard("9860170121905245")).toBe("9860****5245");
    expect(maskCard("5614 6812 6337 9541")).toBe("5614****9541");
  });

  it("yaroqsiz qiymatda null qaytaradi", () => {
    expect(maskCard(null)).toBeNull();
    expect(maskCard("123")).toBeNull();
  });
});

describe("parseTransitTotals", () => {
  it("ism va kartadagi qoldiqni oladi", () => {
    const rows = [
      { A: "№", B: "Name", C: "Firma 1", D: "Firma 2", E: "IYUL", F: "kartadagi qoldiq" },
      { A: 1, B: "Muslimbek", C: null, D: null, E: 50204740, F: 35088 },
      { A: 2, B: "Alisher", C: null, D: null, E: 59482416, F: 2682766.58 },
    ];
    const totals = parseTransitTotals(rows);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toEqual({ person: "Muslimbek", monthIn: 50_204_740, cardBalance: 35_088 });
    expect(totals[1].cardBalance).toBeCloseTo(2_682_766.58, 2);
  });
});
