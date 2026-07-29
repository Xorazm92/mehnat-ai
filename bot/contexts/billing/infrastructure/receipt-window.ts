import { getSharedRedis } from "../../../queues/connection";

/**
 * The receipt window.
 *
 * A client group carries all sorts of photos, so forwarding every one of them
 * to the accountant would be spam. Instead the "📄 Kvitansiya yuborish" button
 * opens a short window on that chat, and only a photo posted inside it is
 * treated as a payment receipt.
 *
 * Redis rather than a table: the state lives for half an hour and dies on its
 * own. A Postgres row would need a schema change plus a sweep to clean up after
 * the many windows nobody ever fills.
 */
const WINDOW_SECONDS = 30 * 60;

const key = (chatId: bigint) => `asro:receipt-expect:${chatId}`;

/** Arm the window for a chat. Re-pressing the button just extends it. */
export async function expectReceipt(chatId: bigint, period: string): Promise<void> {
  await getSharedRedis().set(key(chatId), period, "EX", WINDOW_SECONDS);
}

/**
 * Consume the window if one is open, returning the period it was opened for.
 * Atomic (GETDEL), so two photos arriving together cannot both be forwarded.
 */
export async function takeReceiptExpectation(chatId: bigint): Promise<string | null> {
  return getSharedRedis().getdel(key(chatId));
}
