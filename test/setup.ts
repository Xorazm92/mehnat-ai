// =====================================================
// TEST IZOLYATSIYA QO'RIQCHISI
// =====================================================
// Audit topilmasi: integratsiya testlari ISHCHI bazaga qarshi yugurardi.
// `vitest.config.ts` `.env` va `.env.local` ni yuklaydi, DATABASE_URL esa
// o'sha yerda ishchi baza (`inbola`) — ya'ni `npm test` real ma'lumot ustiga
// yozardi. Bazada qolib ketgan `vitest-race-*`, `vitest-bill-*` qatorlari
// aynan shuning izi: test yiqilsa yoki jarayon o'ldirilsa `afterAll` dagi
// `deleteMany` hech qachon yetib bormaydi.
//
// Bundan ham xavflisi: prod bazasining nomi ham `inbola`. Ya'ni prod
// DATABASE_URL bilan bir marta `npm test` yozish yetarli edi.
//
// Bu fayl shu yo'lni yopadi. Uchta qoida:
//
//   1. `TEST_DATABASE_URL` berilgan bo'lsa — DATABASE_URL o'rniga o'sha
//      ishlatiladi. Bu tavsiya etilgan yo'l.
//   2. Yakuniy DATABASE_URL "test bazasi" ko'rinishida bo'lishi shart:
//      lokal host + nomida `test`. Aks holda fayl ishga tushmaydi.
//   3. Uzoq host yoki NODE_ENV=production — HECH QANDAY holatda o'tmaydi,
//      hatto qo'lda ruxsat berilgan bo'lsa ham.
//
// Chetlab o'tish: ASRO_ALLOW_UNSAFE_TEST_DB=1 (faqat lokal baza uchun,
// baland ogohlantirish bilan). Uzoq host/prod uchun bu bayroq ishlamaydi.
//
// Test bazasini bir marta tayyorlash:
//     npm run test:db:setup
import { beforeAll, expect } from "vitest";

/**
 * DB'ga tegadigan integratsiya testlari shu papkada yashaydi. Vitest `filepath`
 * ni HAR DOIM UNIX shaklida beradi, shuning uchun `path.sep` emas, qat'iy "/".
 */
const INTEGRATION_DIR = "/test/";

interface DbTarget {
  host: string;
  database: string;
  /** `?schema=` — Postgres nomlar fazosi. Berilmasa "public". */
  schema: string;
}

/**
 * Postgres URL'dan host, baza nomi va sxemani ajratadi. Parol ataylab
 * olinmaydi — bu qiymat xato matniga tushadi va terminal tarixida qoladi.
 */
function parseTarget(url: string): DbTarget | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      database: u.pathname.replace(/^\//, ""),
      schema: u.searchParams.get("schema") ?? "public",
    };
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** URL bo'yicha tasdiqlangan nishon — haqiqiy sxema tekshiruvi uchun. */
let verifiedTarget: DbTarget | null = null;
/** Haqiqiy sxema tekshiruvi jarayonda bir marta bajarilsin. */
let runtimeChecked = false;

/** Nomida `test` bo'lgan baza/sxemani test nishoni deb hisoblaymiz (asro_test, test_asro, asro-test). */
function looksLikeTest(name: string): boolean {
  return /(^|[_-])test([_-]|$)/i.test(name);
}

/**
 * Nishon izolyatsiyalanganmi? FAQAT alohida BAZA hisobga olinadi.
 *
 * Alohida SXEMA yo'li sinab ko'rildi va ISHLAMAYDI: Prisma Client jadval
 * nomlarini generatsiya vaqtidagi sxema bilan qattiq bog'laydi
 * (`"public"."Obligation"`), shuning uchun `?schema=` yoki `search_path`
 * o'zgartirilsa ham tipli so'rovlar baribir `public` ga tushadi. O'lchangan:
 *
 *     current_schema()            → asro_test
 *     raw  FROM "Obligation"      → 0      (search_path bo'yicha)
 *     prisma.obligation.count()   → 2982   (public'dan!)
 *
 * Ya'ni sxema izolyatsiyasi YOLG'ON xotirjamlik berardi — xom va tipli
 * so'rovlar turli joyga tushardi. Shuning uchun u qabul qilinmaydi.
 */
function isIsolatedTarget(t: DbTarget): boolean {
  return looksLikeTest(t.database);
}

function fail(reason: string, target: DbTarget | null, url: string): never {
  const where = target
    ? `${target.host}/${target.database}${target.schema !== "public" ? ` · schema=${target.schema}` : ""}`
    : url.slice(0, 40);
  throw new Error(
    [
      "",
      "╔══════════════════════════════════════════════════════════════════════╗",
      "║  TEST TO'XTATILDI — bu baza test bazasi emas                          ║",
      "╚══════════════════════════════════════════════════════════════════════╝",
      "",
      `  Nishon : ${where}`,
      `  Sabab  : ${reason}`,
      "",
      "  Integratsiya testlari real yozuv qiladi (KassaEntry, User, Payment,",
      "  LedgerEntry…). Ularni ishchi yoki prod bazasiga yo'naltirib bo'lmaydi.",
      "",
      "  TUZATISH — alohida test BAZASINI bir marta tayyorlang:",
      "",
      "      sudo -u postgres createdb -O \"$(whoami)\" asro_test   # CREATEDB huquqi kerak",
      "      npm run test:db:setup",
      "",
      "  so'ng .env.local ga qo'shing (DATABASE_URL ni O'ZGARTIRMANG):",
      "",
      '      TEST_DATABASE_URL="postgresql://<user>:<parol>@localhost:5432/asro_test?schema=public"',
      "",
    ].join("\n"),
  );
}

