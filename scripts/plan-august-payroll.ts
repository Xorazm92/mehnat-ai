// =====================================================
// AVGUST OYLIGI — YOZUVDAN OLDINGI TEKSHIRUV (Faza 4.2 DRY-RUN)
// =====================================================
//
// ⚠️ FAQAT O'QISH. `--apply` bayrog'i ATAYLAB YO'Q — va bo'lmaydi ham.
//
// NEGA YOZMAYDI. Oylik yozish yo'li `server/payroll.ts` va
// `server/payouts.ts` da, ular esa `"use server"` + `auth()`: skriptdan
// chaqirib bo'lmaydi. Mantiqni bu yerga NUSXALASH mumkin emas — u davr
// qulfi, balans yetarliligi, majburiyat qoldig'i va ortiqcha to'lov
// to'sig'ini bitta `Serializable` tranzaksiyada bajaradi. Ikkinchi nusxa
// moliyaviy yozuvda ikkinchi haqiqat degani.
//
// Shu sababdan bu skript YOZMAYDI, TEKSHIRADI: Excel'dagi 26 xodimni
// bazaga solishtiradi va yozuvni to'xtatib qo'yadigan har bir to'siqni
// OLDINDAN ko'rsatadi. Ish o'zi `/payroll` ekranidan bajariladi.
//
// ── HAL QILINMAGAN XAVF (rejada yo'q edi) ─────────────────────────────
//
// Reja "approveEmployeeSalary → PayrollAdjustment (jami 331 361 750)" deb
// yozadi. Ammo `approveEmployeeSalary` SUMMA QABUL QILMAYDI: u summani
// `computeEmployeeSalary()` orqali TIZIMNING O'ZI hisoblaydi (biriktiruv,
// hisobotlar, KPI, tuzatmalar). Ya'ni tasdiqlangandan keyin majburiyat
// Excel'dagi raqam emas, TIZIM raqami bo'ladi.
//
// Agar ular farq qilsa, keyingi qadam ham yiqiladi: `createPayout`
// "Ortiqcha to'lov bloklandi" deb rad etadi, chunki to'lov majburiyat
// qoldig'idan oshib ketadi. Bu farqni skript o'lchay olmaydi —
// `computeEmployeeSalary` eksport qilinmagan va `"use server"` faylda.
// Shuning uchun TARTIB shunday bo'lishi kerak:
//
//   1. `/payroll` ekranidagi QORALAMA summalarini Excel bilan solishtiring;
//   2. farq bo'lsa — avval sababini toping (biriktiruv? KPI? tuzatma?);
//   3. faqat mos kelganda tasdiqlang.
//
// ISHLATISH:
//   npx tsx scripts/plan-august-payroll.ts
//   npx tsx scripts/plan-august-payroll.ts --month=2026-08 --json

import "./load-env";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { getAvailableBalance } from "@/lib/balance";
import { assertPeriodOpen } from "@/lib/periodLock";
import { formatNum as som } from "@/lib/platform/format";
import { nameCandidates, scoreMatch } from "@/lib/nameMatch";

const DEFAULT_FILE = "kassa/Фирмалар 31.08.2026.md";
const DEFAULT_MONTH = "2026-08";

/** Xodimlar jadvali — ma'lumot qatorlari (1-indeksli fayl qatori). */
const FIRST_ROW = 227;
const LAST_ROW = 252;

/**
 * Qo'riqchilar — fayl 254-qatoridagi "Xammasi" satridan.
 *
 * Bularsiz noto'g'ri oraliq JIM o'tib ketardi: yuqorida (5–220) FIRMALAR
 * jadvali turibdi va u ham raqamlangan, ya'ni "№ bor qator" bo'yicha o'qish
 * 216 ta firmani xodim deb sanardi.
 */
const EXPECTED = {
  rows: 26,
  jami: 331_361_750,
  avans: 63_300_000,
  naqd: 0,
  plastik: 158_534_750,
  raschet: 109_527_000,
};

/** Ustun indekslari (0-indeksli, `|` bo'yicha bo'lingandan keyin). */
const COL = { name: 1, oylik: 2, qosh: 3, kpi: 4, jami: 5, avans: 6, naqd: 7, plastik: 8, raschet: 9 };

