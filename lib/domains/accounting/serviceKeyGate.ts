// =====================================================
// service_key DARVOZASI — moslik auditi va migratsiya uchun yagona qoida
// =====================================================
// `DeadlineTemplate.matrixKey` matritsa ustunini nomlaydi, `Company.activeServices`
// esa xuddi shu lug'atdagi kalitlar ro'yxati. Ular orasidagi bog'lanish
// `TemplateApplicability(criteriaType="service_key")` qatori orqali quriladi.
//
// NEGA ALOHIDA FAYL. Bu predikatni audit skripti ham, kelajakdagi migratsiya
// skripti ham ishlatadi. Ikkovi bir xil javob berishi SHART — aks holda audit
// "1 704 ta tegiladi" deb, migratsiya boshqa to'plamni yozardi. Shu sababli
// qoida bir marta yozilgan va test bilan qotirilgan (test/service-key-gate.test.ts).
//
// DOMEN QATLAMI: `lib/engines/**` bu faylni import QILMAYDI (Konstitutsiya 4a) —
// engine `service_key` degan atamani bilmaydi, u faqat atributlarni taqqoslaydi.

/** Auditga kerakli shablon kesimi. */
export interface TemplateGateFacts {
  matrixKey: string | null;
  applicability: Array<{ criteriaType: string; criteriaValue: string }>;
}

/** Migratsiya qarorini beradigan firma kesimi. */
export interface CompanyGateFacts {
  id: string;
  activeServices: string[];
}

/**
 * Shablon `matrixKey` orqali xizmatga bog'langan, lekin `service_key` qoidasi
 * YO'Q — ya'ni u shu mezon bo'yicha UNIVERSAL ishlaydi va kaliti yo'q
 * firmalarga ham tushadi. Migratsiya nomzodlari aynan shular.
 */
export function needsServiceKeyRule(t: TemplateGateFacts): boolean {
  if (t.matrixKey === null) return false;
  return !t.applicability.some((a) => a.criteriaType === "service_key");
}

/**
 * Ma'lumot ishonchli deb sanaladigan eng kam kalit soni.
 *
 * PRODDA O'LCHANGAN TAQSIMOT (2026-09-07, 270 faol mijoz firma):
 *
 *     0 kalit      31 firma   ← ma'lumot umuman yo'q
 *     1-2 kalit     4 firma  ┐
 *     3-5 kalit    12 firma  ┘ 16 firma — ro'yxat aniq chala
 *     6-10 kalit    4 firma
 *     11-20 kalit  64 firma
 *     21+ kalit   155 firma   ← odatiy to'liq firma
 *
 * Odatdagi firmada 21+ kalit bor. UMID HOSPITAL da bittasi ("ekologiya"),
 * TEN BRANCHES da ikkitasi. Bunday ro'yxatni "firma qolgan 23 ta hisobotni
 * topshirmaydi" deb o'qish — bo'sh ro'yxatni shunday o'qish bilan bir xil
 * xato, faqat bir qadam yashiringani bilan farq qiladi.
 *
 * Shuning uchun chegara: 6 tadan kam kalit → BILMAYMIZ, tegilmaydi.
 * Chetlab o'tiladigan firma 31 emas, 47 ta.
 */
export const MIN_TRUSTED_KEYS = 6;

export type GateVerdict =
  /** Kaliti bor — qoida qo'shilsa hech narsa o'zgarmaydi. */
  | "has_key"
  /** Kaliti yo'q, lekin ro'yxati to'liq ⇒ ishonchli "topshirmaydi". */
  | "missing_key"
  /**
   * Kalitlar ro'yxati yo'q yoki chala ⇒ firma nima topshirishini BILMAYMIZ.
   *
   * Bu "topshirmaydi" DEGANI EMAS. Engine uchun chala ro'yxat ham `includes`
   * ni false qaytaradi, ya'ni qoida qo'shilsa bu firmalar tushib qolardi —
   * lekin bu ma'lumot yo'qligini qaror deb ko'rsatish bo'lardi. Shuning uchun
   * migratsiya bunday firmalarni butunlay chetlab o'tadi.
   */
  | "unknown_incomplete";

/** Bitta firma uchun qaror. */
export function gateVerdict(
  matrixKey: string,
  c: CompanyGateFacts,
  minKeys: number = MIN_TRUSTED_KEYS,
): GateVerdict {
  if (c.activeServices.length < minKeys) return "unknown_incomplete";
  return c.activeServices.includes(matrixKey) ? "has_key" : "missing_key";
}

export interface GateScope {
  /** Kaliti bor — tegilmaydi. */
  hasKey: CompanyGateFacts[];
  /** Kaliti yo'q — majburiyatlari bekor bo'ladi. */
  missingKey: CompanyGateFacts[];
  /** Ro'yxati chala yoki yo'q — HISOBDAN CHIQARILADI. */
  excluded: CompanyGateFacts[];
}

/** Bitta shablon uchun firmalarni uch toifaga ajratadi. */
export function gateScope(
  matrixKey: string,
  companies: CompanyGateFacts[],
  minKeys: number = MIN_TRUSTED_KEYS,
): GateScope {
  const scope: GateScope = { hasKey: [], missingKey: [], excluded: [] };
  for (const c of companies) {
    const v = gateVerdict(matrixKey, c, minKeys);
    if (v === "has_key") scope.hasKey.push(c);
    else if (v === "missing_key") scope.missingKey.push(c);
    else scope.excluded.push(c);
  }
  return scope;
}
