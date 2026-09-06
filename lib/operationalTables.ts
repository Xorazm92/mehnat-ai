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
  /**
   * Tizim ishga tushishi bilan odam aralashuvisiz qayta to'ladi (sweep
   * eslatma yozadi, Telegram yangilanish yuboradi). Tozalashda o'chadi, lekin
   * keyin bo'sh emasligi NORMAL — `verify-clean-start.ts` bularni xato emas,
   * ogohlantirish deb hisoblaydi. Aks holda bot yoqilgandan keyingi tekshiruv
   * "tozalash o'tmagan" deb resetni QAYTA ishlatishni maslahat berardi.
   */
  refillsWhenLive?: true;
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
  { model: "lead", why: "CRM lidlari — mijozga aylanmagan murojaatlar" },

  // Bot: savol/javob va xabar tarixi
  { model: "answer", why: "javoblar" },
  { model: "question", why: "mijoz savollari (SLA)" },
  { model: "telegramMessage", why: "guruh xabarlari tarixi", refillsWhenLive: true },
  { model: "processedUpdate", why: "Telegram dedup jurnali", refillsWhenLive: true },

  // Vazifa / SLA
  { model: "taskEvent", why: "vazifa hodisalari" },
  { model: "task", why: "vazifalar" },

  // AI tavsiyalari va ular ustidagi qarorlar (M5.3). Yangi hisob davrida
  // ular ma'nosiz: har biri o'sha paytdagi majburiyat/qarzdorlik holatiga
  // bog'langan payload saqlaydi va tozalangan bazada bajarilib bo'lmaydi.
  // Spravochnik EMAS — hech qanday qoida saqlamaydi.
  { model: "recommendation", why: "AI/cron tavsiyalari va qarorlar", refillsWhenLive: true },

  // Xabarnomalar
  {
    model: "analyticsEvent",
    // Foydalanish o'lchovi — kim qaysi ekranni ochdi. Spravochnik EMAS: u
    // hech qanday qoida yoki biriktiruvni saqlamaydi, faqat tarix to'playdi.
    why: "foydalanish hodisalari (kokpit tashriflari)",
    refillsWhenLive: true,
  },
  { model: "notificationDelivery", why: "yetkazish jurnali (eskalatsiya dedup)", refillsWhenLive: true },
  { model: "notification", why: "ilova ichidagi xabarlar", refillsWhenLive: true },
  { model: "paymentReminder", why: "to'lov eslatmalari tarixi" },

  // Schyot-faktura: mijozga berilgan hujjat, ya'ni davrga bog'langan pul
  // yozuvi. Satr avval o'chadi (kaskadga tayanmasdan — tartib ochiq tursin).
  { model: "invoiceLine", why: "schyot satrlari" },
  { model: "invoice", why: "schyot-fakturalar (har oy qayta yoziladi)" },

  // Fiskal / POS: kunlik savdo va bank hisob-kitobi — sof operatsion qatlam.
  // Qurilma va terminalning O'ZI spravochnikda qoladi (pastda).
  { model: "posSettlement", why: "POS hisob-kitoblari (vipiskadan)" },
  { model: "fiscalDailyReport", why: "fiskal kunlik savdo hisoboti" },
  { model: "fiscalReportImport", why: "fiskal hisobot import jurnali" },

  // Moliya: ledger va davr
  { model: "ledgerEntry", why: "ikki tomonlama yozuvlar" },
  { model: "financialSnapshot", why: "oy yopish suratlari" },
  { model: "accountingPeriod", why: "hisob davrlari (qulflar)" },

  // Moliya: tranzit (xodim kartasi) — KassaEntry'dan OLDIN, chunki chiqim
  // yozuvi o'sha yerda hosil bo'ladi. Kanallarning O'ZI spravochnik.
  { model: "transitEntry", why: "xodim kartasidagi pul harakati" },

  // Moliya: bank vipiskasi (Payment'dan OLDIN — allocation unga bog'langan)
  { model: "paymentAllocation", why: "bank tranzaksiyasining to'lovga taqsimoti" },
  { model: "bankTransaction", why: "vipiskadagi xom tranzaksiyalar" },
  { model: "bankStatementImport", why: "yuklangan vipiska fayllari" },
  // 1C qarzdorlik kesimlari — hisob davriga bog'langan operatsion ma'lumot.
  // Yangi hisob davri yangi kesimlar bilan boshlanadi.
  { model: "debtSnapshot", why: "1C qarzdorlik kesimlari" },
  // Oylik reja/fakt — hisob davriga bog'langan; yangi yil yangi reja bilan.
  { model: "monthlyTarget", why: "oylik reja va fakt ko'rsatkichlari" },

  // Moliya: hujjatlar
  { model: "payout", why: "real to'lovlar" },
  { model: "payrollAdjustment", why: "oylik: bonus/jarima/avans/hisoblangan" },
  { model: "payment", why: "mijoz to'lovlari" },
  { model: "kassaEntry", why: "kassa kirim/chiqim" },

  // KPI
  { model: "monthlyPerformance", why: "KPI baholari (oylikka ta'sir qiladi)" },
  { model: "kpiEvent", why: "KPI ledgeri (bot signallari)" },

  // Davomat / vaqt
  { model: "attendance", why: "davomat" },
  { model: "shiftCover", why: "almashinuv (davomat bilan juft ketadi)" },

  // Hisobot matritsasi
  { model: "reportProof", why: "hisobot dalillari (skrinshotlar)" },
  { model: "monthlyReport", why: "amallar matritsasi kataklari" },
  { model: "financialReport", why: "moliyaviy hisobotlar" },

  // Integratsiya (IntegrationEvent.syncRunId = SetNull → tartib erkin)
  { model: "integrationEvent", why: "1C hodisalari navbati", refillsWhenLive: true },
  { model: "syncError", why: "1C sinxron xatolari (DLQ)" },
  { model: "syncRun", why: "1C sinxron yugurishlari tarixi" },
];

