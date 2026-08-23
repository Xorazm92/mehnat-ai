// =====================================================
// TRANZIT DAFTARINI EXCEL EKSPORTIDAN O'QISH
// =====================================================
//
// Ikki fayl o'qiladi:
//   `Band qilganlar`      → kanallar (o'zini-o'zi band qilgan shaxslar, karta)
//   `O'zini-o'zi band …`  → har bir xodimning kirim/chiqim daftari
//
// UCHTA TUZOQ BOR — uchalasi ham real ma'lumotda uchradi va jim xato beradi:
//
// 1) `summa` yorlig'i UCH MARTA takrorlanadi (kirim summasi, chiqim Summa,
//    qoldiq summa). Kalitni yorliq bo'yicha izlash oxirgisini oladi.
//
// 2) USTUNLAR TARTIBI HAR VARAQDA HAR XIL: ba'zi varaqda `comment` ustuni
//    bor, ba'zisida yo'q. Shuning uchun qat'iy indeks ishlatib bo'lmaydi —
//    Otabek varag'ida chiqim 5-ustunda, Abrorda 6-ustunda. Qat'iy indeks
//    bilan o'qiganda Otabekning 38.9 mln chiqimi umuman ko'rinmagan edi.
//
// 3) Varaq oxirida JAMI qatori turadi (`#` ustuni bo'sh, `data` = "TOTAL").
//    U kirim yig'indisini takrorlaydi — hisobga olinsa summa ikki barobar
//    bo'lib ketadi.
//
// Qoida: ustunlar YORLIQ TARTIBI bo'yicha olinadi (birinchi `summa` — kirim,
// ikkinchisi — chiqim, uchinchisi — qoldiq), qator esa faqat `#` ustuni SON
// bo'lganda ma'lumot deb qabul qilinadi.

import { toDate, toAmount, cleanText } from "@/lib/bank/normalize";

export class TransitParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitParseError";
  }
}

type Row = Record<string, unknown>;

// ─────────────────────────────────────────────────────────
// KANALLAR — "Band qilganlar" varag'i
// ─────────────────────────────────────────────────────────

export interface ParsedChannelPerson {
  fullName: string;
  /** Firma(mehnat) — qaysi o'z firmada rasmiylashtirilgan. */
  ownFirmName: string | null;
  mfo: string | null;
  transitAccount: string | null;
  /** To'liq karta raqami — saqlashda niqoblanadi. */
  cardNumber: string | null;
  engagedAt: Date | null;
  activityType: string | null;
  certificateNo: string | null;
  pinfl: string | null;
}

/**
 * Ismni SOLISHTIRISH uchun normallashtiradi.
 *
 * Bir odam uch xil yozilishi mumkin:
 *   vipiskada  "ABRORBEK BOBOJONOV"        (o'tkazma matnidan)
 *   reyestrda  "BOBOJONOV ABRORBEK"        (familiya oldin)
 *   rus/lotin  "KHIKMATULLAEVA MAHMUDAKHON" ↔ "XIKMATULLAYEVA MAHMUDAXON"
 *
 * Shuning uchun: apostroflar olib tashlanadi, `kh→x`, `ye→e`, so'zlar
 * SARALANADI. Natijada uchala variant bir xil kalit beradi.
 */
