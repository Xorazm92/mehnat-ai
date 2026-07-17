/**
 * Cheap, pure heuristic: could this text be a question? Used as a pre-filter so
 * the AI classifier is only called on plausible candidates (cost control), and
 * as the whole signal when no AI key is configured. Recall over precision — the
 * classifier makes the final call.
 */

const QUESTION_WORDS = new Set([
  // Uzbek (Latin)
  "qanday", "qanaqa", "qachon", "qayer", "qayerda", "qaysi", "qaysi", "qancha",
  "necha", "nechta", "nega", "nima", "nimaga", "nimuchun", "kim", "kimga",
  "iltimos", "mumkinmi",
  // Russian
  "как", "когда", "где", "куда", "сколько", "почему", "зачем", "что", "кто",
  "какой", "какая", "ли",
]);

// Uzbek yes/no enclitic: bormi, keldimi, kerakmi, mumkinmi …
const ENCLITIC_RE = /(mi|mikan|mikin)$/;

export function looksLikeQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes("?") || lower.includes("؟")) return true;

  const tokens = lower.split(/[^0-9a-zа-яёʼ'`-]+/i).filter(Boolean);
  for (const token of tokens) {
    if (QUESTION_WORDS.has(token)) return true;
    if (token.length > 3 && ENCLITIC_RE.test(token)) return true;
  }
  return false;
}
