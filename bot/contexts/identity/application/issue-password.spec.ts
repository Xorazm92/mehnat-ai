import { describe, it, expect, beforeEach } from "vitest";
import {
  generatePassword,
  issueWebPassword,
  EPHEMERAL_MS,
  REISSUE_COOLDOWN_MS,
} from "./issue-password";

/** Faqat shu testga kerak bo'lgan Prisma qismi. */
function fakePrisma(email = "xodim@mehnat.uz") {
  const calls = { updates: 0, audits: 0, lastHash: "" };
  return {
    calls,
    user: {
      findUnique: async () => ({ email }),
      update: async ({ data }: { data: { passwordHash: string } }) => {
        calls.updates++;
        calls.lastHash = data.passwordHash;
        return {};
      },
    },
    auditLog: {
      create: async () => {
        calls.audits++;
        return {};
      },
    },
  };
}

type FakePrisma = ReturnType<typeof fakePrisma>;
/** `issueWebPassword` to'liq PrismaClient kutadi; test faqat ishlatiladigan
 *  qismini beradi, shuning uchun chaqiruv joyida cast qilinadi. */
const as = (p: FakePrisma) => p as unknown as Parameters<typeof issueWebPassword>[0];

const PRIVATE = { chatId: BigInt(111), fromUserId: BigInt(111) };

/**
 * Chastota chegarasi jarayon xotirasida, foydalanuvchi id'si bo'yicha
 * saqlanadi — bu ataylab, botning bitta jarayoni uchun yetarli. Shuning uchun
 * har test O'Z xodimini ishlatadi, aks holda oldingi testning kutish muddati
 * keyingisiga o'tib ketardi.
 */
let seq = 0;
const someone = () => ({ id: `u${++seq}` });

describe("generatePassword", () => {
  it("chalkashadigan belgilarni ishlatmaydi", () => {
    // Parol ekrandan qo'lda ko'chiriladi: 0/O va 1/l/I ni ajratib bo'lmaydi.
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("har safar boshqacha va so'ralgan uzunlikda", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword(12)));
    expect(seen.size).toBe(50);
    expect(generatePassword(20)).toHaveLength(20);
  });
});

describe("issueWebPassword", () => {
  let now: number;
  beforeEach(() => {
    now = 1_800_000_000_000 + Math.random() * 1_000_000;
  });

  it("shaxsiy chatda parol beradi va uni o'tkinchi qilib yuboradi", async () => {
    const prisma = fakePrisma("aziz@mehnat.uz");
    const me = someone();
    const out = await issueWebPassword(as(prisma), me, { ...PRIVATE, now });

    expect(out.send).toHaveLength(1);
    const msg = out.send![0];
    expect(msg.chatId).toBe(BigInt(111));
    expect(msg.ephemeralMs).toBe(EPHEMERAL_MS);
    expect(msg.text).toContain("aziz@mehnat.uz");
    // Parolning o'zi tugma javobida (toast) EMAS — u ekranda hammaga ko'rinadi.
    expect(out.answer).not.toMatch(/Parol: /);
  });

  it("GURUHDA rad etadi — parol mijozlarga ko'rinib ketardi", async () => {
    const prisma = fakePrisma();
    const me = someone();
    const out = await issueWebPassword(as(prisma), me, {
      chatId: BigInt("-1004348640823"), // guruh
      fromUserId: BigInt(111),
      now,
    });

    expect(out.send).toBeUndefined();
    expect(out.alert).toBe(true);
    // Eng muhimi: parol ALMASHTIRILMAYDI. Aks holda guruhda bosilgan tugma
    // xodimni parolsiz qoldirardi.
    expect(prisma.calls.updates).toBe(0);
  });

  it("ketma-ket bosishda parolni qayta almashtirmaydi", async () => {
    const prisma = fakePrisma();
    const me = someone();
    const calls = prisma.calls;

    await issueWebPassword(as(prisma), me, { ...PRIVATE, now });
    const second = await issueWebPassword(as(prisma), me, { ...PRIVATE, now: now + 1_000 });

    expect(second.send).toBeUndefined();
    expect(second.alert).toBe(true);
    // Ikkinchi bosish parolni almashtirsa, birinchi xabardagi parol allaqachon
    // eskirgan bo'lardi — xodim ko'chirib olgan parol ishlamasdi.
    expect(calls.updates).toBe(1);
  });

  it("kutish muddati o'tgach yangi parol beradi", async () => {
    const prisma = fakePrisma();
    const me = someone();
    const calls = prisma.calls;

    await issueWebPassword(as(prisma), me, { ...PRIVATE, now });
    const later = await issueWebPassword(as(prisma), me, {
      ...PRIVATE,
      now: now + REISSUE_COOLDOWN_MS + 1,
    });

    expect(later.send).toHaveLength(1);
    expect(calls.updates).toBe(2);
  });

  it("parolni oshkor saqlamaydi va audit izini yozadi", async () => {
    const prisma = fakePrisma();
    const me = someone();
    const calls = prisma.calls;
    const out = await issueWebPassword(as(prisma), me, { ...PRIVATE, now });

    const sentPassword = out.send![0].text.match(/Parol: (\S+)/)![1];
    // Bazaga bcrypt hash yoziladi, parolning o'zi emas.
    expect(calls.lastHash).toMatch(/^\$2[aby]\$/);
    expect(calls.lastHash).not.toContain(sentPassword);
    expect(calls.audits).toBe(1);
  });
});
