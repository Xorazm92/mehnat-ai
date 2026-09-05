# ASRO hujjatlari — xarita

> Bu fayl **qaysi hujjat haq ekanini** aytadi. Repoda 40 dan ortiq `.md` bor va
> ularning ko'pi bir-biriga zid — chunki turli sanalarda, turli holatga qarab
> yozilgan. Zid ko'rinsa: **amaldagi** hujjat haq, qolgani tarix.

## Qaysi tartibda o'qiladi

| # | Hujjat | Nima uchun |
|---|---|---|
| 1 | [`PRODUCT.md`](./PRODUCT.md) | **Mahsulot ta'rifi. Kod bilan ziddiyat chiqsa — bu hujjat haq.** Nima quriladi va nima ATAYLAB qurilmaydi |
| 2 | [`CONSTITUTION.md`](./CONSTITUTION.md) | 10 modda — har birini buzganda build to'xtaydi |
| 3 | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Kod qayerda yashaydi va nega |
| 4 | [`adr/`](./adr/) | Qabul qilingan qarorlar, o'zgarmas yozuv |
| 5 | [`../CONTEXT.md`](../CONTEXT.md) | Domen tili — bitta tushuncha, bitta nom |
| 6 | [`QUALITY_BAR.md`](./QUALITY_BAR.md) | "Xalqaro daraja" ning o'lchanadigan ta'rifi |
| 7 | [`ICEBOX.md`](./ICEBOX.md) | Rad etilgan g'oyalar va rad etilish sababi |

Agentlar uchun qo'shimcha: [`../AGENTS.md`](../AGENTS.md), [`../CLAUDE.md`](../CLAUDE.md).

## Ish tartiblari (runbook · amaldagi)

| Hujjat | Qachon ochiladi |
|---|---|
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | AWS + asro.uz ga chiqarish |
| [`CLEAN_START_RUNBOOK.md`](./CLEAN_START_RUNBOOK.md) | Prod operatsion ma'lumotini tozalash |
| [`MIGRATION_RECONCILIATION.md`](./MIGRATION_RECONCILIATION.md) | `db push` bilan qurilgan bazani migratsiya tarixiga qaytarish |
| [`KASSA_IMPORT.md`](./KASSA_IMPORT.md) | Kassani Excel'dan ko'chirish |
| [`KASSA_BANK_SVERKA.md`](./KASSA_BANK_SVERKA.md) | Kassa apparati ↔ bank solishtiruvi |
| [`BOT_ONBOARDING.md`](./BOT_ONBOARDING.md) | Telegram botini jamoaga ulash |
| [`SOLIQ_TOLOV_KODLARI.md`](./SOLIQ_TOLOV_KODLARI.md) | Soliq hisobotlari va to'lov kodlari ma'lumotnomasi |

## [`plan/`](./plan/) — bajarilmagan ish

Reja hujjati **va'da emas**. Har birining tepasida holat qatori bor.

| Hujjat | Holat |
|---|---|
| [`plan/OBLIGATION_UNIFICATION_PLAN.md`](./plan/OBLIGATION_UNIFICATION_PLAN.md) | Migratsiya bajarilmagan — mahsulot yaxlitligi 3-to'lqini |
| [`plan/KASSA_UX_REDESIGN_PLAN.md`](./plan/KASSA_UX_REDESIGN_PLAN.md) | Katta qismi bajarildi |
| [`plan/UI_DEBT_MAP.md`](./plan/UI_DEBT_MAP.md) | UI qarzining hisobkitob varag'i |
| [`plan/KPI_BOT_BLUEPRINT.md`](./plan/KPI_BOT_BLUEPRINT.md) | Faza 1 bajarildi, qolgani reja |

## [`audit/`](./audit/) — tarix

Bu yerdagi hech bir hujjat **mo'ljal emas**. Ular qaror tarixini saqlaydi:
nima o'lchangan, nima topilgan, nima uchun shunday qilingan. Raqamlari yozilgan
kundagi holatga tegishli va qayta o'lchanmagan.

`PRODUCT.md` §Almashtiradi uchtasini ochiq bekor qiladi:
[`ASRO_CPO_AUDIT.md`](./audit/ASRO_CPO_AUDIT.md),
[`ASRO_PRODUCT_BLUEPRINT_2.0.md`](./audit/ASRO_PRODUCT_BLUEPRINT_2.0.md),
[`PROJECT_REVIEW.md`](./audit/PROJECT_REVIEW.md).

Qolganlari: moliya/kassa tekshiruvlari (`FINANCE_KPI_AUDIT`, `KASSA_REVIEW`,
`KASSA_GAP_441M`, `KASSA_RECONCILIATION`, `BALANS_ASOSLASH`), UI auditlari
(`UI_AUDIT_2026-07`, `AUDIT_REBASELINE`), arxitektura tashxisi
(`ARCHITECTURE_DEBT`), production ko'rigi (`PRODUCTION_REPORT`) va tashqi
generator yozgan ikkita "ERP" hujjati (`MEHNAT_AI_FULL_SYSTEM_AUDIT`,
`FINANCIAL_ERP_REDESIGN_BLUEPRINT`) — oxirgi ikkitasining ramkasi `PRODUCT.md`
bilan **ziddiyatda**, ular faqat topilmalari uchun saqlanadi.

[`../design-system/`](../design-system/) dagi beshta hisobot ham tarix:
ular redizayndan oldingi daraxtni tasvirlaydi. Amaldagi dizayn tizimi **kodda** —
`components/ui/` primitivlari va `app/globals.css` tokenlari.

## "ERP" so'zi haqida

Eski hujjatlar sarlavhalarida "ERP" turadi. `PRODUCT.md` §1 uni ochiq rad etadi:
ombor, ishlab chiqarish, savdo va CRM bu mahsulotda yo'q va bo'lishi ham kerak
emas. Yangi hujjatda "ERP" ishlatilmaydi.
