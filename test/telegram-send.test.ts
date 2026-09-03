/**
 * TELEGRAM XATOLARINING TASNIFI — doimiy va o'tkinchi.
 *
 * Auditda: `bot/telegram/bot.ts` faqat 403 ni ajratardi, 429 esa umuman
 * ishlanmagan edi. Natijada tezlik chegarasiga urilgan xabar oddiy xato bilan
 * bir xil muomala ko'rardi: yo yo'qolardi, yo butun BullMQ fan-out'i uch marta
 * qayta yurardi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyError } from "grammy";

const sendMessageMock = vi.fn();

vi.mock("@/bot/config", () => ({
  config: { telegram: { token: "test-token" } },
  hasTelegramToken: () => true,
  callbackSecret: () => "s",
  QUEUE: { NOTIFY: "notify" },
}));

vi.mock("grammy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("grammy")>();
  return {
    ...actual,
    Bot: class {
      api = { sendMessage: sendMessageMock };
    },
  };
});

const { sendOnce } = await import("@/bot/telegram/send");

/** GrammyError konstruktori xom javobni talab qiladi — shu shaklda quramiz. */
function apiError(code: number, description: string, parameters?: Record<string, unknown>) {
  return new GrammyError(
    "Call to 'sendMessage' failed!",
    { ok: false, error_code: code, description, parameters } as never,
    "sendMessage",
    {} as never,
  );
}

beforeEach(() => {
  sendMessageMock.mockReset();
});

describe("sendOnce", () => {
  it("muvaffaqiyatli yuborishda `sent` va messageId qaytaradi", async () => {
    sendMessageMock.mockResolvedValue({ message_id: 42 });
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("sent");
    expect(res.messageId).toBe(42);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("403 → `unreachable`, qayta urinilmaydi", async () => {
    sendMessageMock.mockRejectedValue(apiError(403, "Forbidden: bot was blocked by the user"));
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("unreachable");
    // Doimiy rad — ikkinchi urinish bir xil natija berardi.
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("429 → Telegram aytgan vaqtni kutib BIR MARTA qayta uradi", async () => {
    sendMessageMock
      .mockRejectedValueOnce(apiError(429, "Too Many Requests: retry after 1", { retry_after: 1 }))
      .mockResolvedValueOnce({ message_id: 7 });
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("sent");
    expect(res.messageId).toBe(7);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("429 dan keyin ham bo'lmasa `failed` — kalit bo'shaydi, xabar yo'qolmaydi", async () => {
    sendMessageMock.mockRejectedValue(
      apiError(429, "Too Many Requests: retry after 1", { retry_after: 1 }),
    );
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("failed");
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("tarmoq xatosi → `failed` (o'tkinchi)", async () => {
    sendMessageMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("failed");
  });

  it("400 chat not found → `unreachable`", async () => {
    sendMessageMock.mockRejectedValue(apiError(400, "Bad Request: chat not found"));
    const res = await sendOnce(BigInt(1), "salom");
    expect(res.verdict).toBe("unreachable");
  });
});
