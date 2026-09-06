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

export type GateVerdict =
  /** Kaliti bor — qoida qo'shilsa hech narsa o'zgarmaydi. */
  | "has_key"
  /** Kaliti yo'q, lekin BOSHQA kalitlari bor ⇒ ishonchli "topshirmaydi". */
  | "missing_key"
  /**
   * Hech qanday kalit yozilmagan ⇒ firma nima topshirishini BILMAYMIZ.
   *
   * Bu "topshirmaydi" DEGANI EMAS. Engine uchun bo'sh ro'yxat `includes` ni
   * false qaytaradi, ya'ni qoida qo'shilsa bu firmalar ham tushib qolardi —
   * lekin bu ma'lumot yo'qligini qaror deb ko'rsatish bo'lardi. Shuning uchun
   * migratsiya bunday firmalarni butunlay chetlab o'tadi.
   */
  | "unknown_no_keys";

/** Bitta firma uchun qaror. */
export function gateVerdict(matrixKey: string, c: CompanyGateFacts): GateVerdict {
  if (c.activeServices.length === 0) return "unknown_no_keys";
  return c.activeServices.includes(matrixKey) ? "has_key" : "missing_key";
}

export interface GateScope {
  /** Kaliti bor — tegilmaydi. */
  hasKey: CompanyGateFacts[];
  /** Kaliti yo'q — majburiyatlari bekor bo'ladi. */
  missingKey: CompanyGateFacts[];
  /** Kalitsiz — HISOBDAN CHIQARILADI. */
  excluded: CompanyGateFacts[];
}

/** Bitta shablon uchun firmalarni uch toifaga ajratadi. */
export function gateScope(matrixKey: string, companies: CompanyGateFacts[]): GateScope {
  const scope: GateScope = { hasKey: [], missingKey: [], excluded: [] };
  for (const c of companies) {
    const v = gateVerdict(matrixKey, c);
    if (v === "has_key") scope.hasKey.push(c);
    else if (v === "missing_key") scope.missingKey.push(c);
    else scope.excluded.push(c);
  }
  return scope;
}
