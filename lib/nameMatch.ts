// =====================================================
// ISM MOSLASHTIRISH — sof, framework-free
// =====================================================
// Xodim ro'yxatlari odamlar qo'lida yoziladi, shuning uchun bir ism o'nlab
// ko'rinishda keladi: "Adham" / "Adxam", "Xumora" / "Humora", "Шерзод" /
// "Sherzod", hatto Telegramdan nusxa olinganda "𝐌𝐚𝐫𝐝𝐨𝐧" (Unicode matematik
// qalin harflar). Bu modul ularning hammasini bitta ko'rinishga keltiradi va
// ikki ism qanchalik yaqinligini baholaydi.
//
// Moslashtirish TAXMINIY: u faqat nomzod taklif qiladi, qaror odamniki.

/** O'zbek kirill → lotin. `х` → `h` keyingi bosqichda bir xillashadi. */
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/**
 * Ismni solishtirish uchun yagona ko'rinishga keltiradi.
 *
 * Bosqichlar tartibi muhim:
 *  1. NFKD — "𝐌𝐚𝐫𝐝𝐨𝐧" kabi Unicode variantlarni oddiy harflarga qaytaradi.
 *     Busiz keyingi `[^a-z]` filtri butun ismni o'chirib yuborardi.
 *  2. apostroflar (ʻ ʼ ' ' `) tashlanadi: "Abdugʻani" → "abdugani".
 *  3. kirill → lotin: "Шерзод" → "sherzod".
 *  4. x → h: o'zbek lotinida bir ism ikki xil yoziladi (Axmadjon/Ahmadjon).
 *  5. qolgan hamma narsa tashlanadi.
 */
export function normalizeName(raw: string): string {
  // Ў NFKD'da "У + breve" ga yoyiladi va keyin "u" bo'lib qolardi. O'zbekchada
  // u "o'" — shuning uchun yoyilishdan OLDIN almashtiramiz.
  let s = raw.replace(/[Ўў]/g, "o").replace(/[Ққ]/g, "q").replace(/[Ғғ]/g, "g").replace(/[Ҳҳ]/g, "h");
  s = s.normalize("NFKD").toLowerCase();
  s = s.replace(/[̀-ͯ]/g, ""); // diakritik belgilar
  s = s.replace(/[ʻʼ‘’'`´]/g, "");
  s = s.replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC[ch] ?? "");
  s = s.replace(/x/g, "h");
  return s.replace(/[^a-z]/g, "");
}

/**
 * Lavozim / firma so'zlari — ismni ajratib olish uchun tashlanadi.
 * Normallashgan ko'rinishda saqlanadi (buxgalter → buhgalter), chunki
 * solishtirish ham normallashgandan keyin bo'ladi.
 */
const NOISE_RAW = [
  "buxgalteri", "buxgalter", "buhgalter", "bookkeper", "bookkeeper", "accountant",
  "consultant", "nazoratchi", "banking", "bank", "klient", "client",
  "bosh", "finco", "finco2", "trinity", "chicken",
];
const NOISE = new Set(NOISE_RAW.map(normalizeName));

/**
 * Ro'yxatdagi yozuvdan ism-nomzodlarni ajratadi.
 *
 * Familiya ATAYIN tashlanmaydi: bazada ba'zan familiya yozilgan bo'lishi
 * mumkin, shuning uchun "Ismatillayev" ham nomzod bo'lib qoladi — u mos
 * kelmasa shunchaki hisobga olinmaydi.
 */
export function nameCandidates(label: string): string[] {
  return label
    .split(/[\s_.,]+/)
    .map(normalizeName)
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w));
}

/** Levenshtein masofasi — qisqa ismlar uchun yetarli. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export type MatchTier = "exact" | "near" | "weak" | "none";

export interface MatchScore {
  tier: MatchTier;
  distance: number;
}

/**
 * Nomzodlar ichidan `dbName` ga eng yaqinini baholaydi.
 *
 * Prefiks qoidasi ("Dilhush" ↔ "Dilxushbek") faqat IKKALA ism ham 5 harfdan
 * uzun bo'lganda qo'llanadi. Faqat uzunini tekshirish yetarli emas edi: "Ali"
 * har qanday "Alisher" ga yopishib olardi, chunki uzuni shartni qanoatlantirardi.
 */
const PREFIX_MIN_LENGTH = 5;

export function scoreMatch(candidates: string[], dbName: string): MatchScore {
  const target = normalizeName(dbName);
  if (!target) return { tier: "none", distance: Number.POSITIVE_INFINITY };

  let best = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c === target) return { tier: "exact", distance: 0 };
    const shorter = Math.min(c.length, target.length);
    if (shorter >= PREFIX_MIN_LENGTH && (c.startsWith(target) || target.startsWith(c))) {
      best = Math.min(best, 1);
      continue;
    }
    best = Math.min(best, editDistance(c, target));
  }
  if (best <= 1) return { tier: "near", distance: best };
  if (best <= 2) return { tier: "weak", distance: best };
  return { tier: "none", distance: best };
}