interface ExcelEmployee {
  line: number;
  name: string;
  oylik: number;
  qosh: number;
  kpi: number;
  jami: number;
  avans: number;
  naqd: number;
  plastik: number;
  raschet: number;
}

function parseAmount(raw: string): number {
  const s = raw.replace(/[\s ,]/g, "");
  if (s === "" || s === "-" || s === "—") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Summani o'qib bo'lmadi: "${raw}"`);
  return n;
}

function parseExcel(file: string): ExcelEmployee[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const out: ExcelEmployee[] = [];

  for (let line = FIRST_ROW; line <= LAST_ROW; line++) {
    const raw = lines[line - 1];
    if (raw === undefined) throw new Error(`${file}: ${line}-qator yo'q`);
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < COL.raschet + 1) {
      throw new Error(`${file}:${line} — ${cells.length} katak, kamida ${COL.raschet + 1} kutilgan`);
    }
    const e: ExcelEmployee = {
      line,
      name: cells[COL.name],
      oylik: parseAmount(cells[COL.oylik]),
      qosh: parseAmount(cells[COL.qosh]),
      kpi: parseAmount(cells[COL.kpi]),
      jami: parseAmount(cells[COL.jami]),
      avans: parseAmount(cells[COL.avans]),
      naqd: parseAmount(cells[COL.naqd]),
      plastik: parseAmount(cells[COL.plastik]),
      raschet: parseAmount(cells[COL.raschet]),
    };
    out.push(e);
  }

  if (out.length !== EXPECTED.rows) {
    throw new Error(`Kutilgan ${EXPECTED.rows} xodim, o'qilgani ${out.length}`);
  }
  const sum = (k: keyof typeof EXPECTED) =>
    out.reduce((s, e) => s + (e[k as keyof ExcelEmployee] as number), 0);
  for (const k of ["jami", "avans", "naqd", "plastik", "raschet"] as const) {
    if (Math.round(sum(k)) !== EXPECTED[k]) {
      throw new Error(
        `"${k}" jami mos emas: o'qilgani ${som(sum(k))}, kutilgani ${som(EXPECTED[k])} — ` +
          `ustun indeksi yoki qator oralig'i o'zgargan, natija ishonchsiz`
      );
    }
  }
  return out;
}

interface Finding {
  name: string;
  jami: number;
  userId: string | null;
  userName: string | null;
  channels: { id: string; label: string; type: string }[];
  /**
   * Nomi xodimga mos keladigan, lekin `employeeId` BELGILANMAGAN kanallar.
   *
   * Ataylab "manba yo'q" dan ajratilgan: tuzatish butunlay boshqa. Kanal
   * mavjud — uni xodimga bog'lash kerak, yangisini yaratish emas. Prodda
   * 52 kanaldan 23 tasidagina ega ko'rsatilgan.
   */
  unlinkedChannels: { id: string; label: string; type: string }[];
  alreadyApproved: boolean;
  problems: string[];
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const month = args.find((a) => a.startsWith("--month="))?.slice("--month=".length) ?? DEFAULT_MONTH;
  const file = args.find((a) => a.startsWith("--file="))?.slice("--file=".length) ?? DEFAULT_FILE;

  const excel = parseExcel(file);

  // ── DAVR QULFI ────────────────────────────────────────────────────────
  // Yopiq davrga oylik yozib bo'lmaydi; buni 26 marta urinib bilishdan
  // ko'ra bir marta oldindan aytgan ma'qul.
  let periodProblem: string | null = null;
  try {
    await assertPeriodOpen(prisma, month, "oylik tasdig'i");
  } catch (e) {
    periodProblem = e instanceof Error ? e.message : String(e);
  }

  const [users, channels, approved, balance] = await Promise.all([
    prisma.user.findMany({ where: { firedAt: null }, select: { id: true, fullName: true } }),
    prisma.disbursementChannel.findMany({
      select: { id: true, label: true, type: true, employeeId: true },
    }),
    prisma.payrollAdjustment.findMany({
      where: {
        month: { in: [month, `${month}-01`] },
        adjustmentType: "payment",
        deletedAt: null,
      },
      select: { employeeId: true },
    }),
    getAvailableBalance(),
  ]);

