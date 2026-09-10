/**
 * SVERKA — 17 ta moliyaviy invariantni TERMINALDAN yurgizish.
 *
 *   npx tsx scripts/reconcile.ts
 *   npx tsx scripts/reconcile.ts --json
 *
 * NEGA KERAK. `lib/reconciliation.ts` allaqachon barcha tekshiruvlarni
 * bajaradi, lekin unga yagona kirish nuqtasi EKRAN edi
 * (`/kassa/qarzdorlik?tab=tekshiruv` → `server/debt.ts#getReconciliation`).
 * Ya'ni holatni raqamda qayd etish, ikki sana orasidagi farqni solishtirish
 * yoki CI da tekshirish uchun brauzer ochish kerak edi.
 *
 * Bu skript HECH NARSA HISOBLAMAYDI — u faqat `runReconciliation` ni
 * chaqiradi va natijani chiqaradi. Mantiq bitta joyda qoladi, aks holda
 * ekran va terminal vaqt o'tib turli javob bera boshlardi.
 *
 * Chiqish kodi: `error` bo'lsa 1, aks holda 0 — CI da ishlatsa bo'ladi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runReconciliation, worstStatus, type ReconCheck } from "@/lib/reconciliation";

const asJson = process.argv.includes("--json");

/** Terminal belgisi — rangdan foydalanmaymiz, log faylga ham tushadi. */
const MARK: Record<ReconCheck["status"], string> = {
  ok: "✓",
  warn: "!",
  error: "✗",
};

async function main() {
  const checks = await runReconciliation(prisma);

  if (asJson) {
    // Sana bilan birga — ikki yurgizish natijasini solishtirish uchun.
    console.log(JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
  } else {
    const width = Math.max(...checks.map((c) => c.title.length));
    console.log("─".repeat(width + 60));
    console.log(`SVERKA — ${checks.length} ta invariant · ${new Date().toISOString()}`);
    console.log("─".repeat(width + 60));
    for (const c of checks) {
      console.log(`${MARK[c.status]} ${c.title.padEnd(width)}  ${c.detail}`);
      if (c.action) console.log(`  ${" ".repeat(width)}  → ${c.action}`);
    }
    console.log("─".repeat(width + 60));
    const bad = checks.filter((c) => c.status === "error").length;
    const warn = checks.filter((c) => c.status === "warn").length;
    console.log(`Xato: ${bad} · Ogohlantirish: ${warn} · Yaxshi: ${checks.length - bad - warn}`);
  }

  process.exitCode = worstStatus(checks) === "error" ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("Sverka yurgizilmadi:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
