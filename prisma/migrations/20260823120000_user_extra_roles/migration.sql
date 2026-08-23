-- Ikki rolli xodimlar: asosiy rol (`role`) qoladi, QO'SHIMCHA rollar
-- alohida ustunda. Sessiyada faol rol cookie orqali tanlanadi —
-- barcha tekshiruvlar `session.user.role` ni o'qiyveradi.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extraRoles" TEXT[] NOT NULL DEFAULT '{}';