export function nameKey(raw: string): string {
  const folded = raw
    .toLowerCase()
    .replace(/[`'‘’"]/g, "")
    .replace(/kh/g, "x")
    .replace(/ye/g, "e")
    .replace(/\s+/g, " ")
    .trim();
  return folded.split(" ").filter(Boolean).sort().join(" ");
}

/** "5614681263379541" → "5614****9541". To'liq raqam SAQLANMAYDI. */
export function maskCard(card: string | null | undefined): string | null {
  const digits = String(card ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

export function parseBandQilganlar(rows: Row[]): ParsedChannelPerson[] {
  // Yangi eksportlar JSON oqimida `null` elementlarni ham yuboradi —
  // ularni sarlavha va qator sifatida ko'rmaslik kerak.
  const solid = rows.filter((r): r is Row => !!r && typeof r === "object");
  const headerIndex = solid.findIndex((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() === "F.I.O")
  );

  // IKKI SHAKL. Eski faylda birinchi qator YORLIQ qator ("F.I.O": "F.I.O"…),
  // qiymatlar undan keyin keladi. Yangi eksportlarda yorliq qatori YO'Q —
  // birinchi qatordan ma'lumot boshlanadi va ustun nomlari o'zi KALIT.
  // Bunday holda kalitlarni barcha qatorlardan yig'ib, 0-qatordan o'qiymiz.
  let col: Record<string, string>;
  let dataStart: number;
  if (headerIndex === -1) {
    col = {};
    for (const r of solid) {
      for (const k of Object.keys(r)) {
        const label = String(k).trim();
        if (label && !(label in col)) col[label] = k;
      }
    }
    dataStart = 0;
    if (!("F.I.O" in col)) {
      throw new TransitParseError('"Band Xodimlar" varag\'ida "F.I.O" ustuni topilmadi');
    }
  } else {
    const header = solid[headerIndex];
    col = {};
    for (const [key, value] of Object.entries(header)) {
      const label = String(value ?? "").trim();
      if (label) col[label] = key;
    }
    dataStart = headerIndex + 1;
  }

  const pick = (row: Row, label: string): string | null =>
    col[label] ? cleanText(row[col[label]]) : null;

  const people: ParsedChannelPerson[] = [];
  for (const row of solid.slice(dataStart)) {
    const fullName = pick(row, "F.I.O");
    if (!fullName) continue;

    people.push({
      fullName,
      ownFirmName: pick(row, "Firma(mehnat)"),
      mfo: pick(row, "MFO"),
      transitAccount: pick(row, "Transit"),
      cardNumber: pick(row, "Karta nomer"),
      engagedAt: toDate(col["band sana"] ? row[col["band sana"]] : null),
      activityType: pick(row, "soha"),
      certificateNo: pick(row, "Ma'lumotnoma #"),
      pinfl: pick(row, "JSHSHIR"),
    });
  }
  return people;
}

// ─────────────────────────────────────────────────────────
// DAFTAR — har bir xodimning varag'i
// ─────────────────────────────────────────────────────────

export interface TransitMovement {
  /** Varaqdagi tartib raqami — takrorlanmaslik kaliti uchun. */
  rowNo: number;
  date: Date | null;
  /** Kirim: pul qaysi o'z firmadan kelgan. */
  sourceFirm: string | null;
  amountIn: number;
  /** Chiqim maqsadi: "Oylik", "O'ziga oylik", "Otabek akaga" … */
  purpose: string | null;
  comment: string | null;
  amountOut: number;
  commission: number;
}

export interface ParsedTransitSheet {
  person: string;
  movements: TransitMovement[];
  totalIn: number;
  totalOut: number;
  totalCommission: number;
  /** in − out − komissiya. `Total` varag'i bilan solishtiriladi. */
  balance: number;
  /** Varaq oxiridagi JAMI qatori (bo'lsa) — tekshiruv uchun. */
  declaredTotalIn: number | null;
}

/**
 * Ustunlarni YORLIQ TARTIBI bo'yicha topadi.
 *
 * `summa` uch marta uchraydi va varaqdan varaqqa ustun soni o'zgaradi,
 * shuning uchun ketma-ketlik ishlatiladi: 1-`summa` kirim, 2-si chiqim,
 * 3-si qoldiq. Katta-kichik harf farqi hisobga olinmaydi ("Summa").
 */
function resolveColumns(header: Row) {
  const keys = Object.keys(header);
  const labels = keys.map((k) => String(header[k] ?? "").trim().toLowerCase());

  const amountKeys = keys.filter((_, i) => labels[i] === "summa");
  if (amountKeys.length < 2) {
    throw new TransitParseError(
      `Daftar sarlavhasida kamida ikkita "summa" ustuni kutilgan, ${amountKeys.length} ta topildi`
    );
  }

  const at = (label: string) => {
    const i = labels.indexOf(label);
    return i === -1 ? null : keys[i];
  };

  return {
    no: keys[0],
    date: at("data"),
    firm: at("firma"),
    in: amountKeys[0],
    purpose: at("maqsad"),
    comment: at("comment"),
    out: amountKeys[1],
    commission: at("bank comission"),
    balance: amountKeys[2] ?? null,
  };
}

export function parseTransitSheet(person: string, rows: Row[]): ParsedTransitSheet {
  // JSON oqimidagi `null` elementlar ustun aniqlashda va o'qishda yiqitadi.
  const solid = rows.filter((r): r is Row => !!r && typeof r === "object");
  if (solid.length === 0) {
    return {
      person,
      movements: [],
      totalIn: 0,
      totalOut: 0,
      totalCommission: 0,
      balance: 0,
      declaredTotalIn: null,
    };
  }

  const col = resolveColumns(solid[0]);
  const movements: TransitMovement[] = [];
  let declaredTotalIn: number | null = null;
  // Sana faqat guruhning birinchi qatorida yoziladi; keyingi qatorlar
  // o'sha kunga tegishli.
  let lastDate: Date | null = null;

  for (const row of solid.slice(1)) {
    const marker = row[col.no];

    // JAMI qatori: `#` bo'sh, `data` ustunida "TOTAL". Uni ma'lumot deb
    // sanash kirim yig'indisini ikki barobar qilib yuboradi.
    if (typeof marker !== "number") {
      const value = toAmount(row[col.in]);
      if (value > 0) declaredTotalIn = value;
      continue;
    }

    const date: Date | null = toDate(col.date ? row[col.date] : null) ?? lastDate;
    if (date) lastDate = date;

    const amountIn = toAmount(row[col.in]);
    const amountOut = toAmount(row[col.out]);
    const commission = col.commission ? toAmount(row[col.commission]) : 0;
    if (amountIn === 0 && amountOut === 0 && commission === 0) continue;

    movements.push({
      rowNo: marker,
      date,
      sourceFirm: col.firm ? cleanText(row[col.firm]) : null,
      amountIn,
      purpose: col.purpose ? cleanText(row[col.purpose]) : null,
      comment: col.comment ? cleanText(row[col.comment]) : null,
      amountOut,
      commission,
    });
  }

  const totalIn = movements.reduce((s, m) => s + m.amountIn, 0);
  const totalOut = movements.reduce((s, m) => s + m.amountOut, 0);
  const totalCommission = movements.reduce((s, m) => s + m.commission, 0);

  return {
    person,
    movements,
    totalIn,
    totalOut,
    totalCommission,
    // Komissiya ham kartadan yechiladi — Musobekda 16 000 komissiya
    // hisobga olinmasa qoldiq 27 000 chiqadi, `Total` esa 11 000 deydi.
    balance: totalIn - totalOut - totalCommission,
    declaredTotalIn,
  };
}

/** `Total` varag'i — import natijasini solishtirish uchun. */
export interface TransitTotalsRow {
  person: string;
  monthIn: number;
  cardBalance: number;
}

export function parseTransitTotals(rows: Row[]): TransitTotalsRow[] {
  // JSON oqimidagi `null` elementlar Object.values'ni yiqitadi.
  const solid = rows.filter((r): r is Row => !!r && typeof r === "object");
  let headerIndex = solid.findIndex((r) =>
    Object.values(r).some((v) => String(v ?? "").trim().toLowerCase() === "name")
  );

  // IKKI SHAKL: eski faylda yorliq qatori ("Name" QIYMAT sifatida) bor;
  // yangida yo'q — ustun nomlari o'zi kalit ("Name", "AVGUST",
  // "kartadagi qoldiq"). Bunday holda birinchi to'liq qator yorliq hisobida.
  if (headerIndex === -1) {
    headerIndex = solid.findIndex(
      (r) => "Name" in r && Object.keys(r).some((k) => /qoldiq/i.test(k))
    );
    if (headerIndex === -1) return [];
  }

  const keys = Object.keys(solid[headerIndex]);
  const labels = keys.map((k) => String(solid[headerIndex][k] ?? "").trim().toLowerCase());
  const nameKey = labels.includes("name")
    ? keys[labels.indexOf("name")]
    : keys.find((k) => /^name$/i.test(k)) ?? keys.find((k) => /name/i.test(k))!;
  const balanceKey =
    keys.find((k) => String(solid[headerIndex][k] ?? "").trim().toLowerCase() === "kartadagi qoldiq") ??
    keys.find((k) => /qoldiq/i.test(k))!;
  // Oy ustuni nomi oyma-oy o'zgaradi ("IYUL"), shuning uchun nom bo'yicha
  // emas — ism bilan qoldiq orasidagi ustun sifatida olinadi.
  const monthKey = keys[keys.indexOf(balanceKey) - 1];

  const out: TransitTotalsRow[] = [];
  for (const row of solid.slice(headerIndex + 1)) {
    if (!row || typeof row !== "object") continue;
    const person = cleanText(row[nameKey]);
    if (!person) continue;
    out.push({
      person,
      monthIn: toAmount(row[monthKey]),
      cardBalance: toAmount(row[balanceKey]),
    });
  }
  return out;
}
