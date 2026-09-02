-- Xodim avatari uchun fayl havolasi.
--
-- `avatarColor` ATAYLAB qoladi: rasm yuklamagan xodim uchun initsial doira
-- shu rangda chiziladi, ya'ni ikkala shakl yonma-yon yashaydi va rasm
-- yo'qligi "bo'sh katak" bo'lib qolmaydi.
--
-- Fayl BAZAGA yozilmaydi — bu ustun `lib/evidenceStore.ts` ombori havolasi
-- (`disk://YYYY/MM/<sha256>.<ext>`), xuddi ReportProof.imageRef kabi.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarRef" TEXT;
