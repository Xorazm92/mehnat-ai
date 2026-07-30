# Botni jamoaga tanishtirish

## Nega bu qadam kerak

Telegram boti **birinchi bo'lib yoza olmaydi**. Xodim `/start` bosmaguncha bot unga xabar
yubora olmaydi (Bot API 403 qaytaradi). Shuning uchun muddat eslatmalari, SLA ogohlantirishlari
va ertalabki reja bog'lanmagan xodimga Telegramda **umuman bormaydi** — faqat ilova ichida
qoladi va e'tibordan chetda o'tadi.

Ya'ni bot ishga tushgani bilan jim ko'rinadi, aslida esa yozadigan manzili yo'q.

## Tartib

### 1. Raqamlarni kartochkalarga kiritish

Bot xodimni **faqat telefon raqami** orqali taniydi (`User.phoneNormalized` — oxirgi 9 raqam).

```bash
npx tsx scripts/import-staff-phones.ts            # quruq ishlash, hisobot
npx tsx scripts/import-staff-phones.ts --apply    # yozish
```

Skript ism moslashtirishni taxminiy qiladi va faqat **aniq** mosliklarni yozadi. Shubhali va
topilmagan yozuvlar hisobotga chiqadi — ular bilan odam ishlaydi.

> `@username` ham saqlanadi, lekin u **bog'lash uchun ishlamaydi**: Bot API `@username` ni
> raqamli id ga aylantira olmaydi. Bog'lanish faqat xodim kontaktini yuborganda yuz beradi.
> Username — "kimni chaqirish kerak" degan ma'lumot.

### 2. Xodimlarga e'lon yuborish

Quyidagi matnni jamoa guruhiga (yoki har biriga shaxsan) yuboring.

---

**📢 ASRO boti ishga tushdi**

Bundan buyon muddatlar, KPI va vazifalar bo'yicha xabarlar Telegramga keladi.

Ulanish uchun **1 marta** quyidagini bajaring:

1. 👉 https://t.me/asroanalizbot ni oching
2. **Start** tugmasini bosing
3. Chiqqan **📱 Raqamni yuborish** tugmasini bosing

Tamom. Bot sizni ish raqamingiz orqali taniydi — email yoki parol kerak emas.

**Shundan keyin nima o'zgaradi:**
- 📅 Har kuni ertalab 08:50 da bugungi ish rejangiz keladi
- ⏰ Hisobot muddati yaqinlashsa ogohlantiradi (5 kun, 3 kun, 1 kun qolganda)
- 📊 KPI ballaringizni istalgan vaqtda tugma orqali ko'rasiz
- 📄 Dalil (skrinshot) yuklashni to'g'ridan-to'g'ri Telegramdan qilasiz

**Muhim:** raqamni yubormaguningizcha bot sizga hech narsa yozolmaydi — muddat
eslatmalari ham kelmaydi.

Savol bo'lsa — administratorga murojaat qiling.

---

### 3. Kim ulanmaganini kuzatish

```bash
npx tsx scripts/import-staff-phones.ts    # hisobotda "bog'lanmagan" ro'yxati
```

Bir hafta ichida ulanmaganlarni shaxsan chaqirish kerak: ular uchun tizim
faqat ilova ichida ishlaydi.

## Nazoratchi va bosh buxgalter uchun alohida eslatma

Eskalatsiya zanjiri **L0 mas'ul → L1 nazoratchi → L2 bosh buxgalter** tartibida ishlaydi
(qarang [ADR-0007](adr/0007-escalation-is-private-and-laddered.md)). Agar nazoratchi yoki bosh
buxgalter botga ulanmagan bo'lsa, o'sha bosqich **jim o'tib ketadi** — xabar in-app'da qoladi.

Shuning uchun avval **senior rollarni** ulang, keyin qolganlarni.

## Mijoz guruhlari

Botni mijoz guruhiga **admin sifatida** qo'shing — u holda:

1. Bot avtomatik ravishda sizning lichkangizga korxonalar ro'yxatini yuboradi
2. Bittasini bosasiz — guruh o'sha korxonaga bog'lanadi
3. `/bind` yozish shart emas

Guruhda bot **jim turadi**: ichki muddat eslatmalari u yerga chiqmaydi (ADR-0007), faqat
to'lov eslatmasi va mijozga tegishli xabarlar boradi.

> **Maxfiylik rejimi:** bot guruhdagi barcha xabarlarni ko'rishi uchun @BotFather →
> `/setprivacy` → **Disable** qilinishi yoki bot guruhda admin bo'lishi shart. Aks holda u
> faqat buyruqlarni ko'radi va savol SLA'si ishlamaydi.
