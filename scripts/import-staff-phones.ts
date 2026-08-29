/**
 * XODIM TELEFON RAQAMLARINI IMPORT QILISH
 * =======================================
 * Telegram boti xodimni FAQAT telefon raqami orqali taniydi
 * (`User.phoneNormalized` ← lib/phone.ts#phoneKey, oxirgi 9 raqam). Raqamsiz
 * xodim "📱 Raqamni yuborish" tugmasini bosganda "topilmadi" javobini oladi.
 *
 * @username ham saqlanadi, LEKIN u bog'lash uchun ishlatilmaydi: Telegram Bot
 * API @username ni raqamli id ga aylantira olmaydi. Bog'lanish faqat xodim o'zi
 * kontaktini yuborganda yuz beradi. Username — admin uchun "kimni chaqirish
 * kerak" ma'lumoti.
 *
 * ISHLATISH (standart holat — QURUQ, hech narsa yozilmaydi):
 *   npx tsx scripts/import-staff-phones.ts
 *   npx tsx scripts/import-staff-phones.ts --apply
 *
 * Ism moslashtirish TAXMINIY (lib/nameMatch.ts). Faqat aniq mosliklar yoziladi;
 * shubhali va topilmaganlar hisobotga chiqadi va ular bilan odam ishlaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { phoneKey, formatPhone } from "@/lib/phone";
import { nameCandidates, scoreMatch, type MatchTier } from "@/lib/nameMatch";
import type { UserRole } from "@/lib/platform/permissions";

interface RosterEntry {
  /** Ro'yxatdagi to'liq yozuv (lavozim/firma so'zlari bilan). */
  label: string;
  phone: string;
  /** @ belgisisiz; yo'q bo'lsa undefined. */
  username?: string;
  /** Kadrlar izohi (masalan ishdan bo'shash) — hisobotda ko'rsatiladi. */
  note?: string;
}

/**
 * Joriy jamoa (2026-07-30), berilgan ro'yxat AYNAN ko'chirilgan.
 *
 * Ataylab tozalanmagan: takror yozuv, Unicode qalin harflar, kirill ism va
 * matn ichiga tushib qolgan kirill "а" — hammasi shu yerda qoladi, chunki
 * skript aynan shunday kirishni hazm qila olishi kerak. Tozalash normalizatsiya
 * qatlamining ishi (lib/nameMatch.ts), ro'yxatniki emas.
 */
const ROSTER: RosterEntry[] = [
  { label: "Alisher FinCo", phone: "+998 93 123 41 66" },
  { label: "Dilxushbek Buxgalter", phone: "+998 93 977 41 66", username: "dilxushbek_buxgalter" },
  { label: "Azizbek Banking", phone: "+998 93 555 41 66", username: "Accountant_Azizbek" },
  { label: "Begzod Banking", phone: "+998 94 514 41 66", username: "Accountant_Begzod" },
  { label: "Zamira Buxgalter", phone: "+998 94 260 41 66", username: "Zamira_Buxgalter" },
  { label: "Azizbek Buxgalter", phone: "+998 94 390 41 66", username: "Azizbek_Accountant" },
  { label: "Yorqinoy Bosh buxgalter", phone: "+998 94 513 41 66", username: "Buxgalter_Yorqinoy" },
  { label: "Buxgalter Guzal nazoratchi", phone: "+998 93 700 41 66", username: "Guzal_buxgalter" },
  // Unicode matematik qalin harflar — NFKD ularni oddiy harfga qaytaradi.
  { label: "𝐌𝐚𝐫𝐝𝐨𝐧 𝐁𝐮𝐱𝐠𝐚𝐥𝐭𝐞𝐫", phone: "+998 50 588 41 66", username: "buxgalter_Mardon" },
  { label: "Musobek Buxgalter", phone: "+998 94 622 41 66", username: "Musobek_Accountant" },
  { label: "Muxriddin banking FinCo 2", phone: "+998 93 077 41 66", username: "Muxriddin_Accountant" },
  // "Sevarа" oxiridagi "а" — kirill (ko'zga ko'rinmaydi).
  { label: "Sevarа Shukurova", phone: "+998 94 744 41 66", username: "sevarabuxgalter55" },
  { label: "Buxgalter_Ahmadjon", phone: "+998 94 608 41 66", username: "Buxgalter_Ahmadjon" },
  { label: "Ilhom O'ktamov", phone: "+998 93 381 41 66" },
  // 15-o'rin — 2-yozuvning aynan takrori (bir xil raqam); skript birlashtiradi.
  { label: "Dilxushbek Buxgalter", phone: "+998 93 977 41 66", username: "dilxushbek_buxgalter" },
  { label: "Mohira Yuldashevna FinCo 2 bosh buxgaleri", phone: "+998 94 623 41 66", username: "BoshBuxgalter_Mohira" },
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
  { label: "Sevinch Buxgalter", phone: "+998 93 828 41 66", username: "Sevinch_Buxgalter" },
  { label: "Elbek Ismatillayev FinCo 2", phone: "+998 50 999 41 66", username: "elbek_ismatillayev_accountant" },
  { label: "Mohirbek Yo'ldoshov FinCo2", phone: "+998 50 877 41 66", username: "mohirbek_accountant" },
  { label: "Abrorbek FinCo", phone: "+998 94 777 41 66", username: "abrorconsultant" },
  // Yagona "41 66" bilan tugamaydigan raqam — boshqa SIM, korporativ blokdan emas.
  { label: "Шерзод Мирсаидов chicken", phone: "+998 90 928 60 69", username: "mirsaidov_sh" },
  {
    label: "Otabek Buxgalter",
    phone: "+998 93 500 41 66",
    username: "Otabek_Buxgalter",
    note: "bo'shash arafasida, vosstanovleniyasi bor",
  },
];

