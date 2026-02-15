#!/bin/bash

# Supabase Credentials (auto-filled from .env.local)
URL="https://veudzohikigofgaqfwcj.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldWR6b2hpa2lnb2ZnYXFmd2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxOTk1OTUsImV4cCI6MjA4NTc3NTU5NX0.pfsGinzi0YZbmET2xIj5ZN4nq9xf4CBCtGyLunUMb5s"

# Test Data
COMPANY_ID="00000000-0000-0000-0000-000000000001"
DATA='{
  "p_company": {
    "id": "'$COMPANY_ID'",
    "name": "CURL TEST COMPANY",
    "inn": "123456789",
    "tax_regime": "vat",
    "is_active": true,
    "department": "test"
  },
  "p_assignments": []
}'

echo "Starting RPC Test..."
START=$(date +%s%N)

curl -X POST "$URL/rest/v1/rpc/upsert_company_perfect" \
     -H "apikey: $KEY" \
     -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d "$DATA"

END=$(date +%s%N)
DIFF=$((($END - $START)/1000000))

echo -e "\n\nTest finished in ${DIFF}ms"