  const approvedIds = new Set(approved.map((a) => a.employeeId));
  const channelsBy = new Map<string, typeof channels>();
  for (const c of channels) {
    if (!c.employeeId) continue;
    const list = channelsBy.get(c.employeeId) ?? [];
    list.push(c);
    channelsBy.set(c.employeeId, list);
  }

  const findings: Finding[] = excel.map((e) => {
    const problems: string[] = [];

    // ── ISM MOSLASHTIRISH ──────────────────────────────────────────────
    //
    // TAXMINIY: Excel'da qisqa ism ("Adxam"), bazada to'liq F.I.Sh. Shuning
    // uchun BARCHA mosliklar yig'iladi, birinchisi olinmaydi: prodda "Adxam"
    // ikkita User qatoriga mos keladi ("Adxam" va "Adham" — dublikat yozuv).
    // Jim tanlash oylikni NOTO'G'RI odamga yozib qo'yishi mumkin edi.
    let match: { id: string; fullName: string } | null = null;
    if (e.name) {
      const exact = users.filter(
        (u) => scoreMatch(nameCandidates(u.fullName), e.name).tier === "exact"
      );
      const near = users.filter(
        (u) => scoreMatch(nameCandidates(u.fullName), e.name).tier === "near"
      );
      const hits = exact.length > 0 ? exact : near;
      if (hits.length === 1) {
        match = hits[0];
      } else if (hits.length > 1) {
        problems.push(
          `"${e.name}" bir nechta xodimga mos keldi (${hits.map((h) => h.fullName).join(" · ")}) — ` +
            `qaysi biri ekanini qo'lda tanlang`
        );
      }
    } else {
      problems.push("Excel'da ism bo'sh");
    }
    if (e.name && !match && problems.length === 0) {
      problems.push(`ASROda "${e.name}" nomli faol xodim topilmadi`);
    }

    const chans = match ? channelsBy.get(match.id) ?? [] : [];

    // Kanal bog'lanmagan bo'lsa ham NOMI bo'yicha topilishi mumkin.
    const unlinked =
      chans.length === 0 && e.name
        ? channels.filter((c) => {
            if (c.employeeId) return false;
            const tier = scoreMatch(nameCandidates(c.label), e.name).tier;
            return tier === "exact" || tier === "near";
          })
        : [];

    // `createPayout` va `createAvansPayout` `channelId` ni MAJBURIY qiladi:
    // manbasiz to'lov balansdan chiqib ketardi-yu, qaysi kassa kamayganini
    // aytib bo'lmasdi.
    if (match && chans.length === 0 && e.jami > 0) {
      problems.push(
        unlinked.length > 0
          ? `Kanal BOR, lekin egasi belgilanmagan: ${unlinked.map((c) => c.label).join(" · ")} — ` +
            `avval uni xodimga bog'lang (yangisini yaratmang)`
          : "Pul manbai (DisbursementChannel) yo'q — to'lov yozib bo'lmaydi"
      );
    }
    if (match && approvedIds.has(match.id)) {
      problems.push(`${month} uchun oylik ALLAQACHON tasdiqlangan — qayta tasdiqlash rad etiladi`);
    }

    const payTotal = e.avans + e.naqd + e.plastik + e.raschet;
    if (Math.round(payTotal) !== Math.round(e.jami)) {
      problems.push(`To'lovlar yig'indisi ${som(payTotal)} ≠ jami ${som(e.jami)}`);
    }
    const calc = e.oylik + e.qosh + e.kpi;
    if (Math.round(calc) !== Math.round(e.jami)) {
      problems.push(`Oylik+qo'shimcha+KPI = ${som(calc)} ≠ jami ${som(e.jami)}`);
    }

    return {
      name: e.name || `(${e.line}-qator, nomsiz)`,
      jami: e.jami,
      userId: match?.id ?? null,
      userName: match?.fullName ?? null,
      channels: chans.map((c) => ({ id: c.id, label: c.label, type: c.type })),
      unlinkedChannels: unlinked.map((c) => ({ id: c.id, label: c.label, type: c.type })),
      alreadyApproved: match ? approvedIds.has(match.id) : false,
      problems,
    };
  });

