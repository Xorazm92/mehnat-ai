# ASRO Konstitutsiyasi

> 10 modda. Har biriga uni buzganda build'ni to'xtatadigan test.
> Mahsulot ta'rifi — [`PRODUCT.md`](./PRODUCT.md). Arxitektura — [`ARCHITECTURE.md`](./ARCHITECTURE.md).

**Nega qisqa.** O'qilmaydigan konstitutsiya konstitutsiya emas — u hujjat.
Yodda qololmasangiz, uni buzganingizni sezmaysiz. Shuning uchun 10 modda,
5 daqiqalik o'qish, va tishlari [`test/constitution.test.ts`](../test/constitution.test.ts) da.

**Moddani o'zgartirish.** Modda o'zgarishi mumkin — lekin faqat ADR bilan.
Testni o'chirib, moddani jimgina yumshatish taqiqlanadi: agar modda noto'g'ri bo'lsa,
nega noto'g'ri ekanini yozib qoldiring.

---

## Modda 1 — ASRO buxgalteriya yuritmaydi

ASRO soliq maqsadida kitob yopmaydi va moliyaviy hisobot chiqarmaydi. Buni 1C qiladi.

**Ikki tomonlama yozuv taqiqlanmaydi.** [`lib/ledger.ts`](../lib/ledger.ts) firmaning
o'z kassasi uchun yaxlitlik kafolati: balanslangan oyoqlar pulning siljib ketishiga
yo'l qo'ymaydi, `reverseLedger` netto bo'yicha ishlaydi, jurnal append-only.
Uni `server/kassa.ts`, `server/payouts.ts`, `server/payroll.ts` va `lib/monthClose.ts`
faol ishlatadi.

Chegara: **kassa yaxlitligi — ha; soliq buxgalteriyasi — yo'q.**

> **Test:** `AccountingPeriod` ustiga yangi yopish marosimi (lock / close / snapshot
> server action) qo'shilsa — fail. Mavjud oy yopilishi operatsion vosita sifatida qoladi.

Qarang: [ADR-0011](./adr/0011-operational-finance-not-bookkeeping.md)

---

## Modda 2 — Obligation yagona ish birligi

"Firma × davr × holat" ni ifodalovchi ikkinchi jadval bo'lmaydi.

