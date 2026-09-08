# Kassa apparati ↔ bank sverkasi

Savdo nuqtasida mijoz karta bilan to'laydi. Bitta to'lov **ikki joyda** iz
qoldiradi: fiskal kassa apparatida (chek) va bankda (ekvayring tushumi).
Ular mos kelmasa — kamomad. Bu modul o'sha solishtiruvni kunma-kun qiladi.

Ekran: **Kassa → Kassa–bank sverka** (`/kassa/sverka`, view `kassa_sverka`).

## Nega bank qatorini to'g'ridan-to'g'ri solishtirib bo'lmaydi

Vipiskadagi qator — bu **hisob-kitob (settlement)**, savdo emas:

- bank bir necha kunlik savdoni **bitta o'tkazmaga jamlaydi**;
- **komissiyani ushlab qoladi** (kassa apparati esa mijoz to'lagan to'liq
  summani ko'radi);
- savdo sanasini hujjat sanasiga emas, **to'lov tafsiloti ichiga** yozadi.

Shuning uchun `BankTransaction` ustiga `PosSettlement` hosila qatlami quriladi:
u har qatordan **terminal**, **savdo sanasi**, **yalpi summa** va **komissiya**ni
ajratib oladi.

## Ma'lumot oqimi

```
Vipiska (BankTransaction)  ──►  "Vipiskadan ajratish"  ──►  PosSettlement
                                (server/posSverka.ts)         │
Kunlik hisobot (.xlsx)     ──►  "Yuklash"  ──►  FiscalDailyReport
                                                              │
                                              lib/pos/reconcile.ts
                                                              ▼
                                                    kunlik sverka jadvali
```

## Modellar

| Model | Nima saqlaydi |
|---|---|
| `FiscalDevice` | kassa apparati (FM raqami, nom, STIR) |
| `FiscalDailyReport` | apparatning bir kunlik yakuni; `(deviceId, date)` yagona. `channels` — to'lov turi kesimi (`{"click": 1200000}`) |
| `FiscalReportImport` | yuklangan fayl izi (kim, qachon, nechta qator) |
| `PosTerminal` | bank tomonidagi terminal/kanal + **`inScope`** bayrog'i |
| `PosSettlement` | vipiska qatoridan ajratilgan sverka qatori (hosila) |

## `inScope` — moduldagi eng muhim qaror

Bitta hisobvaraqqa **bir nechta savdo liniyasi** tushadi: POS terminallar,
alohida EPOS qurilmasi, Payme/Click/Paynet. Ularni kassa apparatlariga
qo'shib yuborish sverkani butunlay chalg'itadi — 2,5 mlrd lik savdo
5,1 mlrd bo'lib ko'rinadi.

Shuning uchun:

- yangi terminal vipiskadan **avtomatik topiladi**, lekin doiraga
  UzCard / HUMO / Multicard kanallarigina o'zi kiradi (`defaultInScope`);
- EPOS va onlayn tizimlar **odam tasdig'ini kutadi** — "Terminallar" yorlig'i;
- doiradan tashqaridagi tushum yo'qolmaydi, o'sha yorliqda summasi bilan turadi.

## Bekor qilingan (otmena) operatsiyalar

Bitta bekor qilish vipiskada **uchta** qator qoldiradi: tushum stornosi
(debet), komissiya stornosi (kredit), o'tkazma stornosi (kredit).
Savdo summasini faqat **birinchisi** kamaytiradi. Qolgan ikkitasi kredit
bo'lgani uchun "tushum" deb qo'shilsa, summa ikki barobar buziladi.

Qoida `settlementSign()` da, testi `classifySettlement.spec.ts` da:

| Qator | Yo'nalish | Natija |
|---|---|---|
| oddiy tushum | kredit | `+1` |
| tushum stornosi | debet | `−1` |
| komissiya / o'tkazma stornosi | kredit | `0` |
| komissiya, kompaniyaga o'tkazma | debet | `0` |

HUMO ning `(80606)/(80607)` "reversal" juftligi o'z-o'zini yopadi (netto nol) —
ikkalasi ham butunlay chetga chiqariladi.

## Komissiya: 0,2 % emas

Stavka kanalga qarab har xil va **matnning o'zida** yozilgan bo'ladi:

| Kanal | Stavka |
|---|---|
| UzCard «Терминал савдо тушуми 100% от сальдо» | 0 % |
| HUMO | ~0,42 % |
| HUMO EPOS | ~0,99 % |
| Multicard | 0,200 % |
| Payme / Paynet | 0 % (1 % foydalanuvchidan) |

Shuning uchun yalpi summa `fakt / (1 − 0,002)` formulasi bilan **taxmin
qilinmaydi** — tafsilotdagi aniq raqam olinadi. Matnda yalpi bo'lmasa
`gross = fakt`, komissiya `0`.

## Sana: tafsilotdan, hujjatdan emas

Sverka **savdo sanasi** bo'yicha qilinadi (`opDate`). U to'lov tafsilotidan
olinadi: `за 31.12.2024`, `от: 27.12.2024`, `выручки за …`, `от PAYME за …`.

Istisno: UzCard ning «Терминал савдо тушуми 100% от сальдо N ID=…» matnida
**sana umuman yo'q**. Bunday qator hujjat sanasi bo'yicha joylashtiriladi va
`dateSource = "document"` deb belgilanadi — jadvalda ⚠ belgisi bilan
ko'rinadi. Kunlik farq shu qismda shartli, davr yig'indisi to'g'ri qoladi.

## Kunlik hisobot fayli

Soliq kabinetidan olinadigan «Кунлик ҳисобот» (.xlsx). Ustunlar **nomi**
bo'yicha topiladi; sverka `Сумма (тўлов терминали)` ustuni bilan ishlaydi.

- Apparat uch yo'l bilan aniqlanadi: foydalanuvchi tanlagani → fayl ichidagi
  FM raqami → fayl nomidagi qisqartma (`0718.xlsx` → `…020718`).
- Kun bo'yicha **upsert**: qayta yuklash qator ko'paytirmaydi, yangilaydi.
- **Oylik** hisobot (apparatlar kesimi) qabul qilinmaydi — kunma-kun sverkaga
  yaramaydi va aniq xato bilan rad etiladi.

## Kanal kesimi hisoboti

Kabinet **to'lov turi bo'yicha filtrlangan** hisobotni ham beradi (faqat Click,
faqat Payme...). Ustunlari asosiy hisobot bilan bir xil, farqi — naqd va
terminal **nol**, savdo esa "Жами" ustunida.

Bu ASOSIY hisobotning **ichki bo'lagi**: `cardAmount` ga qo'shilmaydi va
sverkaning kassa yig'indisiga kirmaydi. Qo'shilsa savdo ikki marta sanalardi.
Shuning uchun u `FiscalDailyReport.channels` (jsonb) ga alohida yoziladi va
`reconcile()` ga ham alohida kirish bo'lib beriladi (`kassaChannels`).

Kanal **fayl mazmunidan** aniqlanadi (`CHANNEL_MARKERS`), fayl nomidan emas.
Ilgari u nomdan olinardi va bu jimgina buziladigan yo'l edi: nom mos kelmasa
kesim asosiy summaga qo'shilib ketardi.

> **Kafolat:** kesim shakli tanilib, kanal topilmasa fayl **rad etiladi**.
> Jim qabul qilinmaydi — testi `parseFiscalReport.spec.ts` da.

Kesim yuklanmagan kanal jadvalda `kassa = 0` bo'lib turadi. Bu **kamomad
emas**, shuning uchun u "Kesim yo'q" deb (kulrang) belgilanadi.

## Oy × kanal kesimi

"Farq QAYSI kanalda?" — asosiy jadvaldan keyingi birinchi savol. Ekranda
`Oy | Kanal | Kassa | Bank (brutto) | Komissiya | Farq | Holat` jadvali.

Ikki tomon **mustaqil** yig'iladi: kassa tomoni `channels` dan, bank tomoni
esa doiradagi terminalning kanalidan (`PosTerminal.channel`). Bir tomonda
bo'lib ikkinchisida yo'q kanal — xato emas, aynan shu modul ko'rsatishi kerak
bo'lgan holat.

Farq ishorasi asosiy jadval bilan **bir xil**: `kassa − bank brutto`, musbat =
bankka yetib bormagan.

Excel eksporti **keng** shaklda chiqadi (oy = bitta qator, har kanal uchun
`kassa | bank | farq` ustunlari) — buxgalter kanallarni yonma-yon
solishtiradi. Ekranda esa kanal soni ustunlarga sig'maydi.

## Fayllar

```
lib/pos/classifySettlement.ts   vipiska matnidan kanal/terminal/sana/komissiya
lib/pos/parseFiscalReport.ts    «Кунлик ҳисобот» + kanal kesimi parseri
lib/pos/reconcile.ts            kunlik, oylik va KANAL bo'yicha yig'ish
server/posSverka.ts             server action'lar (rol: requireStatementRole)
app/(dashboard)/kassa/sverka/   ekran (SverkaMatrix + ChannelMatrix)
```

Uchala `lib/pos/*` moduli **bazasiz va sof** — testlari real vipiska
matnlari bilan yozilgan: `npx vitest run lib/pos`.

## Bir martalik sverka (mijoz papkasi)

Ish holati: mijoz "yanvardan sentyabrgacha solishtirib, kamomadni toping"
deb Excel fayllarni beradi. Ular bazaga kirmaydi — bir martalik ish.

```bash
npx tsx scripts/sverka/run.ts --dir <papka> [--from 2026-01-01] [--to 2026-09-30] [--out <papka>]
```

Quvur: **papka → tur aniqlash → normal JSON → sverka → hisobot**. Fayl turi
nomi bo'yicha emas, **mazmuni** bo'yicha topiladi (`scripts/sverka/detect.ts`):
bank vipiskasi, kassa kunlik hisoboti, kassa oylik hisoboti, cheklar ro'yxati.

Natija papkasida:

| Fayl | Nima |
|---|---|
| `json/*.json` | har bir fayldan o'qilgan normal ma'lumot (keyingi tahlil uchun) |
| `sverka.xlsx` | 1. Kunlik · 2. Oylik · 3. Terminallar · 4. Fayllar |
| `XULOSA.md` | yakun, oylik kesim, doiradan tashqarida qolgan tushum, metodologiya |

Doira qarori papkadagi `sverka.config.json` da saqlanadi va qayta ishga
tushirilganda qo'llanadi:

```json
{ "inScope": ["UZCARD 100113154"], "outOfScope": ["EPOS 97011045"] }
```

Mantiq ilova bilan **bir xil** modullardan keladi (`lib/pos/*`, `lib/bank/*`),
shuning uchun CLI va ekran hech qachon bir-biridan uzoqlashmaydi.
