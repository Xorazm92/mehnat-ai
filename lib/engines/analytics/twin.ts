// =====================================================
// DIGITAL TWIN — uch ball (Faza C1)
// =====================================================
// Risk · Capacity · Compliance. Sof funksiyalar: DB yo'q, Prisma yo'q, domen
// lug'ati yo'q. Kirish — raqamlar, chiqish — ball VA UNING SABABI.
//
// NEGA SABAB BALLNING BIR QISMI, ILOVASI EMAS.
// Konstitutsiya 7-moddasi: manbagacha kuzatib bo'lmaydigan raqam ko'rsatilmaydi.
// Sabab alohida funksiyada hisoblansa, u ballning haqiqiy formulasidan
// ajralib qolishi muqarrar — birini o'zgartirasan, ikkinchisi eskiradi va
// ekranda "Risk 42%, chunki hech nima" chiqadi. Shuning uchun `reasons`
// ballni HOSIL QILGAN qo'shiluvchilarning o'zi: ularning yig'indisi qiymatga
// teng (`twin.spec.ts` shuni tekshiradi).
//
// NEGA "HEALTH" YO'Q.
// To'rt ballning vaznli yig'indisi — bitta chiroyli raqam, lekin u hech qanday
// harakat bermaydi: past bo'lsa ham nima qilishni bilish uchun baribir
// tarkibiy ballarga qaraladi. Uchtasi to'g'ridan-to'g'ri ko'rsatiladi.
//
// NEGA `value` `null` BO'LA OLADI.
// Majburiyati yo'q firmaning muvofiqligi 100% emas — u NOMA'LUM. Yo'q
// ma'lumotni "a'lo" deb ko'rsatish — dashboard yolg'onining eng keng tarqalgan
// shakli, va u aynan e'tibor kerak bo'lgan firmani ko'rinmas qiladi.

/** Tashvish darajasi — HAR uch ballda bir xil yo'nalish: `low` = yaxshi. */
export type ConcernLevel = "unknown" | "low" | "medium" | "high";

export interface ScoreReason {
  /** Barqaror kalit — UI tarjimasi va testlar shunga bog'lanadi. */
  code: string;
  /** Shu sabab ballga qo'shgan ulush. Yig'indisi = `value`. */
  points: number;
  /** Raqamning o'zi: "3 ta muddat o'tgan", "eng chuqur kechikish 12 kun". */
  detail: string;
}

