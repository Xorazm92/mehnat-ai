-- Reglament: "Ишга узрли сабабсиз 09.00 дан кейин келиш ... -0.1%".
-- Ya'ni uzrli kechikish jarimalanmaydi. Shu paytgacha 09:00 dan keyingi HAR
-- kelish jarimaga tortilardi — bayroq o'sha farqni tiklaydi.
ALTER TABLE "Attendance" ADD COLUMN "lateExcused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN "lateExcuseReason" TEXT;