/**
 * QO'LDA TASDIQLANGAN mosliklar — avtomatik moslashtirish topa olmagan yoki
 * ikkilangan holatlar. Bu yerdagi yozuv `User.fullName` ga AYNAN teng bo'lishi
 * kerak va u har qanday avtomatik taxminni bekor qiladi.
 *
 * Har biri odam tomonidan tasdiqlangan, taxmin emas.
 */
const MANUAL_MATCH: Record<string, string> = {
  // Ism juda uzoq (guzal ↔ gozaloy), lekin ikkalasi ham nazoratchi — bir odam.
  "Buxgalter Guzal nazoratchi": "Go'zaloy",
  // Ikkita turli Azizbek bor. Bazadagi "Azizbek" 70 ta firmada BANK-KLIENT
  // (buxgalter sifatida bitta ham firmasi yo'q), demak u aynan "Azizbek
  // Banking". Buxgalter uchun alohida kartochka scripts/seed-staff-cards.ts da.
  "Azizbek Banking": "Azizbek",
};

/**
 * Ro'yxat yorlig'idan lavozimni chiqaradi. `null` — yorliqda aniq belgi yo'q,
 * demak rolga TEGILMAYDI (taxmin qilib odamning ko'rish doirasini
 * o'zgartirmaymiz).
 *
 * Tartib muhim: "Mohira ... FinCo 2 bosh buxgalteri" ham "bank" ni o'z ichiga
 * olmaydi, lekin "Muxriddin banking" ham "bosh" emas — shu bois eng aniq
 * belgidan boshlanadi.
 */
function roleFromLabel(label: string): UserRole | null {
  const l = label.toLowerCase();
  if (/bosh\s*buxgalter/.test(l)) return "chief_accountant";
  if (/nazoratchi/.test(l)) return "supervisor";
  if (/\bbank/.test(l)) return "bank_manager";
  return null;
}

/** Firma biriktiruvlari — rol taklifini tasdiqlash uchun dalil. */
interface Assignments {
  accountant: number;
  bankClient: number;
  supervisor: number;
  chief: number;
}

/**
 * Taklif qilingan rol firma biriktiruvlari bilan tasdiqlanadimi?
 *
 * Rolni o'zgartirish odamning KO'RISH DOIRASINI o'zgartiradi
 * (lib/access.ts#companyScopeWhere): `bank_manager` firmalarni `bankClientId`
 * bo'yicha ko'radi, `accountant` esa `accountantId` bo'yicha. Agar biriktiruv
 * mos kelmasa, rolni o'zgartirish odamni firmalarisiz qoldirardi — shuning
 * uchun dalilsiz o'zgartirmaymiz.
 */
function roleSupported(role: UserRole, a: Assignments): boolean {
  switch (role) {
    case "bank_manager":
      return a.bankClient > 0;
    case "supervisor":
      return a.supervisor > 0;
    case "chief_accountant":
      return a.chief > 0;
    default:
      return a.accountant > 0;
  }
}

