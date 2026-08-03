/**
 * MINI APP SMOKE TEST — telefonsiz tekshirish
 * ==========================================
 * "Dalil yuklash" va "Dashboard" tugmalari ishlayaptimi? Buni odatda faqat
 * Telegramda tugmani bosib bilish mumkin edi, ya'ni har deploydan keyin qo'lda.
 * Bu skript o'sha yo'lni to'liq takrorlaydi:
 *
 *   imzolangan initData → NextAuth "telegram" provider → sessiya cookie →
 *   /telegram-app/dashboard va /telegram-app/proof
 *
 * Ishonchli bo'lishi uchun SERVERDA ishlaydi: `TELEGRAM_BOT_TOKEN` imzo uchun
 * kerak va u hech qayerga uzatilmaydi.
 *
 * Nimani tutadi (haqiqiy nosozliklar tarixi):
 *   - `X-Frame-Options` Mini App'ni Telegram freymida BO'SH qoldirishi
 *     (sahifa 200 qaytaradi, lekin brauzer ko'rsatmaydi);
 *   - handshake sessiya qo'ya olmasligi (bog'lanmagan xodim, imzo, muddat);
 *   - himoyalangan ekranning /telegram-app ga qaytib halqa hosil qilishi.
 *
 * ISHLATISH (serverda):
 *   npx tsx scripts/smoke-telegram-app.ts
 *   npx tsx scripts/smoke-telegram-app.ts --base=https://asro.uz
 */
import "./load-env";
import { signInitDataForTest } from "@/lib/telegramInitData";
import { prisma } from "@/lib/prisma";

const DEFAULT_BASE = "http://127.0.0.1:3000";
const SCREENS = ["/telegram-app/dashboard", "/telegram-app/proof"];

type Level = "error" | "warn";
const problems: Array<{ level: Level; msg: string }> = [];
const err = (msg: string) => problems.push({ level: "error", msg });
const warn = (msg: string) => problems.push({ level: "warn", msg });

/** Oddiy cookie idishi — Set-Cookie'larni yig'ib keyingi so'rovda qaytaradi. */
class Jar {
  private jar = new Map<string, string>();
  absorb(res: Response): void {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(sub: string): boolean {
    return [...this.jar.keys()].some((k) => k.includes(sub));
  }
}

async function main(): Promise<void> {
  const baseArg = process.argv.find((a) => a.startsWith("--base="));
  const base = (baseArg ? baseArg.split("=")[1] : DEFAULT_BASE).replace(/\/$/, "");

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("✗ TELEGRAM_BOT_TOKEN yo'q — initData imzolab bo'lmaydi.");
    process.exit(1);
  }

  const who = await prisma.user.findFirst({
    where: { telegramUserId: { not: null }, isActive: true },
    select: { fullName: true, role: true, telegramUserId: true },
  });
  if (!who?.telegramUserId) {
    console.error(
      "✗ Telegramga bog'langan faol xodim yo'q — Mini App'ga kiradigan hisob yo'q.\n" +
        "    Avval botda /start bosib telefon raqamini yuboring.",
    );
    process.exit(1);
  }

  console.log(`\n📱 MINI APP SMOKE TEST (${base})`);
  console.log(`   hisob: ${who.fullName} [${who.role}]\n`);

  // ── 1) Freymlash sarlavhasi ────────────────────────────────────
  // Eng jimgina nosozlik: sahifa 200 qaytaradi, lekin Telegram freymida
  // brauzer uni ko'rsatishdan bosh tortadi va foydalanuvchi BO'SH oyna ko'radi.
  const head = await fetch(`${base}/telegram-app`, { redirect: "manual" });
  const xfo = head.headers.get("x-frame-options");
  const csp = head.headers.get("content-security-policy") ?? "";
  if (xfo) {
    err(
      `/telegram-app "X-Frame-Options: ${xfo}" qaytarmoqda — Telegram freymida\n` +
        "    oyna BO'SH ochiladi. Bu yo'lda XFO umuman bo'lmasligi kerak (next.config.ts).",
    );
  } else if (!csp.includes("frame-ancestors")) {
    warn("/telegram-app da `frame-ancestors` yo'q — freymlash cheklanmagan.");
  } else {
    console.log(`  ✓ freymlash: XFO yo'q, ${csp.trim()}`);
  }

  // ── 2) Handshake: initData → sessiya ───────────────────────────
  const initData = signInitDataForTest(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "SMOKE",
      user: JSON.stringify({ id: Number(who.telegramUserId), first_name: "Smoke", username: "smoke" }),
    },
    process.env.TELEGRAM_BOT_TOKEN,
  );

  const jar = new Jar();
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) {
    err("CSRF token olinmadi — NextAuth javob bermayapti.");
  }

  const loginRes = await fetch(`${base}/api/auth/callback/telegram`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ initData, csrfToken: csrfToken ?? "", json: "true" }),
  });
  jar.absorb(loginRes);
  if (!jar.has("session-token")) {
    err(
      `Kirish sessiya qo'ymadi (HTTP ${loginRes.status}).\n` +
        "    Sabablari: xodim bog'lanmagan, imzo noto'g'ri yoki TELEGRAM_BOT_TOKEN mos emas.",
    );
  } else {
    console.log(`  ✓ handshake: sessiya cookie o'rnatildi`);
  }

  // ── 3) Ekranlar ────────────────────────────────────────────────
  for (const path of SCREENS) {
    const res = await fetch(`${base}${path}`, { headers: { cookie: jar.header() }, redirect: "manual" });
    if (res.status === 307 || res.status === 302) {
      err(`${path} → ${res.status} ${res.headers.get("location")} — sessiya qabul qilinmadi (halqa).`);
      continue;
    }
    if (res.status !== 200) {
      err(`${path} → HTTP ${res.status}.`);
      continue;
    }
    const body = await res.text();
    // Bo'sh qobiq ham 200 qaytaradi — shuning uchun mazmun tekshiriladi.
    if (!/<div class="tg-(stat|h1|field|list)/.test(body)) {
      err(`${path} → 200, lekin ichida Mini App UI bloklari yo'q (bo'sh sahifa).`);
      continue;
    }
    console.log(`  ✓ ${path}: 200, ${(body.length / 1024).toFixed(1)}KB`);
  }

  await prisma.$disconnect();

  const errors = problems.filter((p) => p.level === "error");
  for (const w of problems.filter((p) => p.level === "warn")) console.warn(`⚠ ${w.msg}`);
  for (const e of errors) console.error(`✗ ${e.msg}`);
  if (errors.length > 0) {
    console.error(`\n✗ MINI APP ISHLAMAYDI — ${errors.length} ta xato.`);
    process.exit(1);
  }
  console.log("\n✓ MINI APP OK — tugmalar Telegramda ochiladi.");
}

main().catch((e) => {
  console.error("✗ smoke-telegram-app crashed:", e?.message ?? e);
  process.exit(1);
});
