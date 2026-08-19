// =====================================================
// TELEGRAM MINI APP — initData tekshiruvi (Faza 4)
// =====================================================
// Telegram Mini App ochilganda `window.Telegram.WebApp.initData` beradi — bu
// imzolangan query-string. Uni tekshirish MAJBURIY: aks holda istalgan odam
// `user.id` ni o'zi yozib yuborishi va boshqa xodim nomidan kirishi mumkin edi.
//
// Algoritm (Telegram hujjati):
//   secret_key       = HMAC_SHA256(key="WebAppData", msg=<bot_token>)
//   data_check_string = kalitlar bo'yicha saralangan "k=v" juftliklari, "\n" bilan
//   hash             = HMAC_SHA256(key=secret_key, msg=data_check_string)
//
// Sof va framework-free: faqat node:crypto. Shuning uchun `.spec.ts` bilan
// to'liq qoplanadi va NextAuth provider'i uni shundoq chaqiradi.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * initData qancha vaqt yaroqli. Telegram `auth_date` ni Mini App ochilganda
 * qo'yadi va uni yangilamaydi, shuning uchun oyna uzoq ochiq tursa qayta kirish
 * kerak bo'ladi — bu ataylab: o'g'irlangan initData abadiy kalitga aylanmasin.
 */
export const INIT_DATA_MAX_AGE_MS = 15 * 60_000;

export type InitDataFailure =
  | "empty"
  | "missing_hash"
  | "bad_signature"
  | "expired"
  | "missing_user"
  | "no_token";

export type InitDataResult =
  | {
      ok: true;
      telegramUserId: bigint;
      username?: string;
      firstName?: string;
      authDate: Date;
    }
  | { ok: false; reason: InitDataFailure };

/** Telegramning `user` maydonidan bizga kerak bo'ladigan qismi. */
interface RawWebAppUser {
  id?: number;
  username?: string;
  first_name?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false; // hex bo'lmagan kirish
  }
}

/**
 * initData ni tekshiradi va Telegram foydalanuvchi id'sini qaytaradi.
 * Hech qachon throw qilmaydi — har rad etish sababi bilan qaytadi, shunda
 * chaqiruvchi log yozadi, lekin foydalanuvchiga tafsilot oshkor qilmaydi.
 */
export function verifyInitData(
  initData: string | null | undefined,
  botToken: string,
  now: Date = new Date(),
  maxAgeMs: number = INIT_DATA_MAX_AGE_MS,
): InitDataResult {
  if (!botToken) return { ok: false, reason: "no_token" };
  if (!initData) return { ok: false, reason: "empty" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };

  // `hash` ning o'zi hech qachon tekshiruv satriga kirmaydi.
  //
  // `signature` esa — IKKI XIL TALQIN. Bot API 7.10 dan beri Telegram
  // initData'ga o'zining Ed25519 imzosini (`signature`) ham qo'shadi. Uchinchi
  // tomon tekshiruvida u albatta chiqariladi; bot tokeni bilan HMAC
  // tekshiruvida esa Telegramning o'z hujjati "faqat hash chiqariladi" deydi
  // va mijozlar amalda ham shunday hisoblaydi.
  //
  // Bu farq prod'da qimmatga tushdi: testda `signature` maydoni yo'q edi,
  // shuning uchun uni chiqarib tashlash to'g'ri ko'rinardi va butun Mini App
  // haqiqiy Telegram'da "imzo mos emas" deb rad etardi — token joyida bo'lsa
  // ham. Shuning uchun IKKALA variant ham hisoblanadi va biri mos kelsa
  // yetarli.
  //
  // Bu xavfsizlikni pasaytirmaydi: ikkala satr ham AYNI shu ma'lumot ustidan,
  // AYNI bot tokeni bilan imzolangan. Kalitni bilmagan odam ikkalasidan ham
  // birortasini yasay olmaydi.
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const matches = (excludeSignature: boolean): boolean => {
    const pairs: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key === "hash") continue;
      if (excludeSignature && key === "signature") continue;
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const expected = createHmac("sha256", secretKey).update(pairs.join("\n")).digest("hex");
    return safeEqualHex(hash, expected);
  };
  if (!matches(false) && !matches(true)) return { ok: false, reason: "bad_signature" };

  const authDateRaw = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateRaw)) return { ok: false, reason: "expired" };
  const authDate = new Date(authDateRaw * 1000);
  if (now.getTime() - authDate.getTime() > maxAgeMs) return { ok: false, reason: "expired" };

  let user: RawWebAppUser;
  try {
    user = JSON.parse(params.get("user") ?? "{}") as RawWebAppUser;
  } catch {
    return { ok: false, reason: "missing_user" };
  }
  if (typeof user.id !== "number" || !Number.isFinite(user.id)) {
    return { ok: false, reason: "missing_user" };
  }

  return {
    ok: true,
    telegramUserId: BigInt(user.id),
    username: user.username,
    firstName: user.first_name,
    authDate,
  };
}

/**
 * Test va lokal ishlab chiqish uchun to'g'ri imzolangan initData yasaydi.
 * Ishlab chiqarish kodida ISHLATILMAYDI — u yerda initData faqat Telegramdan
 * keladi; bu yerda esa tekshiruvni haqiqiy imzo bilan sinash imkonini beradi.
 */
export function signInitDataForTest(
  fields: Record<string, string>,
  botToken: string,
): string {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(pairs.join("\n")).digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}
