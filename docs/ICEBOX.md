# ICEBOX

> [Modda 10](./CONSTITUTION.md#modda-10--har-bir-feature-mavjud-vadani-kuchaytiradi):
> [`PRODUCT.md`](./PRODUCT.md) §2 dagi beshtadan hech birini kuchaytirmagan g'oya shu yerga tushadi.

**Bu qabriston emas.** Bu yerdagi g'oyalar yomon emas — ular **hozir** eng qimmat
ish emas. Moratoriy tugagach (**2027-02-06**) ro'yxat qayta ko'riladi.

**Yozish qoidasi:** g'oya kelganda darhol shu yerga yoziladi — bosh miyada emas.
Yozib qo'yilmagan g'oya qayta-qayta muhokamaga qaytadi va har safar vaqt yeydi.

---

## Format

```markdown
### <G'oya nomi>
**Kim so'radi:** …   **Sana:** YYYY-MM-DD
**Nega hozir emas:** …
**Nima o'zgarsa qaraladi:** …
```

---

## Moratoriy davomida rad etilganlar

*(hozircha bo'sh — 2026-08-06 da ochildi)*

---

## Rejadan kesilganlar (2-versiya, 27–52-hafta)

Bular rad etilmagan — **ketma-ketlik bo'yicha kechiktirilgan**. Sabab va vaqti ma'lum.

### Truth Feed adapter UI
**Sana:** 2026-08-06 · **Hajm:** ~13 kun
**Nega hozir emas:** shartnoma (`EvidenceClaim`, `confidence`, landing) A6 blokda
yoziladi va u hech qachon o'zgarmasligi kerak. UI esa qimmat va haqiqiy Excel
faylning shaklini ko'rmasdan yozilsa, ikki marta yoziladi.
**Nima o'zgarsa:** haqiqiy fayl qo'lda + A6 shartnomasi testlangan.

### Client Portal
**Sana:** 2026-08-06 · **Hajm:** ~10 kun
**Nega hozir emas:** beshta va'daga bevosita xizmat qilmaydi (u — ushlab qolish
vositasi), va bugun ko'rsatadigan dalili yo'q (`SubmissionEvidence` = 0).
**Nima o'zgarsa:** B bloki tugaydi — dalil paydo bo'ladi.

### Grounded AI — tool calling va tavsiya
**Sana:** 2026-08-06 · **Hajm:** ~12 kun
**Nega hozir emas:** P5 va'dasi P1–P4 siz mumkin emas. Ishonchsiz ma'lumot ustidagi
tavsiya — ishonch bilan aytilgan xato.
**Nima o'zgarsa:** C bloki tugaydi; ball izohi (P4) barqaror ishlaydi.

### Company Workspace to'liq sahifa
**Sana:** 2026-08-06 · **Hajm:** ~12 kun
**Nega hozir emas:** `CompanyDrawer` (1 149 qator) bugun ishlaydi; cockpit muhimroq.
**Nima o'zgarsa:** C bloki tugaydi.

### Profitability balli (Digital Twin'ning 4-balli)
**Sana:** 2026-08-06 · **Hajm:** ~6 kun
**Nega hozir emas:** `EmployeeCostRate` = 0. Tannarxsiz marja = daromad, ya'ni
direktorga ishonchli ko'rinadigan **yolg'on raqam**. Yolg'on raqam raqamsizlikdan yomon.
**Nima o'zgarsa:** tannarx tariflari seed qilinadi.

### Health Score (Digital Twin'ning yig'ma balli)
**Sana:** 2026-08-06 · **Hajm:** ~2 kun
**Nega hozir emas:** yig'ma ball harakat bermaydi — u past bo'lsa ham, nima qilishni
bilish uchun baribir Risk / Capacity / Compliance ga qarash kerak. Uchtasi
to'g'ridan-to'g'ri ko'rsatiladi.
**Nima o'zgarsa:** foydalanuvchi uchtasini bir raqamga siqishni **o'zi so'rasa**.

### O'rganilgan bashorat (ML)
**Sana:** 2026-08-06
**Nega hozir emas:** `Obligation` = 2 982 ≈ bir oylik generatsiya; yozib olingan xavf
o'tishi = **0**. Tarixsiz bashorat — ishonch oralig'i kiygan taxmin, va u direktorning
asosiy ekranida turadi. Uning o'rniga **yetakchi ko'rsatkich** quriladi (kelajak ustida
arifmetika, tarix talab qilmaydi).
**Nima o'zgarsa:** ≥ 12 oy majburiyat natijasi **va** ≥ 50 belgilangan xavf o'tishi.

### UI arxitektura — auditdan qolganlar
**Sana:** 2026-08-07 · **Manba:** [`AUDIT_REBASELINE.md`](./audit/AUDIT_REBASELINE.md)

**Matritsa virtualizatsiyasi** (~5 700 katak bir vaqtda mount qilinadi).
*Nega hozir emas:* B blokda `OperationModule` `MonthlyReport` jadvalidan
`Obligation` proyeksiyasiga aylanadi. Hozir virtualizatsiya qilingan grid qayta
yoziladi. *Nima o'zgarsa:* B blok o'qish yo'lini almashtiradi.

**`useSearchParams` — ulashiladigan filtrlangan ko'rinishlar** (bugun **0**).
*Nega hozir emas:* C blokdagi Director Cockpit baribir shu mexanizmni talab
qiladi (har blok bosiladigan va o'z filtri bilan havola bo'lishi kerak). Ikki
marta qurmaslik uchun birga qilinadi. *Nima o'zgarsa:* C blok boshlanadi.

**`.erp-table` migratsiyasi** (20 jadvaldan 1 tasida).
*Nega hozir emas:* eng katta jadvallar B/C blokda o'zgaradi.

**Inline `style={{}}`** — 2 049 → 2 005.
*Nega hozir emas:* primitivlar qurilgan, lekin ommaviy migratsiya alohida qiymat
bermaydi; fayl tegilganda ko'chsin. Bu kosmetik qarz, xavf emas.

**Qolgan 15 ta qo'lda yozilgan modal.**
*Nega hozir emas:* eng kattalari (`OperationModule`, `OrganizationModule`,
`PayrollDrafts`, `ExpenseModule`) B blokda qayta yoziladi.
*Ushlab turuvchi:* `lib/modalSemantics.spec.ts` ratchet — yangisi qo'shilmaydi.

---

## Darvoza ortidagilar

[Modda 9](./CONSTITUTION.md#modda-9--platforma-elon-qilinmaydi-ishlab-topiladi) —
sana emas, qaror qoidasi.

| G'oya | Darvoza |
|---|---|
| **Mobil ilova** | Web cockpit 3 oy kunlik ishlatilgan **va** direktor telefondan so'ragan. (Telegram Mini App bugun bor — u ehtiyojning katta qismini qoplaydi) |
| **Multi-tenant SaaS** | 3 firma 12 oy pul to'lagan |
| **Marketplace / plugin runtime** | 2 tashqi tomon API so'ragan **va** SaaS ishlagan |
| **Ikkinchi vertikal** (Audit / Legal / HR) | 3 shart bir vaqtda: 1 firma ASRO'siz ishlay olmaydi · 3 firma so'ragan · core 6 oy domen lug'atisiz |

---

## Hech qachon

Bu bo'limga tushgan narsa qayta muhokama qilinmaydi — u mahsulot ta'rifiga zid.

CRM / lead · Ombor · Inventar · Ishlab chiqarish · POS · Savdo ·
1C o'rnini bosish · Mijozlar uchun buxgalteriya yuritish ·
Firmaning o'z soliq hisoboti (kitob yopish, moliyaviy hisobot chiqarish)

*Eslatma: firmaning o'z kassasi uchun ikki tomonlama yozuv bundan **istisno** —
u buxgalteriya emas, yaxlitlik kafolati. [Modda 1](./CONSTITUTION.md#modda-1--asro-buxgalteriya-yuritmaydi).*
