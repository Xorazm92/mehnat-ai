-- Inventar modulini olib tashlash.
--
-- docs/PRODUCT.md §6: inventar "hech qachon" ro'yxatida — u besh va'dadan
-- birortasiga ham xizmat qilmaydi. Jadvalda 1 qator bor edi va u sinov
-- ma'lumoti: "TEST Laptop" / "TEST-INV-001".
--
-- Sahifa faqat super_admin'ga ko'rinardi (admin ham ko'rmasdi), ya'ni amalda
-- bitta foydalanuvchi sinfi uchun mavjud modul edi.

DROP TABLE IF EXISTS "InventoryItem";
