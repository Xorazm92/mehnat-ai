/**
 * XODIM TELEFON RAQAMLARINI IMPORT QILISH
 * =======================================
 * Telegram boti xodimni FAQAT telefon raqami orqali taniydi
 * (`User.phoneNormalized` ← lib/phone.ts#phoneKey, oxirgi 9 raqam). Raqamsiz
 * xodim "📱 Raqamni yuborish" tugmasini bosganda "topilmadi" javobini oladi.
 *
 * @username ni ham saqlaymiz, LEKIN u bog'lash uchun ishlatilmaydi: Telegram
 * Bot API @username ni raqamli id ga aylantira olmaydi. Bog'lanish faqat xodim
 * o'zi /start bosib kontaktini yuborganda yuz beradi. Username — admin uchun
 * "kimni chaqirish kerak" ma'lumoti.
 *
 * ISHLATISH (avval QURUQ ishlaydi, hech narsa yozmaydi):
 *   npx tsx scripts/import-staff-phones.ts
 *   npx tsx scripts/import-staff-phones.ts --apply
 *
 * Ism moslashtirish TAXMINIY, shuning uchun standart holat — quruq ishlash.
 * Faqat aniq (exact/near) mosliklar yoziladi; shubhalilari hisobotga chiqadi
 * va ular bilan odam ishlaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { phoneKey, formatPhone } from "@/lib/phone";

interface RosterEntry {
  /** Ro'yxatdagi to'liq yozuv (lavozim/firma so'zlari bilan). */
  label: string;
  phone: string;
  /** @ belgisisiz; yo'q bo'lsa undefined. */
  username?: string;
}

/** Joriy jamoa — foydalanuvchi bergan ro'yxat (2026-07-30). */
const ROSTER: RosterEntry[] = [
  { label: "Alisher FinCo", phone: "+998 93 123 41 66" },
  { label: "Dilxushbek Buxgalter", phone: "+998 93 977 41 66", username: "dilxushbek_buxgalter" },
  { label: "Azizbek Banking", phone: "+998 93 555 41 66", username: "Accountant_Azizbek" },
  { label: "Begzod Banking", phone: "+998 94 514 41 66", username: "Accountant_Begzod" },
  { label: "Zamira Buxgalter", phone: "+998 94 260 41 66", username: "Zamira_Buxgalter" },
  { label: "Azizbek Buxgalter", phone: "+998 94 390 41 66", username: "Azizbek_Accountant" },
  { label: "Yorqinoy Bosh buxgalter", phone: "+998 94 513 41 66", username: "Buxgalter_Yorqinoy" },
  { label: "Buxgalter Guzal nazoratchi", phone: "+998 93 700 41 66", username: "Guzal_buxgalter" },
  { label: "Mardon Buxgalter", phone: "+998 50 588 41 66", username: "buxgalter_Mardon" },
  { label: "Musobek Buxgalter", phone: "+998 94 622 41 66", username: "Musobek_Accountant" },
  { label: "Muxriddin banking FinCo 2", phone: "+998 93 077 41 66", username: "Muxriddin_Accountant" },
  { label: "Sevara Shukurova", phone: "+998 94 744 41 66", username: "sevarabuxgalter55" },
  { label: "Buxgalter Ahmadjon", phone: "+998 94 608 41 66", username: "Buxgalter_Ahmadjon" },
  { label: "Ilhom O'ktamov", phone: "+998 93 381 41 66" },
  { label: "Mohira Yuldashevna FinCo 2 bosh buxgalteri", phone: "+998 94 623 41 66", username: "BoshBuxgalter_Mohira" },
  { label: "Xumora Buxgalter", phone: "+998 94 717 41 66", username: "Xumora_Buxgalter" },
  { label: "Abdugʻani Buxgalter", phone: "+998 94 017 41 66", username: "Abdugani_buxgalter" },
  { label: "Adham buxgalter FinCo", phone: "+998 93 155 41 66", username: "adham_buxgalter" },
  { label: "Umid Buxgalter FinCo 2", phone: "+998 94 818 41 66", username: "Umid_accountant" },
  { label: "Mirahmad Buxgalter", phone: "+998 94 800 41 66", username: "Buxgalter_Mirahmad" },
  { label: "Dilmurod FinCo Trinity", phone: "+998 94 711 41 66" },
  { label: "Ruslan banking", phone: "+998 99 511 41 66", username: "Ruslan_bank_klient" },
  { label: "Olloshukur Buxgalter", phone: "+998 93 093 41 66", username: "Olloshukur_buxgalter" },
  { label: "Javohir buxgalter", phone: "+998 94 191 41 66", username: "Buxgalter_javohir" },
  { label: "Muslimbek Buxgalter nazoratchi", phone: "+998 93 550 41 66", username: "Muslimbek_buxgalter" },
  { label: "Buxgalter Mirabbos", phone: "+998 94 046 41 66", username: "Bookkeper_Mirabbos" },
];