  const totalOut = excel.reduce((s, e) => s + e.jami, 0);

  if (asJson) {
    console.log(JSON.stringify({ month, totalOut, balance: balance.balance, periodProblem, findings }, null, 2));
    return;
  }

  console.log("═".repeat(70));
  console.log(`AVGUST OYLIGI — YOZUVDAN OLDINGI TEKSHIRUV  (${month}, faqat o'qish)`);
  console.log("═".repeat(70));
  console.log(`Excel   : ${excel.length} xodim · jami ${som(totalOut)} so'm`);
  console.log(`  avans ${som(EXPECTED.avans)} · naqd ${som(EXPECTED.naqd)} · plastik ${som(EXPECTED.plastik)} · raschet ${som(EXPECTED.raschet)}`);
  console.log(`Balans  : ${som(balance.balance)} so'm`);
  const linked = channels.filter((c) => c.employeeId).length;
  console.log(`Kanallar: ${channels.length} ta · egasi belgilangani ${linked} ta`);

  // Balans yetarliligini `assertSufficientFunds` har to'lovda tekshiradi;
  // bu yerda JAMI bo'yicha oldindan ogohlantiramiz.
  if (balance.balance < totalOut) {
    console.log(
      `\n⚠ BALANS YETMAYDI: ${som(totalOut - balance.balance)} so'm kam. ` +
        `To'lovlar yarim yo'lda "mablag' yetarli emas" bilan to'xtaydi.`
    );
  }
  if (periodProblem) {
    console.log(`\n⚠ DAVR QULFI: ${periodProblem}`);
  }

  const blocked = findings.filter((f) => f.problems.length > 0);
  console.log();
  console.log(`── TO'SIQLAR — ${blocked.length} xodim ${"─".repeat(40)}`);
  if (blocked.length === 0) {
    console.log("   (yo'q — 26 xodimning hammasi bazada, manbasi bor, tasdiqlanmagan)");
  } else {
    for (const f of blocked) {
      const who = f.userName ? ` → ${f.userName}` : "";
      console.log(`   ${f.name.padEnd(18)} ${som(f.jami).padStart(14)}${who}`);
      for (const p of f.problems) console.log(`       • ${p}`);
    }
  }

  const ready = findings.filter((f) => f.problems.length === 0);
  console.log();
  console.log(`── ISH RO'YXATI — ${ready.length} xodim ${"─".repeat(38)}`);
  for (const f of ready) {
    const e = excel.find((x) => (x.name || "") === f.name)!;
    const parts = [
      e.avans > 0 ? `avans ${som(e.avans)}` : null,
      e.naqd > 0 ? `naqd ${som(e.naqd)}` : null,
      e.plastik > 0 ? `plastik ${som(e.plastik)}` : null,
      e.raschet > 0 ? `raschet ${som(e.raschet)}` : null,
    ].filter(Boolean);
    console.log(`   ${f.userName?.padEnd(34) ?? ""} tasdiq ${som(f.jami).padStart(14)}`);
    console.log(`       ${parts.join(" · ")}`);
    console.log(`       manba: ${f.channels.map((c) => `${c.label} [${c.type}]`).join(" · ")}`);
  }

  console.log();
  console.log("─".repeat(70));
  console.log("⚠ TASDIQLASHDAN OLDIN: `/payroll` qoralama summasi Excel bilan mos kelishini");
  console.log("  tekshiring. `approveEmployeeSalary` summani QABUL QILMAYDI — uni tizim");
  console.log("  o'zi hisoblaydi. Farq bo'lsa to'lov \"Ortiqcha to'lov bloklandi\" bilan rad etiladi.");
  console.log();
  console.log("Bu skript hech narsani o'zgartirmaydi — yozuv /payroll ekranidan bajariladi.");
}

main()
  .catch((e) => {
    console.error("XATO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
