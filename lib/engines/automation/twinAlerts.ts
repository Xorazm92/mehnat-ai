// =====================================================
// BALL OGOHLANTIRISHI — chegaradan o'tganda (C2)
// =====================================================
// Sof tanlov mantig'i: kirish — ballar, chiqish — kimga nima yuborilishi.
// DB ham, Telegram ham bu yerda yo'q (Konstitutsiya, 4a).
//
// ENG QIYIN QAROR — TAKRORLANISH. Soatlik ishchi har ishga tushganda yuborsa,
// bir hafta ichida ogohlantirish o'qilmaydigan shovqinga aylanadi va u bilan
// birga HAQIQIY xabarlar ham o'qilmay qoladi. Uch variant bor edi:
//
//   1. Har ishga tushishda — shovqin.
//   2. Kuniga bir marta — hali ham har kuni takrorlanadi.
//   3. Har DARAJA uchun bir marta, davr ichida — tanlangani.
//
// Uchinchisi "holat o'zgarganda xabar ber" qoidasi: firma `medium` dan `high`
// ga o'tsa — yangi xabar (daraja boshqa), `high` da turaverса — jim. Keyingi
// oy davr kaliti almashadi va hisob noldan boshlanadi, chunki oy — bu yerdagi
// tabiiy operatsion tsikl.
//
// Chegaradan PASTGA tushganda xabar yuborilmaydi: yaxshi yangilik shoshilinch
// emas, va u kabinada baribir ko'rinadi.

/** Ogohlantirish chegaralari. Bulardan YUQORISI xabar qiladi. */
export const ALERT_THRESHOLDS = { risk: 30, capacity: 150 } as const;

export type AlertKind = "risk" | "capacity";

export interface AlertSubject {
  /** Firma yoki xodim id'si. */
  id: string;
  name: string;
  value: number | null;
  level: string;
  /** Ball nima uchun shunday — xabar matnining o'zagi. */
  reasons: string[];
}

export interface TwinAlert {
  kind: AlertKind;
  subjectId: string;
  subjectName: string;
  value: number;
  level: string;
  reasons: string[];
  /** `NotificationDelivery.dedupKey` — takrorlanishning yagona to'sig'i. */
  dedupKey: string;
  text: string;
}

/**
 * `twin:<tur>:<subyekt>:<daraja>:<davr>`.
 *
 * Darajaning kalitda bo'lishi ataylab: yomonlashish YANGI xabar, o'sha
 * darajada qolish esa jimlik.
 */
export function alertDedupKey(kind: AlertKind, subjectId: string, level: string, period: string): string {
  return `twin:${kind}:${subjectId}:${level}:${period}`;
}

const LABEL: Record<AlertKind, string> = { risk: "Xavf", capacity: "Yuklama" };

export function alertText(kind: AlertKind, s: AlertSubject, value: number): string {
  const head = `⚠️ ${s.name} — ${LABEL[kind]} ${value}%`;
  return s.reasons.length > 0 ? `${head}\n${s.reasons.join(" · ")}` : head;
}

/**
 * Chegaradan o'tganlarni tanlaydi.
 *
 * `value === null` (o'lchanmagan) HECH QACHON ogohlantirmaydi: ma'lumot
 * yo'qligi xavf emas, u boshqa muammo va uni xabar bilan hal qilib bo'lmaydi.
 */
export function selectAlerts(kind: AlertKind, subjects: AlertSubject[], period: string): TwinAlert[] {
  const threshold = ALERT_THRESHOLDS[kind];
  const out: TwinAlert[] = [];
  for (const s of subjects) {
    if (s.value == null || s.value <= threshold) continue;
    out.push({
      kind,
      subjectId: s.id,
      subjectName: s.name,
      value: s.value,
      level: s.level,
      reasons: s.reasons,
      dedupKey: alertDedupKey(kind, s.id, s.level, period),
      text: alertText(kind, s, s.value),
    });
  }
  // Eng yomoni birinchi — yuborish cheklansa ham muhimi ketadi.
  return out.sort((a, b) => b.value - a.value);
}
