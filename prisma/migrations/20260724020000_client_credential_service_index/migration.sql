-- Backward-compatible: faqat indeks qo'shiladi, hech qanday ustun/jadval o'zgarmaydi.
--
-- Firmalar ro'yxati (server/companies.ts#withPrimaryCredential) har yuklanishda
-- `companyId IN (…) AND serviceName = 'soliq'` bo'yicha qidiradi. Mavjud
-- ClientCredential_companyId_idx bu filtrni faqat qisman qoplaydi.
--
-- CONCURRENTLY ATAYLAB ishlatilmadi: Prisma migratsiyalarni tranzaksiya ichida
-- bajaradi, CONCURRENTLY esa tranzaksiyada ishlamaydi. Jadval kichik
-- (firma soni tartibida), shuning uchun qisqa ACCESS EXCLUSIVE lock xavfsiz.
CREATE INDEX IF NOT EXISTS "ClientCredential_companyId_serviceName_idx"
  ON "ClientCredential"("companyId", "serviceName");