export interface Score {
  /** `null` — o'lchab bo'lmaydi (ma'lumot yo'q), "yaxshi" EMAS. */
  value: number | null;
  level: ConcernLevel;
  reasons: ScoreReason[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const share = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : 0);
const cap = (n: number, max: number) => Math.max(0, Math.min(max, n));

const unknown = (code: string, detail: string): Score => ({
  value: null,
  level: "unknown",
  reasons: [{ code, points: 0, detail }],
});

// ─────────────────────────────────────────────
// RISK — kechikish ehtimoli, 0-100 (yuqori = yomon)
// ─────────────────────────────────────────────

export interface RiskInput {
  /** Muddati o'tgan va hali yopilmagan majburiyatlar. */
  overdue: number;
  /** Eng chuqur kechikish, kunlarda. Chuqurlik sondan xavfliroq. */
  maxOverdueDays: number;
  /** Rad etilgan (qayta ishlash talab qilgan). */
  rejected: number;
  /** Davrdagi jami majburiyat — maxraj. */
  total: number;
  /** Javobsiz savollar: ish to'xtagan va javob boshqa tomonda. */
  unanswered: number;
  /** Mas'ulning yuklamasi, foizda. 100 dan yuqorisi xavf qo'shadi. */
  responsibleLoadPct: number | null;
}

/** Har qo'shiluvchining shipi — yig'indisi 100. */
export const RISK_WEIGHTS = { depth: 30, breadth: 25, rejection: 20, unanswered: 15, overload: 10 } as const;

/** Shu kundan chuqur kechikish to'liq ball beradi. */
const DEPTH_SATURATION_DAYS = 30;
/** Shu sondan ko'p javobsiz savol to'liq ball beradi. */
const UNANSWERED_SATURATION = 3;

export function riskScore(i: RiskInput): Score {
  if (i.total <= 0) return unknown("no_obligations", "davrda majburiyat yo'q");

  const reasons: ScoreReason[] = [];
  const add = (code: string, points: number, detail: string) => {
    if (points > 0) reasons.push({ code, points: round1(points), detail });
  };

  add(
    "overdue_depth",
    share(i.maxOverdueDays, DEPTH_SATURATION_DAYS) * RISK_WEIGHTS.depth,
    `eng chuqur kechikish ${i.maxOverdueDays} kun`,
  );
  add("overdue_breadth", share(i.overdue, i.total) * RISK_WEIGHTS.breadth, `${i.overdue}/${i.total} muddati o'tgan`);
  add("rejected", share(i.rejected, i.total) * RISK_WEIGHTS.rejection, `${i.rejected} ta rad etilgan`);
  add(
    "unanswered",
    share(i.unanswered, UNANSWERED_SATURATION) * RISK_WEIGHTS.unanswered,
    `${i.unanswered} ta javobsiz savol`,
  );
  if (i.responsibleLoadPct != null && i.responsibleLoadPct > 100) {
    add(
      "responsible_overload",
      cap((i.responsibleLoadPct - 100) / 100, 1) * RISK_WEIGHTS.overload,
      `mas'ul ${Math.round(i.responsibleLoadPct)}% yuklamada`,
    );
  }

  const value = round1(reasons.reduce((s, r) => s + r.points, 0));
  if (reasons.length === 0) reasons.push({ code: "clean", points: 0, detail: "kechikish ham, rad etish ham yo'q" });
  return { value, level: value < 20 ? "low" : value < 50 ? "medium" : "high", reasons };
}

// ─────────────────────────────────────────────
// COMPLIANCE — o'z vaqtida yopilgan ulush, 0-100 (yuqori = yaxshi)
// ─────────────────────────────────────────────

export interface ComplianceInput {
  /** Muddatidan oldin yoki muddatida qabul qilingan. */
  onTime: number;
  /** Yopilgan majburiyatlar (qabul qilingan + kechikkan). */
  closed: number;
  /** Hali ochiq, lekin muddati o'tgan — ular ham hisobda. */
  overdueOpen: number;
}

export function complianceScore(i: ComplianceInput): Score {
  const denom = i.closed + i.overdueOpen;
  if (denom <= 0) return unknown("nothing_due", "muddati kelgan majburiyat yo'q");

  const value = round1((i.onTime / denom) * 100);
  const late = denom - i.onTime;
  const reasons: ScoreReason[] = [
    { code: "on_time", points: value, detail: `${i.onTime}/${denom} o'z vaqtida` },
  ];
  if (late > 0) {
    reasons.push({ code: "late", points: 0, detail: `${late} ta kechikkan yoki ochiq qolgan` });
  }
  return { value, level: value >= 90 ? "low" : value >= 70 ? "medium" : "high", reasons };
}

// ─────────────────────────────────────────────
// CAPACITY — yuklama foizi (100 dan yuqori = sig'imdan oshgan)
// ─────────────────────────────────────────────

export interface CapacityItem {
  /** Bitta ishning normativ mehnati, daqiqada. */
  normativeMinutes: number;
  /** Murakkablik ko'paytmasi — bir xil ish har subyektda bir xil turmaydi. */
  complexityWeight: number;
}

export interface CapacityInput {
  items: CapacityItem[];
  /** Davrdagi ish fondi, daqiqada. 0 bo'lsa — o'lchab bo'lmaydi. */
  availableMinutes: number;
}

/** Yuklama 100 dan ancha oshishi mumkin; ekran uchun cheklanadi. */
const MAX_LOAD_PCT = 999;

export function capacityLoad(i: CapacityInput): Score {
  if (i.availableMinutes <= 0) return unknown("no_work_fund", "ish fondi noma'lum");
  if (i.items.length === 0) {
    return { value: 0, level: "low", reasons: [{ code: "idle", points: 0, detail: "biriktirilgan ish yo'q" }] };
  }

  const minutes = i.items.reduce((s, it) => s + it.normativeMinutes * it.complexityWeight, 0);
  const value = round1(Math.min(MAX_LOAD_PCT, (minutes / i.availableMinutes) * 100));
  const hours = Math.round(minutes / 6) / 10;
  const fund = Math.round(i.availableMinutes / 6) / 10;
  return {
    value,
    level: value <= 90 ? "low" : value <= 110 ? "medium" : "high",
    reasons: [
      { code: "assigned_effort", points: value, detail: `${i.items.length} ta ish · ${hours} soat` },
      { code: "work_fund", points: 0, detail: `ish fondi ${fund} soat` },
    ],
  };
}

/** Ball izohi — "Risk 42% chunki: …". Shablon, model emas. */
export function explain(label: string, s: Score): string {
  if (s.value === null) return `${label}: noma'lum — ${s.reasons[0]?.detail ?? "ma'lumot yo'q"}`;
  const parts = s.reasons.filter((r) => r.detail).map((r) => r.detail);
  return `${label} ${s.value}% chunki: ${parts.join(", ")}`;
}
