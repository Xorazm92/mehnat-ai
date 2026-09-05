/**
 * SVERKA (reconciliation) — invariantlar to'plamining o'zi ishlaydimi.
 *
 * NEGA BU TEST KERAK. `lib/reconciliation.ts` — 17 ta moliyaviy invariantni
 * tekshiradigan modul, ya'ni u boshqa modullarning buzilishini KO'RSATADIGAN
 * qatlam. Uning o'zi jim yiqilsa (masalan SQL ustun nomi o'zgarib), ekran
 * "hammasi joyida" deb turaveradi — nosozlik yo'q emas, KO'RSATUVCHISI yo'q
 * bo'ladi. Auditda aynan shu holat qayd etilgan: modulda birorta test yo'q edi.
 *
 * Bu yerda tekshiriladigan narsa:
 *   1. har bir tekshiruv HAQIQATAN yuguradi (SQL sinmagan) va shakli to'g'ri;
 *   2. kalitlar unikal — UI ularni `key` bo'yicha chizadi;
 *   3. `worstStatus` eng yomon holatni tanlaydi;
 *   4. jurnal muvozanati buzilsa `ledger-balanced` HAQIQATAN `error` beradi.
 *
 * (4) tranzaksiya ichida buziladi va tranzaksiya ATAYLAB rollback qilinadi —
 * bazada hech qanday iz qolmaydi.
 *
 * Live Postgres kerak (`npm run test:db:setup`).
 */
import { describe, it, expect, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { runReconciliation, worstStatus } = await import("@/lib/reconciliation");
const { ACCOUNTS } = await import("@/lib/ledger");

const TAG = `vitest-recon-${Date.now()}`;
const STATUSES = new Set(["ok", "warn", "error"]);

/** Tranzaksiyani ataylab bekor qilish uchun — ma'lumot bazada qolmaydi. */
class Rollback extends Error {}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("runReconciliation", () => {
  it("har bir tekshiruv yuguradi va shakli to'g'ri", async () => {
    const checks = await prisma.$transaction(async (tx) => runReconciliation(tx), {
      timeout: 60_000,
    });

    expect(checks.length, "tekshiruvlar ro'yxati bo'sh").toBeGreaterThan(10);

    for (const c of checks) {
      expect(c.key, "kalit bo'sh").toBeTruthy();
      expect(c.title, `${c.key} — sarlavha bo'sh`).toBeTruthy();
      expect(STATUSES.has(c.status), `${c.key} — noma'lum holat: ${c.status}`).toBe(true);
      expect(Number.isFinite(c.value), `${c.key} — qiymat son emas`).toBe(true);
      expect(c.detail, `${c.key} — izoh bo'sh`).toBeTruthy();
      // Muammo bor tekshiruv NIMA QILISH kerakligini aytishi shart, aks holda
      // foydalanuvchi qizil qatorni ko'radi va nima qilishni bilmaydi.
      if (c.status !== "ok") {
        expect(c.action, `${c.key} — muammo bor, lekin harakat ko'rsatilmagan`).toBeTruthy();
      }
    }
  }, 90_000);

  it("kalitlar unikal — UI ularni `key` bo'yicha chizadi", async () => {
    const checks = await prisma.$transaction(async (tx) => runReconciliation(tx), {
      timeout: 60_000,
    });
    const keys = checks.map((c) => c.key);
    expect(new Set(keys).size, `dublikat kalit: ${keys.join(", ")}`).toBe(keys.length);
  }, 90_000);

  it("jurnal muvozanati buzilsa `ledger-balanced` xato beradi", async () => {
    // Muvozanatsiz BITTA oyoq qo'shamiz — debet bor, kredit yo'q.
    // Tranzaksiya oxirida rollback, ya'ni bazaga yozilmaydi.
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = await runReconciliation(tx);
          const beforeLedger = before.find((c) => c.key === "ledger-balanced");
          expect(beforeLedger, "`ledger-balanced` tekshiruvi yo'q").toBeDefined();

          await tx.ledgerEntry.create({
            data: {
              transactionId: TAG,
              accountId: ACCOUNTS.CASH,
              debit: 1,
              credit: 0,
              description: TAG,
              period: "2099-11",
            },
          });

          const after = await runReconciliation(tx);
          const afterLedger = after.find((c) => c.key === "ledger-balanced");
          expect(afterLedger?.status, "muvozanatsiz oyoq xato bermadi").toBe("error");
          expect(afterLedger?.action, "xato bor, lekin harakat aytilmagan").toBeTruthy();

          throw new Rollback();
        },
        { timeout: 60_000 }
      )
    ).rejects.toBeInstanceOf(Rollback);

    // Rollback HAQIQATAN bo'lganini tasdiqlaymiz — aks holda test bazada
    // muvozanatsiz qator qoldirib ketardi.
    const leftover = await prisma.ledgerEntry.count({ where: { transactionId: TAG } });
    expect(leftover, "test qator bazada qolib ketdi").toBe(0);
  }, 90_000);
});

describe("worstStatus", () => {
  const check = (status: "ok" | "warn" | "error") => ({
    key: status,
    title: status,
    status,
    value: 0,
    detail: status,
  });

  it("bo'sh ro'yxat — ok", () => {
    expect(worstStatus([])).toBe("ok");
  });

  it("bitta xato butun to'plamni xato qiladi", () => {
    expect(worstStatus([check("ok"), check("warn"), check("error")])).toBe("error");
  });

  it("xato bo'lmasa ogohlantirish ustun", () => {
    expect(worstStatus([check("ok"), check("warn")])).toBe("warn");
  });

  it("hammasi mos bo'lsa — ok", () => {
    expect(worstStatus([check("ok"), check("ok")])).toBe("ok");
  });
});
