// VIPISKA QATORIDAN SVERKA MA'LUMOTINI AJRATISH
//
// Ekvayring tushumi vipiskaga HISOB-KITOB bo'lib tushadi: bank bir necha
// kunlik savdoni jamlaydi, komissiyani ushlaydi va savdo sanasini to'lov
// maqsadi ichida yozadi. Sverka uchun kerakli uchta narsa — TERMINAL,
// SAVDO SANASI va YALPI SUMMA — faqat shu matn ichida bo'ladi.
//
// NEGA regexp, NEGA "aqlli" tahlil emas. Har bank o'z shablonini yillab
// o'zgartirmaydi; shablon ro'yxati esa ko'rinadigan va testlanadigan qoladi.
// Tanilmagan matn `other` bo'ladi va doiraga O'ZI kirmaydi — noto'g'ri
// taxmin qilingan qator sverkani jimgina buzishidan ko'ra, odam ko'radigan
// "tanilmadi" holati xavfsizroq.

import type { PosChannel, SettlementInfo } from "./types";

/**
 * "4,200,000.00" · "121 860 500.00" · "20 216 000,00" · "42,000.00"
 *
 * Bank formatlari aralash: ming ajratgich bo'sh joy ham, vergul ham bo'ladi;
 * kasr esa nuqta ham, vergul ham. Noto'g'ri o'qilgan bitta raqam butun
 * kunni buzgani uchun bu yerda taxmin qilinmaydi — shakl aniq tanilmasa
 * `null` qaytadi.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/ /g, " ");
  // Raqamlar orasidagi bo'sh joy — faqat ming ajratgich.
  s = s.replace(/(?<=\d)[  ](?=\d)/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(s)) { /* toza */ }
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "31.12.2024" · "03.01.25" · "2026-07-30" · "31-07-2026" → UTC kun boshi. */
export function parseDetailDate(raw: string): Date | null {
  let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (m) return utcDay(+m[3], +m[2], +m[1]);
  m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(raw);
  if (m) return utcDay(2000 + +m[3], +m[2], +m[1]);
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (m) return utcDay(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  return null;
}

function utcDay(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const REVERSAL_RE = /отмена|сторно|возврат|reversal/i;

/**
 * O'Z-O'ZINI YOPADIGAN juftlik: HUMO "(80606) Взаиморасчеты по операциям
 * (reversal)" kirimi va uning "(80607) Отмена ... reversal" chiqimi bir kunda,
 * bir summada keladi va netto NOLGA teng. Ularni "bekor qilingan savdo" deb
 * hisoblash summani ikki marta kamaytiradi — shuning uchun ikkalasi ham
 * butunlay chetga chiqariladi.
 */
function isSelfCancellingPair(p: string): boolean {
  return (
    /по операциям \(reversal\)/i.test(p) ||
    /по реверсальным операциям/i.test(p) ||
    /Отмена взаиморасчетов по операциям reversal/i.test(p) ||
    /Отмена взаиморасчетов своими мерчантами/i.test(p)
  );
}

/** Matndan `за 31.12.2024` / `от: 27.12.2024` ko'rinishidagi OXIRGI sanani oladi. */
function trailingDate(p: string): Date | null {
  const all = [...p.matchAll(/(?:за|от)[:\s]*\s*(\d{2}\.\d{2}\.\d{4}|\d{2}\.\d{2}\.\d{2})(?!\d)/gi)];
  if (!all.length) return null;
  return parseDetailDate(all[all.length - 1][1]);
}

interface Rule {
  channel: PosChannel;
  test: (p: string) => boolean;
  extract: (p: string) => Omit<SettlementInfo, "channel" | "isReversal">;
}

/**
 * Tartib MUHIM: birinchi mos kelgan qoida yutadi. Aniqrog'i (EPOS, TEZ QR)
 * umumiyroq qoidadan (HUMO, UZCARD) OLDIN turadi.
 */
const RULES: Rule[] = [
  // ── HUMO EPOS: "Устр-во EPOS № 19610FZO ... за вычетом комиссий на сумму N
  //    UZS сумма комиссии M UZS". Bu yerda "на сумму" — SOF summa, yalpi emas.
  {
    channel: "humo_epos",
    test: (p) => /EPOS/i.test(p) && /Возмещение клиенту по покупкам/i.test(p),
    extract: (p) => {
      const dates = [...(p.split(/транзакций за/i)[1] ?? p).matchAll(/(\d{2}\.\d{2}\.\d{4})/g)];
      const comm = parseMoney(/сумма комиссии\s*([\d  .,]+?)\s*UZS/i.exec(p)?.[1]);
      const net = parseMoney(/за вычетом комиссий на сумму\s*([\d  .,]+?)\s*UZS/i.exec(p)?.[1]);
      return {
        terminalCode: `EPOS ${/EPOS № (\S+)/i.exec(p)?.[1] ?? "?"}`,
        opDate: dates.length ? parseDetailDate(dates[dates.length - 1][1]) : null,
        grossAmount: net != null && comm != null ? net + comm : null,
        commissionAmount: comm,
      };
    },
  },
  // ── HUMO terminal: yalpi va komissiya matnda ochiq yozilgan.
  {
    channel: "humo",
    test: (p) => /HUMO/i.test(p) && /(Перечисление на счет клиента инкассированной выручки|Взаиморасчеты с ТСП)/i.test(p),
    extract: (p) => {
      // HUMO summani ikki xil yozadi:
      //   "На общую сумму:4,200,000.00, в том числе комиссия:42,000.00"
      //   "На сумму:  29000.00, В т ч комис:  58.00"
      const gross = parseMoney(/На (?:общую )?сумму:?\s*([\d  .,]+?)\s*,\s*(?:[вВ] том числ|[вВ] т ч)/i.exec(p)?.[1]);
      // Ochko'z olinadi va oxiridagi ajratgich kesiladi: nokamtar shakl
      // "42,000.00" ni birinchi vergulda uzib, 42 deb o'qib qo'yardi.
      const comm = parseMoney(/комис(?:сия|си[яи])?:?\s*([\d  .,]+)/i.exec(p)?.[1]?.replace(/[.,\s ]+$/, ""));
      // Terminal "Терм: X" yoki "при оплате с: X" ko'rinishida keladi.
      const term =
        /Терм(?:инал)?:?\s*(\w+)/i.exec(p)?.[1] ??
        /при оплате с:?\s*(\w+)/i.exec(p)?.[1] ??
        "?";
      return {
        terminalCode: `HUMO ${term}`,
        opDate: /выручки за (\d{2}\.\d{2}\.\d{4})/i.exec(p)
          ? parseDetailDate(/выручки за (\d{2}\.\d{2}\.\d{4})/i.exec(p)![1])
          : trailingDate(p),
        grossAmount: gross,
        commissionAmount: comm,
      };
    },
  },
  // ── MULTICARD: "Выручка по POS (TerminalID X) за YYYY-MM-DD на сумму N сум.
  //    Удержанная комиссия: M сум"
  {
    channel: "multicard",
    test: (p) => /MULTICARD/i.test(p),
    extract: (p) => ({
      terminalCode: `MULTICARD ${/TerminalID (\S+?)\)/i.exec(p)?.[1] ?? "?"}`,
      opDate: parseDetailDate(/за (\d{4}-\d{2}-\d{2})/.exec(p)?.[1] ?? ""),
      grossAmount: parseMoney(/на сумму\s*([\d  .,]+?)\s*сум/i.exec(p)?.[1]),
      commissionAmount: parseMoney(/комиссия:\s*([\d  .,]+?)\s*сум/i.exec(p)?.[1]),
    }),
  },
  {
    channel: "payme",
    test: (p) => /от PAYME за/i.test(p),
    extract: (p) => ({
      // Karta turi bo'yicha ajratiladi (UZCARD / HUMO / VISA) — Payme
      // hisobotini shu kesimda beradi.
      terminalCode: `PAYME ${/через ([A-Z][A-Z ]*)\./.exec(p)?.[1]?.trim() ?? "—"}`,
      opDate: parseDetailDate(/от PAYME за (\d{2}-\d{2}-\d{4})/i.exec(p)?.[1] ?? ""),
      // 1% foydalanuvchidan ushlanadi — savdogarga 100% tushadi.
      grossAmount: null,
      commissionAmount: null,
    }),
  },
  {
    channel: "click",
    // Kontragent nomi ikki xil yoziladi ("AO CLICK", "CLICK AJ"), matn esa
    // ba'zi vipiskalarda BOSH HARFDA keladi — shuning uchun registrga
    // bog'liq bo'lmagan tekshiruv.
    test: (p) => /\bCLICK\b/i.test(p),
    extract: (p) => ({
      terminalCode: `CLICK ${/сервису\s*№\s*(\d+)/i.exec(p)?.[1] ?? "?"}`,
      opDate: parseDetailDate(/услуги за (\d{2}\.\d{2}\.\d{4})/i.exec(p)?.[1] ?? ""),
      grossAmount: parseMoney(/Сумма продаж\s*([\d  .,]+?)\s*сум/i.exec(p)?.[1]),
      commissionAmount: parseMoney(/комиссия с платежа\s*([\d  .,]+?)\s*сум/i.exec(p)?.[1]),
    }),
  },
  {
    channel: "paynet",
    test: (p) => /PAYNET/i.test(p),
    extract: (p) => ({
      terminalCode: "PAYNET",
      // Matn oxirida shartnoma sanasi ham bor — u savdo sanasi EMAS,
      // shuning uchun aynan "(mobile) за ..." shakli olinadi.
      opDate: parseDetailDate(
        /\(mobile\) за (\d{2}\.\d{2}\.\d{4})/i.exec(p)?.[1] ??
          /услуги[^;]*? за (\d{2}\.\d{2}\.\d{4})/i.exec(p)?.[1] ??
          "",
      ),
      grossAmount: null,
      commissionAmount: null,
    }),
  },
  // ── UZCARD, 20208 (asosiy hisobvaraq): "Терминал савдо тушуми 100% от
  //    сальдо N ID=..." — SANA YO'Q, faqat ID. Terminal kodi transit
  //    hisobvaraq raqamining oxiri bilan barqaror bo'ladi.
  {
    channel: "uzcard",
    test: (p) => /Терминал савдо тушуми|инкассация по терминалу/i.test(p),
    extract: (p) => ({
      // ID birinchi: u terminalning O'ZIGA tegishli va barcha vipiska
      // shakllarida bir xil. Hisobvaraq raqami esa parserga qarab to'lov
      // maqsadida ham, alohida ustunda ham kelishi mumkin.
      terminalCode: `UZCARD ${/ID=(\d+)/.exec(p)?.[1] ?? /Счет:(\d{20})/.exec(p)?.[1]?.slice(-6) ?? "?"}`,
      opDate: null, // 100% от сальдо — hujjat sanasidan olinadi
      grossAmount: null, // "100%" — komissiya ushlanmagan
      commissionAmount: 0,
    }),
  },
  // ── QR Online: "зачисление 99.75% на счет клиента владельца QR-кода 12.05.2026".
  //    Yalpi summa matnda YO'Q — foiz ko'rsatilgan, shuning uchun undan tiklanadi.
  {
    channel: "qr",
    test: (p) => /QR[- ]?Online/i.test(p) || /владельца QR-кода/i.test(p),
    extract: (p) => {
      const pct = Number(/зачисление\s*([\d.]+)\s*%/i.exec(p)?.[1] ?? "100");
      const dates = [...p.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)];
      return {
        terminalCode: "QR Online",
        opDate: dates.length ? parseDetailDate(dates[dates.length - 1][1]) : null,
        // Yalpi summa chaqiruvchida `fakt / (pct/100)` bilan tiklanadi —
        // bu yerda faqat foiz ma'lum, summa esa vipiska qatorida.
        grossAmount: null,
        commissionAmount: null,
        creditedPercent: Number.isFinite(pct) && pct > 0 ? pct : null,
      };
    },
  },
  // ── UZUM BANK (UzumCard, FastPay): "за вычетом комиссии 1.0% от суммы
  //    34000.00 за период 23.06.2026 02:00:00 - 25.06.2026 15:25:39".
  //    Yalpi summa ochiq yozilgan, sana esa DAVR — oxirgi kun olinadi.
  {
    channel: "uzum",
    test: (p) => /UZUM\s*BANK/i.test(p) || /UZUMCARD|FASTPAY/i.test(p),
    extract: (p) => {
      const gross = parseMoney(/от суммы\s*([\d  .,]+?)(?:\s|$)/i.exec(p)?.[1]);
      const dates = [...p.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)];
      const range = /за период[^\d]*(\d{2}\.\d{2}\.\d{4})[^-]*-[^\d]*(\d{2}\.\d{2}\.\d{4})/i.exec(p);
      return {
        terminalCode: /FASTPAY\s*(\w+)/i.exec(p)?.[1]
          ? `UZUM FASTPAY ${/FASTPAY\s*(\w+)/i.exec(p)![1].toUpperCase()}`
          : "UZUM",
        // Hisob-kitob bir necha kunni qamraydi; savdo sanasi sifatida davr
        // OXIRI olinadi — u yopilish kuni va bankdagi sanaga eng yaqini.
        opDate: parseDetailDate(range?.[2] ?? (dates.length ? dates[dates.length - 1][1] : "")),
        grossAmount: gross,
        commissionAmount: null,
      };
    },
  },
  // ── UZCARD, 23510 (transit hisobvaraq): "тер:ТЕР:50219; за 31.12.2024"
  {
    channel: "uzcard",
    test: (p) => /ТЕР:\s*\d+/i.test(p),
    extract: (p) => ({
      terminalCode: `UZCARD ${/ТЕР:\s*(\d+)/i.exec(p)?.[1] ?? "?"}`,
      opDate: trailingDate(p),
      grossAmount: null,
      commissionAmount: null,
    }),
  },
];