/**
 * DATABASE_URL ni test bazasiga yo'naltiradi va xavfsizligini tekshiradi.
 * Muvaffaqiyatli bo'lsa `process.env.DATABASE_URL` yozib qo'yiladi.
 *
 * Vaqt bo'yicha xavfsiz: `lib/prisma.ts` klientni birinchi SO'ROVDA quradi
 * (lazy Proxy), import paytida emas. `beforeAll` esa har qanday so'rovdan
 * oldin yuguradi, shuning uchun almashtirish o'z vaqtida ulguradi.
 */
function enforceTestDatabase(): void {
  const override = process.env.TEST_DATABASE_URL?.trim();
  if (override) process.env.DATABASE_URL = override;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL ham, TEST_DATABASE_URL ham yo'q — integratsiya testi bazasiz ishlay olmaydi.\n" +
        "    Tayyorlash: npm run test:db:setup",
    );
  }

  const target = parseTarget(url);
  if (!target) fail("DATABASE_URL Postgres URL sifatida o'qilmadi.", null, url);

  // ── Qat'iy taqiqlar: bu ikkisini hech qanday bayroq ochmaydi ──────────
  if (process.env.NODE_ENV === "production") {
    fail("NODE_ENV=production — testlar prod muhitida yugurmaydi.", target, url);
  }
  if (!LOCAL_HOSTS.has(target.host)) {
    fail(
      `host "${target.host}" lokal emas — bu uzoq (ehtimol prod) baza. ` +
        "ASRO_ALLOW_UNSAFE_TEST_DB bu holatda ishlamaydi.",
      target,
      url,
    );
  }

  if (isIsolatedTarget(target)) {
    verifiedTarget = target;
    return; // ✅ URL bo'yicha joyida — haqiqiy sxema quyida tekshiriladi
  }

  // ── Lokal, lekin izolyatsiyalanmagan: ataylab ruxsat berish mumkin ────
  if (process.env.ASRO_ALLOW_UNSAFE_TEST_DB === "1") {
    console.warn(
      "\n⚠️  ASRO_ALLOW_UNSAFE_TEST_DB=1 — testlar ISHCHI ma'lumot ustiga " +
        `(${target.database}, schema=${target.schema}) yozmoqda. Qoldiq qatorlar shu yerda qoladi.\n`,
    );
    return;
  }

  fail(
    `"${target.database}" test BAZASI emas (nomida "test" yo'q) — bu ishchi ma'lumot.\n` +
      "           Alohida sxema (?schema=…) yordam bermaydi: Prisma Client jadval\n" +
      '           nomlarini "public" bilan qattiq bog\'laydi, so\'rovlar baribir\n' +
      "           ishchi jadvallarga tushadi. Alohida BAZA kerak.",
    target,
    url,
  );
}

// Qo'riqchi FAQAT `test/` ostidagi integratsiya testlari uchun ishlaydi.
// `bot/**/*.spec.ts` va `lib/**/*.spec.ts` sof, DB-siz domen testlari — ular
// CI'da DATABASE_URL umuman yo'q holda yuguradi va bloklanmasligi kerak.
//
// Yo'l `expect.getState().testPath` dan olinadi. `beforeAll` ning birinchi
// argumenti vitest'da FIXTURE sifatida tahlil qilinadi (object destructuring
// talab qiladi), shuning uchun hook argumentsiz e'lon qilinadi.
//
// Yo'l aniqlanmasa qo'riqchi ISHLAYDI (fail-safe) — jimgina o'tkazib
// yuborilmaydi.
/**
 * IKKINCHI QAVAT — haqiqiy ulanishni tekshiradi.
 *
 * URL'ni o'qish yetarli emas: `?schema=` ni driver adapter o'zi qo'llamaydi,
 * shuning uchun "izolyatsiyalangan sxemaga ulandim" degan xulosa yolg'on
 * bo'lishi mumkin edi (aynan shu tutildi — `lib/prisma.ts` `poolOptionsFor`
 * shuning uchun yozildi). Bu yerda bazaning O'ZIDAN so'raymiz.
 */
async function verifyRuntimeSchema(): Promise<void> {
  if (runtimeChecked || !verifiedTarget) return;
  runtimeChecked = true;

  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.$queryRaw<{ db: string; schema: string }[]>`
    SELECT current_database() AS db, current_schema() AS schema`;
  const actual = rows[0];

  if (!looksLikeTest(actual.db) && process.env.ASRO_ALLOW_UNSAFE_TEST_DB !== "1") {
    throw new Error(
      `\n  TEST TO'XTATILDI — HAQIQIY ulanish izolyatsiyalanmagan.\n\n` +
        `  URL va'da qilgani : ${verifiedTarget.database}\n` +
        `  Baza aytayotgani  : ${actual.db} · schema=${actual.schema}\n\n` +
        `  So'rovlar ISHCHI bazaga tushmoqda.\n`,
    );
  }

  console.log(`\n  🔒 test nishoni (bazadan tasdiqlangan): ${actual.db} · schema=${actual.schema}\n`);
}

beforeAll(async () => {
  const filepath = expect.getState().testPath;
  const isDomainSpec = filepath !== undefined && !filepath.includes(INTEGRATION_DIR);
  if (isDomainSpec) return;
  enforceTestDatabase();
  await verifyRuntimeSchema();
});
