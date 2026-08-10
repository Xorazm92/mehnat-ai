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
}

/**
 * Postgres URL'dan host va baza nomini ajratadi. Parol ataylab olinmaydi — bu
 * qiymat xato matniga tushadi va terminal tarixida qoladi.
 */
function parseTarget(url: string): DbTarget | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, database: u.pathname.replace(/^\//, "") };
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Nomida `test` bo'lgan bazani test bazasi deb hisoblaymiz (asro_test, test_asro, asro-test). */
function looksLikeTestDb(database: string): boolean {
  return /(^|[_-])test([_-]|$)/i.test(database);
}

function fail(reason: string, target: DbTarget | null, url: string): never {
  const where = target ? `${target.host}/${target.database}` : url.slice(0, 40);
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
      "  TUZATISH — test bazasini bir marta tayyorlang:",
      "",
      "      npm run test:db:setup",
      "",
      "  so'ng .env.local ga qo'shing:",
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

  if (looksLikeTestDb(target.database)) return; // ✅ hammasi joyida

  // ── Lokal, lekin test bazasi emas: ataylab ruxsat berish mumkin ───────
  if (process.env.ASRO_ALLOW_UNSAFE_TEST_DB === "1") {
    console.warn(
      "\n⚠️  ASRO_ALLOW_UNSAFE_TEST_DB=1 — testlar ISHCHI bazaga " +
        `(${target.database}) yozmoqda. Qoldiq qatorlar shu yerda qoladi.\n`,
    );
    return;
  }

  fail(
    `"${target.database}" test bazasi emas (nomida "test" yo'q) — bu ishchi baza.`,
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
beforeAll(() => {
  const filepath = expect.getState().testPath;
  const isDomainSpec = filepath !== undefined && !filepath.includes(INTEGRATION_DIR);
  if (isDomainSpec) return;
  enforceTestDatabase();
});
