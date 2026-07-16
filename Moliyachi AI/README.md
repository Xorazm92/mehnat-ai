# Finco AI - Buxgalteriya va Moliya Eksperti

<div align="center">
  <img src="https://cdn-icons-png.flaticon.com/512/4712/4712109.png" width="120" alt="Finco AI Logo" />
  <h3>O'zbekiston BHMS, Soliq va Mehnat qonunchiligi bo'yicha AI yordamchi</h3>
</div>

## 🚀 Xususiyatlar

- 📚 **BHMS Bazasi**: 22+ BHMS standartlari to'liq kiritilgan
- ⚖️ **Soliq Kodeksi**: QQS, Foyda solig'i, JSHDS va boshqalar
- 👷 **Mehnat Kodeksi**: Shartnoma, ish vaqti, ta'til qoidalari
- 🤖 **Telegram Bot**: Istalgan joydan savol berish imkoniyati
- 🖥️ **Web Admin Panel**: Hujjatlarni boshqarish va test qilish
- ☁️ **Supabase Integration**: Bulutda ma'lumotlarni saqlash

## 📋 Talablar

- Node.js 18+
- Telegram Bot Token (@BotFather dan)
- Google Gemini API Key
- (Ixtiyoriy) Supabase Account

## ⚡ O'rnatish

### 1. Loyihani klonlash

```bash
git clone https://github.com/your-username/finco-ai.git
cd finco-ai
```

### 2. Dependencies o'rnatish

```bash
npm install
```

### 3. Environment sozlash

```bash
# .env.example dan nusxa olish
cp .env.example .env

# .env faylni tahrirlash va qiymatlarni kiritish
nano .env
```

**.env fayli namunasi:**

```env
# KERAKLI
BOT_TOKEN=8574437707:AAGxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxx

# IXTIYORIY
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsxxxxxxxxxx
ADMIN_PASSWORD=maxfiy_parol
```

### 4. Ishga tushirish

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

## 🌐 Foydalanish

Server ishga tushgandan so'ng:

- **Web Panel**: http://localhost:3000
- **Telegram**: Botingizga /start yozing

## 📁 Loyiha Tuzilishi

```
├── App.tsx                 # Asosiy React komponenti
├── server.js               # Node.js server (Bot + Web)
├── types.ts                # TypeScript tiplar
├── data/
│   ├── bhmsSeeds.ts        # BHMS standartlari
│   ├── extraSeeds.ts       # Soliq va Mehnat kodeksi
│   └── schema.ts           # Supabase SQL schema
└── infrastructure/
    ├── gemini.ts           # AI service (frontend)
    ├── storage.ts          # Storage repository
    └── supabaseClient.ts   # Supabase connection
```

## 🗃️ Supabase Sozlash (Ixtiyoriy)

Agar Supabase ishlatmoqchi bo'lsangiz:

1. [supabase.com](https://supabase.com) da yangi project yarating
2. SQL Editor ga kirib, `data/schema.ts` dagi SQL ni ishga tushiring
3. `.env` faylga `SUPABASE_URL` va `SUPABASE_KEY` ni qo'shing

## 🚀 Heroku'ga Deploy

```bash
heroku create your-app-name
heroku config:set BOT_TOKEN=your_token
heroku config:set GEMINI_API_KEY=your_key
git push heroku main
```

## 📝 Litsenziya

MIT License

## 🤝 Hissa qo'shish

Pull requestlar qabul qilinadi! Katta o'zgarishlar uchun avval issue oching.