Bir vaqtlar uchtasi bor edi: `MonthlyReport` (65 ustun), `Operation` (o'lik),
`Obligation` (haqiqiy dvigatel). Uchtasi parallel yashagani uchun *"hisobot
topshirildimi?"* degan savolning uchta javobi bo'lgan va ular bir-biriga mos kelmagan.

> **Test:** `MonthlyReport` ga ustun qo'shilsa — fail. Sxemada
> `companyId + period/periodKey + status` shaklidagi yangi model paydo bo'lsa — fail.

Qarang: [ADR-0009](./adr/0009-obligation-is-the-only-unit-of-work.md)

---

## Modda 3 — Dalil taklif qiladi, odam hal qiladi

Import, integratsiya yoki bot hech qachon odamning qaroridan yuqori turolmaydi.

`confidence` — aniqlik emas, **vakolat**: kim aytganiga qarab da'vo qo'ya oladigan
eng yuqori status cheklanadi. Operatorning jadvali `accepted` yozolmaydi; buni
faqat vakolatli organ kvitansiyasi qila oladi.

Dalil **hech qachon tashlanmaydi** — status rad etilsa ham `ObligationSubmission` va
`SubmissionEvidence` yoziladi. Auditorga aynan shu kerak.

> **Test:** `maxStatusForConfidence` chegaralari + `evidence-landing` ziddiyat
> matritsasi (odam qo'ygan status vs. import, oldinga/orqaga/terminal).

Qarang: [ADR-0008](./adr/0008-imported-evidence-proposes-it-never-accepts.md),
[ADR-0001](./adr/0001-bot-proposes-human-disposes.md)

---

## Modda 4a — Bog'liqlik o'qi ichkariga qaraydi

`lib/engines/**` ichki kod sifatida faqat `lib/engines/**` va `lib/platform/**` dan
import qiladi. `lib/domains/**` yoki `lib/adapters/**` dan — **hech qachon**.
(Tashqi npm paketlari va `@prisma/client` cheklanmaydi.)

> **Test: AST.** `ts.createSourceFile` + `ImportDeclaration` walk.
> Regex emas — u `import type` ni, re-export'ni va ko'p qatorli importni o'tkazib yuboradi.

---

## Modda 4b — Core domen lug'atini bilmaydi

`lib/engines/**` da `soliq`, `qqs`, `inps`, `vat`, `taxRegime`, `statsType`, `didox`
— identifikator ham, satr literali ham uchramaydi.

**Rol nomlari bundan istisno.** `lib/escalation.ts` dagi *"Bosh buxgalter"* —
tashkiliy rol (`Company.chiefAccountantId`), soliq lug'ati emas: audit firmasida
bosh auditor, yuridik firmada boshqaruvchi sherik. Eskalatsiya zanjiri
(L1 nazoratchi → L2 bosh) generic. Bu **qabul qilingan sizish** va u ratchet
bazasiga kiritilgan — o'sishi mumkin emas, lekin bugun bloklamaydi.

> **Test: regex.** 4a importni tekshiradi; lug'at esa **importsiz ham sizib kiradi** —
> qattiq yozilgan `"soliq"` satri yoki `c.taxRegime` maydoni hech qanday import
> yaratmaydi. Ikkalasi turli narsani tekshiradi; biri ikkinchisini almashtirmaydi.

---

## Modda 5 — Har bir integratsiya Adapter

Core manba nomini bilmaydi. Yangi manba (1C, Didox, Soliq, Bank) qo'shish
`lib/engines/evidence/landing.ts` da **0 qator** o'zgartiradi.

Manba farqi ma'lumotda ifodalanadi — `sourceSystem` va `confidence` —
kod shoxida emas. `landing.ts` da `if (source === "didox")` bo'lmaydi.

> **Test:** `evidence-landing-source-agnostic.test.ts` — bir xil da'vo
> `excel | 1c | didox` orqali haydaladi, natija `confidence` dan boshqa jihatda bir xil.

---

## Modda 6 — Rol nima qilishni, biriktirilish qaysi mijozda qilishni hal qiladi

Rol imkoniyatni beradi (`ROLE_PERMISSIONS`); mijozni ko'rish esa **hech qachon**
roldan kelmaydi — u `companyScopeWhere()` dan keladi. Payload'dagi `companyId`
hech qachon ishonchli emas.

O'z ishini o'zi tasdiqlash bloklanadi: aktyor o'sha firmada buxgalter bo'lsa,
u reviewer bo'lolmaydi.

> **Test:** mavjud `test/company-scope.test.ts` (16 test) +
> har yangi server action uchun IDOR testi.

---

## Modda 7 — Manbagacha kuzatib bo'lmaydigan raqam ko'rsatilmaydi

Dashboard ham, AI ham. Ball ko'rsatilsa — sababi ham ko'rsatiladi
(*"Risk 12% chunki: 3 kechikkan majburiyat, 2 javobsiz savol"*).

Sababsiz raqam ishonchni oshirmaydi — kamaytiradi, chunki uni tekshirib bo'lmaydi.

**Dalil ham manba.** Matritsadagi "topshirildi" skrinshotga tayanadi va u
`storage/files/` da mazmun-adresli saqlanadi (`ReportProof.imageRef` →
`lib/engines/evidence/store.ts`): fayl nomi — baytlarning `sha256` i, ya'ni
dalil almashtirilsa havola ham o'zgaradi.

**O'lchanmagan raqam ham ko'rsatilmaydi.** Ma'lumot yo'q bo'lsa ball `null`
bo'ladi va ekranda `—` chiqadi — 0 ham, 100 ham EMAS. Yo'q o'lchovni "a'lo" deb
ko'rsatish e'tibor kerak bo'lgan mijozni ro'yxatning xavfsiz uchiga saralaydi.
Qarang: [ADR-0013](./adr/0013-unmeasured-is-not-healthy.md)

> **Test:** AI tool testlari (har raqam tool chaqiruvidan) +
> `ObligationStatusEvent` / `AuditLog` izlari majburiy +
> `twin.spec.ts` — har ballning `reasons` yig'indisi `value` ga teng.

---

## Modda 8 — Template ma'lumot, kod emas

Yangi majburiyat turi qo'shish deploy talab qilmaydi. `DeadlineTemplate` —
versiyalangan, `draft → active → retired` hayot siklidan o'tadigan **ma'lumot qatori**.

Shuning uchun `obligationType` erkin String, `code` erkin String, va sxemada
bironta soliqqa xos maydon yo'q.

> **Test:** yangi template seed'i migratsiyasiz ishlaydi; generator uni
> `lifecycle='active'` bo'lgandagina oladi.

---

## Modda 9 — Platforma e'lon qilinmaydi, ishlab topiladi

Ikkinchi vertikal (Audit / Legal / HR) uchta shart **bir vaqtda** rost bo'lgandagina ochiladi:

1. Bitta firma ASRO'siz ishlay olmaydi — 12 oy uzluksiz foydalanish, direktor haftada ≥ 5 kun.
2. Kamida 3 ta boshqa firma pul to'lashga tayyorligini bildirgan.
3. Core engine'lar 6 oy davomida domen lug'atisiz qolgan (4a/4b yashil).

Plugin runtime, marketplace va multi-tenant — shu darvozadan keyin. Ulargacha **0 qator**.

> **Test:** inson darvozasi. CI buni tekshirmaydi — shuning uchun u shu yerda yozilgan.

Qarang: [ADR-0012](./adr/0012-a-platform-is-earned-not-declared.md)

---

## Modda 10 — Har bir feature mavjud va'dani kuchaytiradi

[`PRODUCT.md`](./PRODUCT.md) §2 dagi beshtadan hech birini kuchaytirmasa —
[`ICEBOX.md`](./ICEBOX.md) ga.

| ID | Va'da |
|---|---|
| **P1** | Hech narsa unutilmaydi |
| **P2** | Har kim bugun nima qilishini biladi |
| **P3** | Direktor hammasini ko'radi |
| **P4** | Har bir raqam tushuntiriladi |
| **P5** | Tizim nima qilish kerakligini aytadi |

`app/` yoki `components/` ga tegadigan PR tavsifida va'da ID'si bo'lishi shart.
*Qaysi* va'da ekanini odam hal qiladi — bu hukm; **borligini** mashina majburlaydi.

Bu modda arxitekturani emas, **e'tiborni** himoya qiladi. Feature creep
arxitekturani buzmaydi — u vaqtni yeydi, va yakka dasturchi uchun vaqt yagona resurs.
U aynan to'xtab savol bermaslikdan boshlanadi.

> **Test:** PR tavsifida `P1`…`P5` yo'q bo'lsa — CI fail.

---

## Moddalar va testlar

| Modda | Test |
|---|---|
| 1 | `test/constitution.test.ts` → *no new period-closing ceremony* |
| 2 | `test/constitution.test.ts` → *MonthlyReport is frozen* · *no second unit of work* |
| 3 | `lib/engines/evidence/*.spec.ts` (A6 blokda) |
| 4a | `test/constitution.test.ts` → *engines import only inward* (AST) |
| 4b | `test/constitution.test.ts` → *engines know no domain vocabulary* (regex) |
| 5 | `test/evidence-landing-source-agnostic.test.ts` (A6 blokda) |
| 6 | `test/company-scope.test.ts`, `test/obligation-access.test.ts` |
| 7 | `test/ai-tools-scope.test.ts` (C blokda) |
| 8 | `test/obligations.test.ts`, `test/matrix-template-coverage.test.ts` (B blokda) |
| 9 | — (inson darvozasi) |
| 10 | `.github/workflows/ci.yml` → *promise-id* qadami |

Hali yozilmagan testlar o'z blokida paydo bo'ladi. **Testsiz modda yozilmaydi** —
9-moddadan tashqari, va u qasddan istisno: uni mashina emas, odam ushlab turadi.
