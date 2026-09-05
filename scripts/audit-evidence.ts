/**
 * DALIL YAXLITLIGI AUDITI — eski va yangi yozuv ajralib ketmaganmi.
 *
 *   npm run audit:evidence
 *   npm run audit:evidence -- --json
 *
 * NEGA BU SKRIPT BOR. `server/proofs.ts` dalilni ikki joyga yozadi:
 * `ReportProof` (eski) va `ObligationSubmission` + `SubmissionEvidence`
 * (yangi). Ikkinchisiga o'tkazuvchi bo'g'in — `applyObligationStatus` —
 * uch sababdan yiqilishi mumkin va yiqilganda dalil oqimini TO'XTATMAYDI.
 * Ya'ni ikki manba jimgina ajralib ketishi MUMKIN.
 *
 * `MonthlyReport`/`Task` ni `Obligation` ga birlashtirish (3-to'lqin,
 * `docs/plan/OBLIGATION_UNIFICATION_PLAN.md`) eski yozuvni o'chirishdan
 * BOSHLANMAYDI — u shu o'lchovdan boshlanadi. Ko'chirishdan oldin bu
 * skript toza chiqishi shart.
 *
 * Chiqish kodi: `error` darajali nomuvofiqlik bo'lsa 1, aks holda 0 —
 * CI da yoki deploy oldidan ishlatsa bo'ladi. `warn` chiqish kodini
 * o'zgartirmaydi (ma'lumot buzilmagan, lekin e'tibor talab qiladi).
 *
 * FAQAT O'QIYDI. Hech narsani tuzatmaydi va o'chirmaydi: qaysi tomon haq
 * ekanini kod bilmaydi, avtomatik tenglashtirish esa dalil tarixini jim
 * ravishda buzardi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runEvidenceConsistency } from "@/lib/evidenceConsistency";

const asJson = process.argv.includes("--json");

const MARK = { ok: "✓", warn: "!", error: "✗" } as const;

async function main() {
  const checks = await prisma.$transaction(async (tx) => runEvidenceConsistency(tx), {
    timeout: 60_000,
  });

  if (asJson) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    console.log("\nDALIL YAXLITLIGI — ReportProof ↔ ObligationSubmission/SubmissionEvidence\n");
    for (const c of checks) {
      console.log(`${MARK[c.status]} ${c.title}`);
      console.log(`   ${c.detail}`);
      if (c.action) console.log(`   → ${c.action}`);
      console.log("");
    }
  }

  const errors = checks.filter((c) => c.status === "error");
  const warns = checks.filter((c) => c.status === "warn");

  if (!asJson) {
    if (errors.length === 0 && warns.length === 0) {
      console.log("Natija: ikki manba mos. 3-to'lqin ko'chirishi uchun yo'l ochiq.\n");
    } else {
      console.log(
        `Natija: ${errors.length} ta xato, ${warns.length} ta ogohlantirish. ` +
          "Ko'chirishdan OLDIN yopilishi kerak.\n",
      );
    }
  }

  await prisma.$disconnect();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("audit:evidence yiqildi:", e);
  await prisma.$disconnect();
  process.exit(1);
});