/**
 * Lavozim / firma so'zlari — ismni ajratib olish uchun tashlanadi.
 * "bank" AVVAL "banking" dan keyin kelmasligi uchun ro'yxat uzunlik bo'yicha
 * saralanadi (aks holda "banking" dan "ing" qolib ketardi).
 */
const NOISE = [
  "buxgalteri", "buxgalter", "bookkeper", "bookkeeper", "accountant",
  "nazoratchi", "banking", "bank", "klient", "client",
  "bosh", "finco", "trinity", "yuldashevna", "shukurova", "oktamov",
];

/**
 * Ismni solishtirish uchun yagona ko'rinishga keltiradi.
 *
 * O'zbek lotinida bir ism turlicha yoziladi: Axmadjon/Ahmadjon,
 * Xumora/Humora, Adxam/Adham. `x → h` almashtirish shuning uchun. Apostrof
 * variantlari (ʻ ' ' `) va o'/g' ham bir xillashtiriladi.
 */
export function normalizeName(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/[ʻʼ‘’'`´]/g, ""); // apostroflar
  // Kirill "а/е/о/с/р" lotin matniga aralashib ketishi mumkin (kopi-pasta).
  s = s.replace(/[а]/g, "a").replace(/[е]/g, "e").replace(/[о]/g, "o")
       .replace(/[с]/g, "c").replace(/[р]/g, "p");
  s = s.replace(/x/g, "h"); // Axmadjon → ahmadjon
  s = s.replace(/[^a-z]/g, "");
  return s;
}

/** Ro'yxatdagi yozuvdan ism-nomzodlarni ajratadi. */
export function nameCandidates(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/[ʻʼ‘’'`´]/g, "")
    .split(/[\s_]+/)
    .filter(Boolean);
  const kept = words.filter((w) => !NOISE.includes(normalizeName(w)) && !/^\d+$/.test(w));
  return kept.map(normalizeName).filter((w) => w.length >= 3);
}

/** Levenshtein masofasi — kichik yozuvlar uchun yetarli. */
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

/** Ikki ism qanchalik mos — eng yaxshi nomzod bo'yicha. */
export function scoreMatch(candidates: string[], dbName: string): { tier: MatchTier; distance: number } {
  const target = normalizeName(dbName);
  let best = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c === target) return { tier: "exact", distance: 0 };
    // Biri ikkinchisining boshlanishi bo'lsa (Dilhush ↔ Dilhushbek) — yaqin.
    if (target.length >= 5 && (c.startsWith(target) || target.startsWith(c))) {
      best = Math.min(best, 1);
      continue;
    }
    best = Math.min(best, editDistance(c, target));
  }
  if (best <= 1) return { tier: "near", distance: best };
  if (best <= 2) return { tier: "weak", distance: best };
  return { tier: "none", distance: best };
}