/**
 * Vipiska qatorining to'lov maqsadini sverka ma'lumotiga aylantiradi.
 * Tanilmasa `channel: "other"` qaytadi — bunday terminal doiraga o'zi kirmaydi.
 */
export function classifySettlement(
  purpose: string | null | undefined,
  counterparty?: string | null,
): SettlementInfo {
  // KONTRAGENT NOMI HAM QIDIRILADI. Bank formatlari kanal nomini turlicha
  // joylashtiradi: bir vipiskada u to'lov maqsadi ichida ("AO CLICK 00111Оплата
  // за товары…"), boshqasida esa alohida "Наименование" ustunida bo'ladi va
  // parser uni maqsaddan ajratib oladi. Faqat maqsadga qarasak, Multicard va
  // Click qatorlari jimgina "tanilmagan" bo'lib qolardi.
  const p = [counterparty ?? "", purpose ?? ""].join(" ").replace(/\s+/g, " ").trim();
  if (!p) {
    return { channel: "other", terminalCode: "Tanilmagan", opDate: null, grossAmount: null, commissionAmount: null, isReversal: false };
  }
  if (isSelfCancellingPair(p)) {
    // Juftlik netto nol beradi — ikkalasi ham chetga chiqariladi.
    return { channel: "other", terminalCode: "Reversal juftligi", opDate: null, grossAmount: null, commissionAmount: null, isReversal: true };
  }
  const isReversal = REVERSAL_RE.test(p);
  for (const rule of RULES) {
    if (!rule.test(p)) continue;
    const info = rule.extract(p);
    return { channel: rule.channel, isReversal, ...info };
  }
  return { channel: "other", terminalCode: "Tanilmagan", opDate: trailingDate(p), grossAmount: null, commissionAmount: null, isReversal };
}

