// =====================================================
// IN-MEMORY RATE LIMITER — login brute-force himoyasi
// =====================================================
// Fixed-window hisoblagich (identifikator bo'yicha). Faqat MUVAFFAQIYATSIZ
// urinishlar hisoblanadi; muvaffaqiyat hisoblagichni tozalaydi. Web bitta pm2
// instance (fork) bo'lgani uchun in-memory yetarli; ko'p instance kerak bo'lsa
// Redis'ga ko'chiriladi. Edge EMAS — lib/auth.ts (Node authorize) ishlatadi.

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // xotira portlashidan himoya

function pruneIfLarge(now: number): void {
  if (store.size < MAX_KEYS) return;
  for (const [k, b] of store) if (now >= b.resetAt) store.delete(k);
}

/** Urinishga ruxsat bormi (limitdan oshmaganmi). Hisoblagichni O'ZGARTIRMAYDI. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = store.get(key);
  if (!b || now >= b.resetAt) return { allowed: true, retryAfterMs: 0 };
  if (b.count >= limit) return { allowed: false, retryAfterMs: b.resetAt - now };
  return { allowed: true, retryAfterMs: 0 };
}

/** Muvaffaqiyatsiz urinishni qayd etadi (oynani ochadi yoki hisobni oshiradi). */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  pruneIfLarge(now);
  const b = store.get(key);
  if (!b || now >= b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
}

/** Muvaffaqiyatda hisoblagichni tozalaydi. */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Testlar uchun — butun holatni tozalaydi. */
export function __clearRateLimitStore(): void {
  store.clear();
}
