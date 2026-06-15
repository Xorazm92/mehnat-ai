#!/bin/bash

# Mehnat-ERP To'liq Ishga Tushirish Skripti
# Bu skript loyihani 0 dan to'liq production (ishlab chiqarish) muhitida ishga tushiradi.

echo "🚀 Mehnat-ERP tizimini ishga tushirish boshlanmoqda..."

# 1. Muhit o'zgaruvchilari tekshiruvi
if [ ! -f .env.local ]; then
  echo "⚠️ .env.local fayli topilmadi. .env dan nusxa olinmoqda..."
  cp .env .env.local
fi

# 2. Paketlarni o'rnatish
echo "📦 1/5: Kutubxonalar tekshirilmoqda..."
npm install

# 3. Prisma ma'lumotlar bazasini tayyorlash
echo "🗄️ 2/5: Ma'lumotlar bazasi (PostgreSQL) tayyorlanmoqda..."
npx prisma generate
npx prisma db push --accept-data-loss

# 4. Boshlang'ich ma'lumotlarni (Super Admin) yozish
echo "🌱 3/5: Boshlang'ich ma'lumotlar (Admin va Xodim) bazaga kiritilmoqda..."
npx tsx scripts/seed-users.ts

# 5. Loyihani Build qilish (Production uchun tayyorlash)
echo "🏗️ 4/5: Next.js loyihasi build qilinmoqda (optimallashtirilmoqda)..."
rm -rf .next
npm run build

# 6. Tizimni ishga tushirish
echo "✅ 5/5: Tizim muvaffaqiyatli tayyorlandi!"
echo "🌐 Tizim ishlab chiqarish (Production) rejimida quyidagi manzilda ishlamoqda:"
echo "👉 http://localhost:3000"
echo "--------------------------------------------------------"
echo "Tizimga kirish uchun ma'lumotlar:"
echo "Super Admin: admin@mehnat.uz / Admin2026!"
echo "Oddiy Xodim: user@mehnat.uz  / User2026!"
echo "--------------------------------------------------------"
echo "To'xtatish uchun: Ctrl+C ni bosing"

# Serverni ishga tushirish
npm run start
