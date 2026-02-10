# Tizim Operatsiyalari va Jarayonlari

Ushbu hujjat "Firma oxiri.json" tahlili asosida tizimdagi mavjud operatsiyalar va biznes jarayonlarini tavsiflaydi.

## 1. Soliq Rejimlari (Tax Regimes)
Korxonalar quyidagi soliq rejimlaridan birida faoliyat yuritadi:
- **NDS (QQS)**: Qo'shilgan qiymat solig'i to'lovchilari.
- **Aylanma (Turnover)**: Aylanmadan olinadigan soliq to'lovchilari.
- **Fixed (Qat'iy)**: Qat'iy belgilangan soliq to'lovchilari.

## 2. Hisobot Davrlari (Reporting Cycles)
Tizim hisobotlarni quyidagi davrlar bo'yicha kuzatib boradi:
- **Oylik (Monthly)**: Har oy topshiriladigan hisobotlar (Masalan, ShJB, QQS).
- **Kvartal (Quarterly)**: Har chorakda topshiriladigan hisobotlar (Masalan, Foyda solig'i, Aylanma).
- **Yillik (Annual)**: Yilda bir marta topshiriladigan hisobotlar (Masalan, 1-KB, Statistika).

## 3. Asosiy Operatsiyalar (Core Operations)
Har bir korxona uchun quyidagi operatsiyalar bajariladi:

### 3.1. Hisobotlarni Topshirish
- **Foyda Solig'i / Aylanma Solig'i**: `profitTaxStatus`
- **Jismoniy Shaxslardan Olinadigan Daromad Solig'i (JSHODS)**: `form1Status`
- **QQS (Agar mavjud bo'lsa)**: `form2Status` (yoki maxsus maydon)
- **Statistika Hisobotlari**: `statsStatus`

**Statuslar:**
- `+` (Topshirildi / Accepted)
- `-` (Topshirilmagan / Not Submitted)
- `0` (Talab etilmaydi / Not Required)
- `kartoteka` (Bloklangan / Blocked)
- `ariza` (Jarayonda / In Progress)
- `rad etildi` (Rejected)

### 3.2. Monitoring va Nazorat
- **Server Monitoringi**: Korxona qaysi serverda joylashganligi (`srv1c2`, `srv1c3` va h.k.) va ma'lumotlar bazasi nomi.
- **IT Park Rezidentligi**: Rezident maqomiga ega korxonalar uchun maxsus hisobotlar va imtiyozlar nazorati.

### 3.3. Moliyaviy Operatsiyalar
- **Shartnoma Qiymati**: Har bir korxona bilan tuzilgan shartnoma summasi (`Shartnoma qiymati`).
- **Ulish Taqsimoti**:
    - **Buxgalter Ulushi**: `20%` (Standart)
    - **Bank Klient Ulushi**: `5%`
    - **Nazoratchi Ulushi**: `5%`
    - **Bosh Buxgalter Ulushi**: `7%` yoki fiks summalarda.

## 4. Rollar va Javobgarlik
- **Buxgalter**: Hisobotlarni tayyorlash va topshirish.
- **Bank Klient**: Bank operatsiyalarini amalga oshirish.
- **Nazoratchi (Supervisor)**: Jarayonlarning to'g'ri bajarilishini nazorat qilish.

## 5. Tizim sozlamalari
- **API va Loginlar**: Har bir korxona uchun Soliq, Didox, Mehnat.uz tizimlariga kirish ma'lumotlari (`login`, `password`).