/**
 * Tozalashdan keyin ham turishi kerak bo'lgan jadvallar. `Document` ataylab
 * shu yerda: shartnoma skani, litsenziya va guvohnoma firma kartotekasining
 * bir qismi — davr ma'lumoti emas. Tozalashda o'chsa, qayta tiklashning
 * iloji yo'q (fayl faqat shu yerda turadi).
 */
export const REFERENCE_TABLES: string[] = [
  "user",
  "company",
  "department",
  "contractAssignment",
  "kpiRule",
  "companyKpiRule",
  "deadlineTemplate",
  "templateApplicability",
  // Firma darajasidagi istisno — shablon qoidasining bir qismi, ya'ni
  // sozlama. Majburiyat qayta generatsiya qilinganda ham saqlanadi.
  "companyObligationOverride",
  "oneCConnection",
  "oneCCompanyMapping",
  "businessCalendarDay",
  "systemSetting",
  "clientCredential",
  "telegramGroup",
  // Bank hisobi va shartnoma — firma kartotekasining bir qismi, qo'lda
  // yig'ilgan/1C dan import qilingan. Yangi hisob davri ular bilan boshlanadi:
  // tozalashda o'chsa, keyingi vipiskani bog'laydigan joy qolmasdi.
  "bankAccount",
  "contract",
  // Shartnoma summasi versiyalangan (`effectiveFrom` bilan) — bu narx
  // kelishuvi, pul harakati emas. Tozalashda o'chsa, yangi davrda har bir
  // firmaning summasi va bank/plastik/naqd taqsimoti qo'lda qayta
  // kiritilishi kerak bo'lardi.
  "companyServiceTerm",
  // 1C va vipiskadagi xom nomlarni firmaga bog'laydigan lug'at. Qo'lda
  // yig'iladi; o'chsa keyingi importda o'sha nomlar yana tanilmay qoladi.
  "companyAlias",
  "disbursementChannel",
  // Kartalar kanalning (odamning) atributi — kim qaysi karta bilan ishlashi
  // qo'lda yig'ilgan ma'lumot. Tozalashda o'chsa, keyingi vipiskadagi karta
  // o'tkazmasini kimga bog'lashni tizim bilmay qolardi.
  "channelCard",
  // Sotiladigan xizmatlar katalogi va uning firma bo'yicha narxi — narx
  // kelishuvi, pul harakati emas (`companyServiceTerm` bilan bir mantiq).
  "service",
  "companyService",
  // Firma hujjatlari arxivi — yuqoridagi izohga qarang.
  "document",
  // Fiskal apparat va POS terminal — jismoniy qurilmalar ro'yxati. Savdo
  // ma'lumoti operatsion (yuqorida), qurilmaning o'zi esa kartotekaning
  // bir qismi: o'chsa keyingi importda kod hech kimga bog'lanmay qolardi.
  "fiscalDevice",
  "posTerminal",
];

/**
 * Spravochnikning bo'sh bo'lishi mumkin bo'lmagan qismi. Bularsiz tizim
 * ishlamaydi: kirish yo'q (`user`), mijoz yo'q (`company`), kim qaysi firmaga
 * biriktirilgani yo'q (`contractAssignment`), KPI hisoblanmaydi (`kpiRule`),
 * sozlama yo'q (`systemSetting`).
 *
 * Bo'sh bo'lsa yagona javob — zaxiradan tiklash, chunki bu ma'lumot qo'lda
 * yig'ilgan. `deadlineTemplate` ataylab bu ro'yxatda EMAS: u ham majburiy,
 * lekin uni seed skripti qayta yarata oladi, ya'ni maslahat boshqa. Uni
 * `verify-clean-start.ts` dagi checkTemplates() alohida tekshiradi.
 */
export const REQUIRED_REFERENCE: string[] = [
  "user",
  "company",
  "contractAssignment",
  "kpiRule",
  "systemSetting",
];

/**
 * AuditLog ATAYIN operatsion ro'yxatda emas: u kim nima qilganining izi va
 * tozalashda saqlanadi. Reset skriptida faqat aniq `--with-audit` bilan
 * o'chadi; clean-start runbook'i bu bayroqni umuman ishlatmaydi.
 */
export const AUDIT_MODEL = "auditLog";