/** Test/fixture hisoblari — importdan chetlatiladi. */
function isFixture(fullName: string): boolean {
  return /^(test|vitest|super admin)/i.test(fullName.trim());
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // 1) Ro'yxat ichidagi takrorlar (bir odam ikki marta yozilgan bo'lishi mumkin).
  const byPhone = new Map<string, RosterEntry[]>();
  for (const r of ROSTER) {
    const key = phoneKey(r.phone);
    if (!key) {
      console.error(`⚠️  Raqamni o'qib bo'lmadi: ${r.label} — ${r.phone}`);
      continue;
    }
    byPhone.set(key, [...(byPhone.get(key) ?? []), r]);
  }
  const dupes = [...byPhone.entries()].filter(([, list]) => list.length > 1);
  for (const [key, list] of dupes) {
    console.log(`ℹ️  Ro'yxatda takror (${key}): ${list.map((l) => l.label).join(" / ")} — bittasi olinadi`);
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true, phone: true, phoneNormalized: true, telegramUserId: true },
    orderBy: { fullName: "asc" },
  });
  const real = users.filter((u) => !isFixture(u.fullName));

  // 2) Har bir yozuv uchun eng yaxshi moslik.
  type Row = { user: (typeof real)[number]; entry: RosterEntry; tier: MatchTier };
  const matched: Row[] = [];
  const review: Row[] = [];
  const unmatched: RosterEntry[] = [];

  // Avval HAR BIR yozuv uchun eng yaxshi nomzodni topamiz — hali hech kimni
  // "band" qilmasdan. Band qilish birinchi kelganga ustunlik berardi va
  // raqobatni yashirardi.
  const proposals = new Map<RosterEntry, { user: (typeof real)[number]; tier: MatchTier; distance: number }>();
  for (const [, list] of byPhone) {
    const entry = list[0];
    const candidates = nameCandidates(entry.label);
    let best: { user: (typeof real)[number]; tier: MatchTier; distance: number } | null = null;
    for (const u of real) {
      const s = scoreMatch(candidates, u.fullName);
      if (s.tier === "none") continue;
      if (!best || s.distance < best.distance) best = { user: u, tier: s.tier, distance: s.distance };
    }
    if (best) proposals.set(entry, best);
    else unmatched.push(entry);
  }

  // RAQOBAT: bitta kartochkaga bir nechta yozuv da'vo qilsa — qaysi biri
  // to'g'riligini kod hal qila olmaydi (masalan "Azizbek Banking" va "Azizbek
  // Buxgalter", bazada esa bitta "Azizbek"). Ikkalasi ham qo'lda ko'rib
  // chiqishga tushadi; birini tanlab yozish tanga tashlash bo'lardi.
  const claimants = new Map<string, RosterEntry[]>();
  for (const [entry, p] of proposals) {
    claimants.set(p.user.id, [...(claimants.get(p.user.id) ?? []), entry]);
  }

  for (const [entry, p] of proposals) {
    const contested = (claimants.get(p.user.id) ?? []).length > 1;
    const row: Row = { user: p.user, entry, tier: contested ? "weak" : p.tier };
    if (!contested && (p.tier === "exact" || p.tier === "near")) matched.push(row);
    else review.push(row);
  }

  // 3) TO'QNASHUV: ikki xodimga bir xil kalit tushsa, bog'lash "ambiguous"
  //    bo'lib ISHLAMAY QOLADI — shuning uchun yozishdan oldin tekshiramiz.
  const plannedKeys = new Map<string, string[]>();
  for (const m of matched) {
    const k = phoneKey(m.entry.phone)!;
    plannedKeys.set(k, [...(plannedKeys.get(k) ?? []), m.user.fullName]);
  }
  for (const u of real) {
    if (!u.phoneNormalized) continue;
    if (matched.some((m) => m.user.id === u.id)) continue;
    plannedKeys.set(u.phoneNormalized, [...(plannedKeys.get(u.phoneNormalized) ?? []), u.fullName]);
  }
  const collisions = [...plannedKeys.entries()].filter(([, names]) => names.length > 1);

  // ── Hisobot ────────────────────────────────────────────────────────────────
  console.log(`\n✅ ANIQ MOSLIK (${matched.length}) — ${apply ? "yoziladi" : "yozilardi"}:`);
  for (const m of matched) {
    const was = m.user.phoneNormalized ? ` (eski: ${formatPhone(m.user.phone)})` : "";
    console.log(
      `   ${m.user.fullName.padEnd(14)} [${m.user.role.padEnd(17)}] ← ${m.entry.label.padEnd(38)} ${formatPhone(m.entry.phone)}${was}`,
    );
  }

  if (review.length) {
    console.log(`\n🟡 SHUBHALI (${review.length}) — YOZILMAYDI, qo'lda tasdiqlang:`);
    for (const r of review) {
      console.log(`   ${r.user.fullName.padEnd(14)} [${r.user.role.padEnd(17)}] ←? ${r.entry.label.padEnd(38)} ${formatPhone(r.entry.phone)}`);
    }
  }

  if (unmatched.length) {
    console.log(`\n❌ BAZADA TOPILMADI (${unmatched.length}) — avval xodim kartochkasi yaratilsin:`);
    for (const e of unmatched) console.log(`   ${e.label.padEnd(38)} ${formatPhone(e.phone)}`);
  }

  const claimed = new Set([...matched, ...review].map((r) => r.user.id));
  const leftover = real.filter((u) => !claimed.has(u.id));
  if (leftover.length) {
    console.log(`\n⚪ RO'YXATDA YO'Q xodimlar (${leftover.length}) — raqamsiz qoladi, bot ularni tanimaydi:`);
    for (const u of leftover) console.log(`   ${u.fullName} (${u.role})`);
  }

  if (collisions.length) {
    console.log(`\n🚨 TO'QNASHUV — bir raqam bir nechta xodimda. Bot bunday holatda bog'lashni RAD ETADI:`);
    for (const [k, names] of collisions) console.log(`   ${k}: ${names.join(", ")}`);
  }

  if (!apply) {
    console.log(`\n— Quruq ishlash. Yozish uchun: npx tsx scripts/import-staff-phones.ts --apply`);
    await prisma.$disconnect();
    return;
  }

  if (collisions.length) {
    console.error(`\n⛔ To'qnashuv bor — yozilmadi. Avval takror raqamlarni hal qiling.`);
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  let written = 0;
  for (const m of matched) {
    await prisma.user.update({
      where: { id: m.user.id },
      data: {
        phone: formatPhone(m.entry.phone),
        phoneNormalized: phoneKey(m.entry.phone),
        // Bog'lamaydi — faqat ma'lumot uchun (Bot API @username ni yecha olmaydi).
        ...(m.entry.username ? { telegramUsername: m.entry.username } : {}),
      },
    });
    written++;
  }
  console.log(`\n✅ ${written} ta xodim kartochkasi yangilandi.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("import-staff-phones failed:", e);
  process.exit(1);
});
