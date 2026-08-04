-- Portfel-asosli firma scope'i (lib/access.ts companyScopeWhere) har so'rovda
-- to'rtala mas'ul ustunini OR bilan tekshiradi. `accountantId` va `supervisorId`
-- indekslangan edi, qolgan ikkitasi yo'q — 213 firmada ham har sahifa yuklanishida
-- seq scan bo'lardi.
CREATE INDEX IF NOT EXISTS "Company_chiefAccountantId_idx" ON "Company"("chiefAccountantId");
CREATE INDEX IF NOT EXISTS "Company_bankClientId_idx" ON "Company"("bankClientId");

-- Scope'dagi `contractAssignments: { some: { userId, isActive: true } }` uchun.
CREATE INDEX IF NOT EXISTS "ContractAssignment_userId_isActive_idx" ON "ContractAssignment"("userId", "isActive");
