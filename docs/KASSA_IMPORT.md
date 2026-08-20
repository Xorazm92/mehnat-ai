# Kassa ma'lumot importi — Excel'dan bazaga

Korxona kassani hozircha Excelda yuritadi va uni JSON eksporti orqali ASRO ga
ko'chiradi. Bu hujjat — o'sha ko'chirishning to'liq tartibi.

## Manba fayllari

Fayllar **repozitoriyga tushmaydi** (`.gitignore` → `/kassa/`): ichida xodimlarning
karta raqami, JSHSHIR va mijozlar qarzdorligi bor.

| Fayl | Nima beradi |
|---|---|
| `Kassa.json` → `DICTIONARY` | kassalar ro'yxati + kirim/chiqim moddalari |
| `Kassa.json` → `DATA` | kassa operatsiyalari |
| `Band qilganlar.json` → `Band Xodimlar` | band xodimlar reyestri (MFO, transit, karta, JSHSHIR) |
| `Band qilganlar.json` → `Firmalar` | o'z firmalar + bank qoldig'i |
| `O'zini-o'zi band <Oy>.json` | o'sha oy karta daftari (har xodim — alohida varaq) |

Papkani skriptlar o'zi topadi: `IMPORT_DIR` env → `kassa/` → `others_json_files/`
(`scripts/import-source.ts`). Papka nomi o'zgarsa, bitta joyda tuzatiladi.

## Tartib

Ketma-ketlik MUHIM — har qadam oldingisining natijasiga tayanadi.

```bash
# 1. O'z firmalar uchun schyot kanallari
npm run seed:own-accounts -- --apply

# 2. Naqd seyf, plastik terminal, maqsadli kassalar
npm run seed:kassa-desks -- --apply

# 3. Band xodimlar + oylik karta daftari (har oy uchun alohida)
npm run import:transit -- --month=iyul
npm run import:transit -- --month=avgust --create-missing

# 4. Kassa operatsiyalari (avval --apply'siz ko'rib chiqing!)
npm run import:kassa-ops
npm run import:kassa-ops -- --apply

# 5. Firmalar bank qoldig'i
npm run import:firm-balances -- --as-of=2026-08-01 --apply
```

Hamma skript **idempotent**: qayta ishga tushirish dublikat yaratmaydi.
`--apply` / `--dry-run` bo'lmasa hech narsa yozilmaydi.

## Prodda

Yuqoridagi ketma-ketlik bitta skriptga yig'ilgan:

```bash
# Manba fayllarini serverga ko'chirish (repozitoriyda YO'Q)
scp -i ~/Downloads/ASRO.pem -r kassa ubuntu@<server>:~/mehnat-ai/

# Serverda — avval quruq hisobot, raqamlarni tekshiring
bash scripts/deploy-kassa-import.sh
bash scripts/deploy-kassa-import.sh --apply
```

Prod tartibida `--create-missing` ATAYIN ishlatilmaydi: reyestrda yo'q varaq
uchun kanal ochish — taxmin, va u prodda qilinmaydi. Bunday varaq hisobotda
alohida ro'yxat bo'lib chiqadi.

Skript nolinchi qadamda `purge-synthetic-kassa.ts` ni chaqiradi — lokal
bazada `vitest-race` va `[demo]` yozuvlari 1,63 mlrd so'mlik soxta aylanma
yaratgan edi. Prod toza bo'lsa u "0 ta" deb o'tib ketadi.

## Nimaga e'tibor berish kerak

**Har yozuv jurnalga ham tushadi.** Kassalar jadvali (`server/kassaReport.ts`)
qoldiqni `LedgerEntry` ning CASH oyoqlaridan o'qiydi, `KassaEntry` jadvalidan
emas. Jurnalsiz yozilgan qator ro'yxatda ko'rinadi, lekin balansda YO'Q bo'ladi.

**Kassa kirimi mijoz qarzini kamaytirmaydi.** `KassaEntry(income)` pulni kassaga
kiritadi, xolos. Qarz `Payment` + `PaymentAllocation` orqali yopiladi. Shuning
uchun `import:kassa-ops` har kirim qatorini mavjud `Payment` bilan solishtiradi
(summa + izohdagi brend so'zi + davr) va MOS KELGANINI YOZMAYDI — aks holda
bitta pul ikki marta sanalardi. Mos kelmaganlari yoziladi va oxirida alohida
ro'yxat bo'lib chiqadi: "bu mijozlarning qarzi kamaymadi, to'lov sifatida
rasmiylashtiring".

**Daftar kaliti oy bilan.** `TransitEntry.dedupKey = "xls:<oy>:<varaq>:<qator>:<yo'nalish>"`.
Oysiz kalit bilan avgust qatorlari iyul qatorlarining ustiga yozilardi —
varaq nomlari va qator raqamlari har oyda takrorlanadi.

**Kartadagi pul hali xarajat emas.** Bankdan kartaga o'tkazma — o'z cho'ntagimizdan
o'z cho'ntagimizga. `import:transit` shu sababli `KassaEntry` yozmaydi, faqat
tranzit daftarini tiklaydi. Kartadan qilingan xarajat `/kassa/chiqim` dagi
"Xarajat yozish" orqali kassaga o'tkaziladi.

## Tekshirish

Import tugagach `/kassa` sahifasida:

* **Kassalar jadvali** — har kassa bo'yicha ochilish → kirim → chiqim → qoldiq;
* **Moddalar kesimi** — Excel `DASHBOARD` varag'ining o'rnini bosadi;
* **Oy tanlagich** (`?oy=2026-07`) — oylar orasida yurish.

Xodim kartalari tabidagi qizil "farq" yozuvi — karta xarajati kassaga
bog'lanmagan degani. "Kanalsiz" tabi esa eski, kanal ko'rsatilmagan yozuvlar;
u nolga intilishi kerak.
