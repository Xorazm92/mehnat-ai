// =====================================================
// OPERATSION vs SPRAVOCHNIK TASNIFI — yangi hisob davriga toza start
// =====================================================
// Bazadagi HAR BIR Prisma modeli aynan bitta chelakka tegishli:
//
//   OPERATIONAL_TABLES — pul, ball, hisobot, xabar: tozalashda o'chadi.
//   REFERENCE_TABLES   — kim ishlaydi, qaysi firmalar, qanday qoidalar: qoladi.
//   AUDIT_MODEL        — kim nima qilganining izi: ataylab alohida.
//
// Ro'yxat shu yerda yashaydi, chunki uni ikki iste'molchi o'qiydi:
// `scripts/reset-operational-data.ts` (o'chiradi) va
// `scripts/verify-clean-start.ts` (o'chganini isbotlaydi). Nusxa saqlansa,
// ikkisi vaqt o'tib bir-biridan uzoqlashardi va verify yolg'on "OK" berardi.
//
// `lib/operationalTables.spec.ts` schema bilan sinxronligini ushlab turadi:
// yangi model qo'shilsa test qulaydi va uni tasniflashga majbur qiladi.

export interface OperationalTable {
  /** Prisma model nomi (delegate kaliti, masalan "kassaEntry"). */
  model: string;
  /** Nima uchun operatsion deb hisoblanadi — hisobotda shu matn chiqadi. */
  why: string;
}

/**
 * O'chirish TARTIBI muhim: bola jadval avval ketadi, aks holda tashqi kalit
 * cheklovi to'sadi (hamma bog'lanish ham `onDelete: Cascade` emas).
 */
export const OPERATIONAL_TABLES: OperationalTable[] = [
  // Majburiyat zanjiri (eng chuqur boladan boshlab)
  { model: "submissionEvidence", why: "majburiyat dalillari" },
  { model: "obligationSubmission", why: "majburiyat topshirishlari" },
  { model: "obligationStatusEvent", why: "majburiyat holat tarixi" },
  { model: "obligationAssignmentEvent", why: "majburiyat biriktirish tarixi" },
  { model: "obligation", why: "majburiyatlar (har oy qayta generatsiya qilinadi)" },

  // Bot: savol/javob va xabar tarixi
  { model: "answer", why: "javoblar" },
  { model: "question", why: "mijoz savollari (SLA)" },
  { model: "clientRequest", why: "mijoz portali murojaatlari" },
  { model: "telegramMessage", why: "guruh xabarlari tarixi" },
  { model: "processedUpdate", why: "Telegram dedup jurnali" },

  // Vazifa / SLA
  { model: "slaBreach", why: "SLA buzilishlari" },
  { model: "taskEvent", why: "vazifa hodisalari" },
  { model: "task", why: "vazifalar" },

  // Xabarnomalar
  { model: "notificationDelivery", why: "yetkazish jurnali (eskalatsiya dedup)" },
  { model: "notification", why: "ilova ichidagi xabarlar" },
  { model: "paymentReminder", why: "to'lov eslatmalari tarixi" },

  // Moliya: ledger va davr
  { model: "ledgerEntry", why: "ikki tomonlama yozuvlar" },
  { model: "financialSnapshot", why: "oy yopish suratlari" },
  { model: "accountingPeriod", why: "hisob davrlari (qulflar)" },

  // Moliya: hujjatlar
  { model: "payout", why: "real to'lovlar" },
  { model: "payrollAdjustment", why: "oylik: bonus/jarima/avans/hisoblangan" },
  { model: "invoice", why: "chiqarilgan hisob-fakturalar" },
  { model: "payment", why: "mijoz to'lovlari" },
  { model: "expense", why: "xarajatlar" },
  { model: "kassaEntry", why: "kassa kirim/chiqim" },

  // KPI
  { model: "monthlyPerformance", why: "KPI baholari (oylikka ta'sir qiladi)" },
  { model: "kpiEvent", why: "KPI ledgeri (bot signallari)" },
  { model: "fairKpiScore", why: "adolatli KPI (shadow)" },

  // Davomat / vaqt
  { model: "attendance", why: "davomat" },
  { model: "shiftCover", why: "almashinuv (davomat bilan juft ketadi)" },
  { model: "timeEntry", why: "vaqt hisobi" },

  // Hisobot matritsasi
  { model: "reportProof", why: "hisobot dalillari (skrinshotlar)" },
  { model: "monthlyReport", why: "amallar matritsasi kataklari" },
  { model: "financialReport", why: "moliyaviy hisobotlar" },
  { model: "operation", why: "yillik hisobot statuslari (foyda/forma/statistika)" },

  // Integratsiya (IntegrationEvent.syncRunId = SetNull → tartib erkin)
  { model: "integrationEvent", why: "1C hodisalari navbati" },
  { model: "syncError", why: "1C sinxron xatolari (DLQ)" },
  { model: "syncRun", why: "1C sinxron yugurishlari tarixi" },
];

/**
 * Tozalashdan keyin ham turishi kerak bo'lgan jadvallar. `Document` ataylab
 * shu yerda: unda fayl emas, havola saqlanadi (`filePath` — URL yoki ilova
 * ichidagi yo'l), ya'ni u firma kartotekasining bir qismi.
 */
export const REFERENCE_TABLES: string[] = [
  "user",
  "company",
  "department",
  "contractAssignment",
  "kpiRule",
  "companyKpiRule",
  "slaPolicy",
  "deadlineTemplate",
  "templateApplicability",
  "companyObligationOverride",
  "businessCalendarDay",
  "systemSetting",
  "clientCredential",
  "clientUser",
  "telegramGroup",
  "inventoryItem",
  "document",
  "employeeCostRate",
  "oneCConnection",
  "oneCCompanyMapping",
];

/**
 * Spravochnikning bo'sh bo'lishi mumkin bo'lmagan qismi. Bularsiz tizim
 * ishlamaydi: kirish yo'q (`user`), mijoz yo'q (`company`), kim qaysi firmaga
 * biriktirilgani yo'q (`contractAssignment`), KPI hisoblanmaydi (`kpiRule`),
 * sozlama yo'q (`systemSetting`), muddat generatsiya qilinmaydi
 * (`deadlineTemplate`).
 */
export const REQUIRED_REFERENCE: string[] = [
  "user",
  "company",
  "contractAssignment",
  "kpiRule",
  "systemSetting",
  "deadlineTemplate",
];

/**
 * AuditLog ATAYIN operatsion ro'yxatda emas: u kim nima qilganining izi va
 * tozalashda saqlanadi. Reset skriptida faqat aniq `--with-audit` bilan
 * o'chadi; clean-start runbook'i bu bayroqni umuman ishlatmaydi.
 */
export const AUDIT_MODEL = "auditLog";
