// =====================================================
// NORMATIV MEHNAT — daqiqa, taymer emas (ADR-0010)
// =====================================================
// Sig'im hisoblash uchun har ishning mehnat sarfi kerak. Ikki yo'l bor edi:
// xodimlarga taymer bosdirish yoki har ish turiga norma belgilash. Birinchisi
// o'lchov emas, nazorat marosimi: u qarshilik tug'diradi, to'ldirilmaydi, va
// to'ldirilganda ham haqiqatni emas, kutilgan raqamni ko'rsatadi.
//
// Shuning uchun norma. `DeadlineTemplate.normativeMinutes` — bosh buxgalter
// qo'yadigan qiymat; u BO'SH bo'lsa ish turiga ko'ra taxminiy standart
// ishlatiladi. Taxmin ekani yashirilmaydi: `estimated` bayrog'i qaytariladi
// va UI uni "taxminiy" deb belgilaydi (Konstitutsiya, 7-modda).
//
// Standartlar bugungi 25 template'ning HECH BIRIDA to'ldirilmagan, ya'ni
// ularsiz sig'im balli hamma uchun nol chiqardi — bu esa "hamma bo'sh" degan
// yolg'on. Taxminiy raqam noaniq, nol esa noto'g'ri.
//
// NEGA BAZAGA EKILMAYDI. Ekilgan taxmin — qaror bo'lib ko'rinadi: keyin uni
// kim qo'ygani, o'ylab qo'yilganmi yoki standartmi — bilib bo'lmaydi. Bo'sh
// ustun esa "hali hal qilinmagan" degani, va admin formasi shuni ko'rsatadi.

/** Ish turiga ko'ra taxminiy mehnat, daqiqada. */
export const DEFAULT_NORMATIVE_MINUTES: Record<string, number> = {
  tax_declaration: 45,
  tax_payment: 15,
  statistics: 30,
  financial_statement: 90,
  internal_task: 30,
  client_service: 20,
};

/** Turi ham noma'lum bo'lsa. */
export const FALLBACK_MINUTES = 30;

export interface EffortSource {
  normativeMinutes: number | null;
  obligationType: string;
}

export interface Effort {
  minutes: number;
  /** `true` — bosh buxgalter emas, standart aytdi. */
  estimated: boolean;
}

export function normativeEffort(t: EffortSource): Effort {
  if (t.normativeMinutes != null && t.normativeMinutes > 0) {
    return { minutes: t.normativeMinutes, estimated: false };
  }
  return { minutes: DEFAULT_NORMATIVE_MINUTES[t.obligationType] ?? FALLBACK_MINUTES, estimated: true };
}
