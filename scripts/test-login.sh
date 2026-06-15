#!/bin/bash

BASE_URL="http://localhost:3000"

echo "1. Getting CSRF token..."
CSRF_RESPONSE=$(curl -s -c cookies.txt "$BASE_URL/api/auth/csrf")
CSRF_TOKEN=$(echo $CSRF_RESPONSE | grep -o '"csrfToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
    echo "❌ CSRF tokenni olib bo'lmadi."
    exit 1
fi

echo "✅ CSRF Token olindi: $CSRF_TOKEN"
echo ""

echo "2. Tizimga kirishga urinish (admin@mehnat.uz / Admin2026!)..."
LOGIN_HEADER=$(curl -s -i -b cookies.txt -c cookies.txt \
  -X POST "$BASE_URL/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF_TOKEN" \
  -d "email=admin@mehnat.uz" \
  -d "password=Admin2026!" \
  -d "callbackUrl=$BASE_URL/dashboard")

REDIRECT_URL=$(echo "$LOGIN_HEADER" | grep -i "Location:" | awk '{print $2}' | tr -d '\r')

echo "Redirect URL: $REDIRECT_URL"

if [[ "$REDIRECT_URL" == *"/dashboard"* && "$REDIRECT_URL" != *"error"* ]]; then
    echo "✅ Tizimga muvaffaqiyatli kirildi!"
else
    echo "❌ Tizimga kirishda xatolik yuz berdi."
fi

rm -f cookies.txt