/** Kanalning o'zbekcha nomi — ekran va hisobotlar uchun yagona manba. */
export const CHANNEL_LABELS: Record<PosChannel, string> = {
  qr: "QR Online",
  uzum: "Uzum Bank",
  uzcard: "UzCard",
  humo: "HUMO",
  humo_epos: "HUMO EPOS",
  multicard: "Multicard",
  payme: "Payme",
  click: "Click",
  paynet: "Paynet",
  other: "Tanilmagan",
};

/**
 * Matn haqiqiy kanal kalitimi.
 *
 * `PosTerminal.channel` bazada oddiy `String`, `FiscalDailyReport.channels`
 * esa `Json` — ikkalasi ham tipdan tashqarida. Ro'yxat `CHANNEL_LABELS`
 * dan olinadi, ya'ni yangi kanal qo'shilganda bu tekshiruv o'zi yangilanadi.
 */
export function isPosChannel(v: string): v is PosChannel {
  return Object.prototype.hasOwnProperty.call(CHANNEL_LABELS, v);
}

/**
 * Yangi terminal doiraga O'ZI kiritiladimi.
 *
 * POS terminallari (UzCard, HUMO, Multicard) kassa apparati bilan bir xil
 * to'lovni ko'radi — ular sukut bo'yicha doirada. EPOS va onlayn tizimlar
 * ko'pincha boshqa savdo liniyasi bo'ladi va ularni qo'shib yuborish
 * sverkani buzadi (bu allaqachon yuz bergan), shuning uchun ular odam
 * tasdig'ini kutadi.
 */
export function defaultInScope(channel: PosChannel): boolean {
  return channel === "uzcard" || channel === "humo" || channel === "multicard";
}

/**
 * Qator sverkaga qanday kiradi: `+1` tushum, `-1` bekor qilish, `0` — kirmaydi.
 *
 * BITTA bekor qilish vipiskada UCHTA qator qoldiradi: tushumning stornosi
 * (debet), komissiyaning stornosi (kredit) va o'tkazmaning stornosi (kredit).
 * Faqat BIRINCHISI savdo summasini kamaytiradi. Qolgan ikkitasi kredit
 * bo'lgani uchun "tushum" deb qo'shib yuborilsa, summa ikki barobar buziladi —
 * aynan shu xato hisobotda "komissiya storno bilan qo'shilib ikki barobar
 * kamayadi" bo'lib chiqqan edi.
 */
export function settlementSign(direction: "income" | "expense", info: SettlementInfo): -1 | 0 | 1 {
  if (info.channel === "other") return 0;
  if (info.isReversal) return direction === "expense" ? -1 : 0;
  return direction === "income" ? 1 : 0;
}
