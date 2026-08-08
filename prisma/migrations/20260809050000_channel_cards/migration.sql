-- KANAL = ODAM, KARTA = ATRIBUT.
--
-- Ilgari karta kanalning o'zida saqlangani uchun kanal aslida KARTAni
-- anglatardi. Prod ma'lumotida bir odamning bir necha kartasi bor
-- (Mahmudaxon 2 ta, Go'zal 2 ta, Azizbek Isomiddinov 2 ta) — natijada
-- bitta odam bir nechta kanal bo'lib ko'rinar va tranzit qoldig'i
-- bo'linib ketardi.
--
-- Bu migratsiya faqat JADVAL qo'shadi va mavjud kartalarni ko'chiradi.
-- Kanallarni BIRLASHTIRISH alohida skript bilan, tekshirilgan holda
-- bajariladi (scripts/merge-channels.ts) — chunki u pulga tegadi.

CREATE TABLE "ChannelCard" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "cardMask" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelCard_cardMask_key" ON "ChannelCard"("cardMask");
CREATE INDEX "ChannelCard_channelId_idx" ON "ChannelCard"("channelId");

ALTER TABLE "ChannelCard"
  ADD CONSTRAINT "ChannelCard_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "DisbursementChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mavjud kartalarni ko'chiramiz; kanaldagi `cardMask` asosiy karta bo'lib qoladi.
INSERT INTO "ChannelCard" ("id", "channelId", "cardMask", "isPrimary")
SELECT gen_random_uuid()::text, id, "cardMask", true
  FROM "DisbursementChannel"
 WHERE "cardMask" IS NOT NULL;