/** Test/fixture hisoblari — importdan chetlatiladi. */
function isFixture(fullName: string): boolean {
  return /^(test|vitest|super admin)/i.test(fullName.trim());
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const db = prisma;

  // 1) Ro'yxat ichidagi takrorlarni raqam bo'yicha birlashtiramiz.
  const byPhone = new Map<string, RosterEntry[]>();
  for (const r of ROSTER) {
    const key = phoneKey(r.phone);
    if (!key) {
      console.error(`⚠️  Raqamni o'qib bo'lmadi: ${r.label} — ${r.phone}`);
      continue;
    }
    byPhone.set(key, [...(byPhone.get(key) ?? []), r]);
  }
  for (const [key, list] of byPhone) {
    if (list.length > 1) {
      console.log(`ℹ️  Takror (${key}): ${list.map((l) => l.label).join(" / ")} — bittasi olinadi`);
    }
  }
  console.log(`\nRo'yxat: ${ROSTER.length} yozuv → ${byPhone.size} noyob raqam`);

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, role: true, phone: true, phoneNormalized: true, telegramUserId: true },
    orderBy: { fullName: "asc" },
  });
  const real = users.filter((u) => !isFixture(u.fullName));
  console.log(`Bazada faol xodim: ${real.length} (test hisoblari hisobga olinmadi)\n`);

  type Row = { user: (typeof real)[number]; entry: RosterEntry; tier: MatchTier };
  const matched: Row[] = [];
  const review: Row[] = [];
  const unmatched: RosterEntry[] = [];

  // 2) Har bir yozuv uchun eng yaqin kartochka — hali hech kimni band qilmasdan.
  //    Band qilish birinchi kelganga ustunlik berardi va raqobatni yashirardi.
  const proposals = new Map<RosterEntry, { user: (typeof real)[number]; tier: MatchTier; distance: number }>();
  const pinnedEntries = new Set<RosterEntry>();
  for (const [, list] of byPhone) {
    const entry = list[0];

    // Qo'lda tasdiqlangan moslik — taxmindan ustun.
    const pinned = MANUAL_MATCH[entry.label];
    if (pinned) {
      const user = real.find((u) => u.fullName === pinned);
      if (user) {
        proposals.set(entry, { user, tier: "exact", distance: 0 });
        pinnedEntries.add(entry);
        continue;
      }
      console.error(`⚠️  MANUAL_MATCH "${entry.label}" → "${pinned}": bunday xodim topilmadi.`);
    }

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

  // 3) RAQOBAT: bitta kartochkaga bir nechta yozuv da'vo qilsa, qaysi biri
  //    to'g'riligini kod hal qila olmaydi ("Azizbek Banking" va "Azizbek
  //    Buxgalter", bazada bitta "Azizbek"). Ikkalasi ham qo'lga tushadi —
  //    birini tanlash tanga tashlash bo'lardi.
  const claimants = new Map<string, RosterEntry[]>();
  for (const [entry, p] of proposals) {
    claimants.set(p.user.id, [...(claimants.get(p.user.id) ?? []), entry]);
  }
  for (const [entry, p] of proposals) {
    const rivals = claimants.get(p.user.id) ?? [];
    // Qo'lda tasdiqlangan da'vogar bo'lsa — raqobat tugagan: u yutadi, qolgani
    // esa o'z kartochkasini kutayotgan begona (uni seed-staff-cards.ts yaratadi).
    const pinnedRival = rivals.find((r) => pinnedEntries.has(r));
    if (pinnedRival && pinnedRival !== entry) {
      unmatched.push(entry);
      continue;
    }
    const contested = !pinnedRival && rivals.length > 1;
    const row: Row = { user: p.user, entry, tier: contested ? "weak" : p.tier };
    if (!contested && (p.tier === "exact" || p.tier === "near")) matched.push(row);
    else review.push(row);
  }

  // 4) TO'QNASHUV: ikki xodimga bir xil kalit tushsa, bog'lash "ambiguous"
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

  // 5) ROL MOSLIGI. Yorliqda "banking"/"nazoratchi"/"bosh buxgalter" bo'lsa,
  //    kartochkadagi rol shunga mos kelishi kerak — aks holda RBAC ham, botning
  //    SLA oynasi ham noto'g'ri ishlaydi (bank-klient 5 daq, buxgalter 10 daq).
  interface RoleChange { user: Row["user"]; from: UserRole; to: UserRole; a: Assignments; supported: boolean }
  const roleChanges: RoleChange[] = [];
  for (const m of matched) {
    const want = roleFromLabel(m.entry.label);
    if (!want || want === m.user.role) continue;
    const [accountant, bankClient, supervisor, chief] = await Promise.all([
      db.company.count({ where: { isActive: true, accountantId: m.user.id } }),
      db.company.count({ where: { isActive: true, bankClientId: m.user.id } }),
      db.company.count({ where: { isActive: true, supervisorId: m.user.id } }),
      db.company.count({ where: { isActive: true, chiefAccountantId: m.user.id } }),
    ]);
    const a: Assignments = { accountant, bankClient, supervisor, chief };
    roleChanges.push({ user: m.user, from: m.user.role as UserRole, to: want, a, supported: roleSupported(want, a) });
  }

  // ── Hisobot ────────────────────────────────────────────────────────────────
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  console.log(`✅ ANIQ MOSLIK (${matched.length}) — ${apply ? "yoziladi" : "yozilardi"}:`);
  for (const m of matched) {
    const was = m.user.phoneNormalized ? "  (raqam yangilanadi)" : "";
    const note = m.entry.note ? `  ⚑ ${m.entry.note}` : "";
    console.log(
      `   ${pad(m.user.fullName, 12)} [${pad(m.user.role, 16)}] ← ${pad(m.entry.label, 34)} ${formatPhone(m.entry.phone)}${was}${note}`,
    );
  }

  if (review.length) {
    console.log(`\n🟡 SHUBHALI (${review.length}) — YOZILMAYDI, qo'lda hal qiling:`);
    for (const r of review) {
      console.log(
        `   ${pad(r.user.fullName, 12)} [${pad(r.user.role, 16)}] ←? ${pad(r.entry.label, 34)} ${formatPhone(r.entry.phone)}`,
      );
    }
  }

  if (unmatched.length) {
    console.log(`\n❌ BAZADA TOPILMADI (${unmatched.length}) — avval xodim kartochkasi yaratilsin:`);
    for (const e of unmatched) {
      console.log(`   ${pad(e.label, 34)} ${formatPhone(e.phone)}${e.note ? `  ⚑ ${e.note}` : ""}`);
    }
  }

  const claimed = new Set([...matched, ...review].map((r) => r.user.id));
  const leftover = real.filter((u) => !claimed.has(u.id));
  if (leftover.length) {
    console.log(`\n⚪ RO'YXATDA YO'Q (${leftover.length}) — raqamsiz qoladi, bot ularni tanimaydi:`);
    for (const u of leftover) {
      console.log(`   ${pad(u.fullName, 12)} [${pad(u.role, 16)}] ${u.phone ?? "raqam yo'q"}`);
    }
  }

  const okRoles = roleChanges.filter((r) => r.supported);
  const iffyRoles = roleChanges.filter((r) => !r.supported);
  if (okRoles.length) {
    console.log(`\n🔧 ROL TUZATILADI (${okRoles.length}) — yorliq va firma biriktiruvi mos:`);
    for (const r of okRoles) {
      console.log(
        `   ${pad(r.user.fullName, 12)} ${r.from} → ${r.to}   (bux ${r.a.accountant} / bank ${r.a.bankClient} / nazorat ${r.a.supervisor} / bosh ${r.a.chief})`,
      );
    }
  }
  if (iffyRoles.length) {
    console.log(`\n⚠️  ROL MOS EMAS, LEKIN DALIL YO'Q (${iffyRoles.length}) — tegilmaydi:`);
    for (const r of iffyRoles) {
      console.log(
        `   ${pad(r.user.fullName, 12)} ${r.from} → ${r.to}?  (bux ${r.a.accountant} / bank ${r.a.bankClient} / nazorat ${r.a.supervisor} / bosh ${r.a.chief})`,
      );
    }
  }

  const linked = real.filter((u) => u.telegramUserId).length;
  console.log(`\n📊 Telegramga bog'langan: ${linked} / ${real.length}`);

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
    console.error(`\n⛔ To'qnashuv bor — hech narsa yozilmadi. Avval takror raqamlarni hal qiling.`);
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
  let roleFixed = 0;
  for (const r of roleChanges.filter((x) => x.supported)) {
    await prisma.user.update({ where: { id: r.user.id }, data: { role: r.to } });
    roleFixed++;
  }
  console.log(`\n✅ ${written} ta xodim kartochkasi yangilandi${roleFixed ? `, ${roleFixed} ta rol tuzatildi` : ""}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("import-staff-phones failed:", e);
  process.exit(1);
});
