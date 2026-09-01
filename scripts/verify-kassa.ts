/**
 * KASSA VA BANK RECONCILIATION — AVTOMATIK NAZORAT.
 *
 *   npx tsx scripts/verify-kassa.ts
 *   npx tsx scripts/verify-kassa.ts --month=2026-08
 *
 * 2026-09-01 auditi beshta nazoratni QO'LDA o'tkazdi va hammasi o'tdi. Qo'lda
 * o'tkazilgan nazorat bir marta ishlaydi — keyingi import yana jimgina kam
 * ma'lumot yozsa (avval aynan shunday bo'lgan: 109 mln kirim va 169 mln
 * chiqim yo'qolgan, va buni hech narsa ushlamagan), buni hech kim sezmaydi.
 *
 * Shu sababdan nazorat kodga ko'chirildi. Har tekshiruv MUSTAQIL qayta
 * hisoblanadi — saqlangan "jami" qiymatga ishonilmaydi (auditning eng katta
 * topilmasi aynan qo'lda yozilgan "Total" edi: 41 907 250 so'm kam).
 *
 * Chiqish kodi: hammasi o'tsa 0, biror nazorat yiqilsa 1 — CI da ishlatsa
 * bo'ladi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";

const month = process.argv.find((a) => a.startsWith("--month="))?.slice(8) ?? "2026-08";
const from = new Date(`${month}-01T00:00:00.000Z`);
const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });
const near = (a: number, b: number) => Math.abs(a - b) < 1;

/**
 * Tekshirilayotgan OY uchun har hisobning vipiska ko'rsatkichlari.
 *
 * `BankStatementImport` — har YUKLASHNING izi, shuning uchun bitta hisobda
 * bitta oyga bir nechta qator bo'lishi normal va prodda shunday: to'liq
 * 01–28 vipiskasi yonida qisman 01–18 va 19–24 yuklamalari turibdi.
 *
 * Shu sababdan "eng oxirgi yuklama" NOTO'G'RI tanlov: MOLIYA AI'da bir kunlik
 * 23–23 vipiskasi eng oxirgi bo'lib, uning yopilish qoldig'i (813 653,58)
 * butun oyning tranzaksiyalari bilan solishtirilardi va nazorat yolg'ondan
 * qizil chiqardi.
 *
 * To'g'ri qoida: ochilish — oydagi ENG ERTA boshlangan vipiskadan, yopilish
 * esa davri ENG UZOQQA cho'zilgan (va yopilish qoldig'i e'lon qilingan)
 * vipiskadan. Tranzaksiyalar o'sha oxirgi kungacha yig'iladi.
 */
async function monthStatements() {
  const accounts = await prisma.bankAccount.findMany({ select: { id: true, label: true } });
  const out: {
    accountId: string;
    label: string;
    opening: number;
    closing: number | null;
    periodFrom: Date;
    periodTo: Date;
  }[] = [];

  for (const a of accounts) {
    const overlapping = await prisma.bankStatementImport.findMany({
      where: { accountId: a.id, periodFrom: { lt: to }, periodTo: { gte: from } },
      orderBy: [{ periodFrom: "asc" }, { createdAt: "asc" }],
      select: { openingBalance: true, closingBalance: true, periodFrom: true, periodTo: true },
    });
    const first = overlapping.find((i) => i.openingBalance != null);
    if (!first) continue;

    const closers = overlapping.filter((i) => i.closingBalance != null);
    const last = closers.length
      ? closers.reduce((a, b) => (b.periodTo > a.periodTo ? b : a))
      : null;

    out.push({
      accountId: a.id,
      label: a.label,
      opening: Number(first.openingBalance),
      closing: last ? Number(last.closingBalance) : null,
      periodFrom: first.periodFrom,
      periodTo: last?.periodTo ?? first.periodTo,
    });
  }
  return out;
}

/** 1. Har vipiska o'zida yopiladi: ochilish + kredit − debet = yopilish. */
async function checkStatements(): Promise<void> {
  const statements = await monthStatements();
  const bad: string[] = [];
  let checked = 0;

  for (const s of statements) {
    if (s.closing == null) continue;
    checked++;
    // Davr chegarasi ochiq: bank oxirgi kunning operatsiyasini o'sha kunga
    // yozadi, shuning uchun `periodTo` KUNI ham kiradi.
    const sums = await prisma.bankTransaction.groupBy({
      by: ["direction"],
      where: {
        accountId: s.accountId,
        valueDate: {
          gte: s.periodFrom,
          lt: new Date(s.periodTo.getTime() + 86_400_000),
        },
      },
      _sum: { amount: true },
    });
    const dir = (d: string) => Number(sums.find((x) => x.direction === d)?._sum.amount ?? 0);
    const got = s.opening + dir("income") - dir("expense");
    if (!near(got, s.closing)) {
      bad.push(`${s.label}: hisoblangan ${som(got)}, bank aytgan ${som(s.closing)}`);
    }
  }

  check(
    "Vipiskalar o'zida yopiladi",
    bad.length === 0 && checked === statements.length,
    bad.length
      ? bad.join("; ")
      : `${checked}/${statements.length} hisob — farq 0,00` +
        (checked < statements.length ? " (qolganida yopilish qoldig'i yo'q)" : "")
  );
}

/** 2. Har kassa (shaxs) balansi: kirim − chiqim = qoldiq, manfiy bo'lmasin. */
async function checkRegisters(): Promise<void> {
  const rows = await prisma.transitEntry.groupBy({
    by: ["channelId", "direction"],
    where: { date: { gte: from, lt: to } },
    _sum: { amount: true },
  });

  const byChannel = new Map<string, { in: number; out: number }>();
  for (const r of rows) {
    const e = byChannel.get(r.channelId) ?? { in: 0, out: 0 };
    e[r.direction === "in" ? "in" : "out"] += Number(r._sum.amount ?? 0);
    byChannel.set(r.channelId, e);
  }

  const labels = new Map(
    (
      await prisma.disbursementChannel.findMany({
        where: { id: { in: [...byChannel.keys()] } },
        select: { id: true, label: true },
      })
    ).map((c) => [c.id, c.label])
  );

  const negative: string[] = [];
  let open = 0;
  for (const [id, e] of byChannel) {
    const balance = e.in - e.out;
    if (balance < -1) negative.push(`${labels.get(id) ?? id}: ${som(balance)}`);
    if (Math.abs(balance) >= 1) open++;
  }

  check(
    "Kassalar manfiy qoldiqqa tushmaydi",
    negative.length === 0,
    negative.length
      ? negative.join("; ")
      : `${byChannel.size} kassa · nolda yopilmagani ${open} ta`
  );
}

/** 3. Kassa kirimi bank chiqimi bilan tasdiqlanadi (kross-reconciliation). */
async function checkCrossReconciliation(): Promise<void> {
  const inflows = await prisma.transitEntry.findMany({
    where: { direction: "in", date: { gte: from, lt: to } },
    select: { id: true, amount: true, date: true, channelId: true },
    orderBy: { date: "asc" },
  });

  // Bank tomonidagi nomzodlar — kartaga qilingan o'tkazmalar (chiqim).
  const bank = (
    await prisma.bankTransaction.findMany({
      where: { direction: "expense", valueDate: { gte: from, lt: to } },
      select: { id: true, amount: true, valueDate: true },
    })
  ).map((b) => ({ amount: Number(b.amount), time: b.valueDate.getTime(), used: false }));

  // Uch bosqichli oyna: aniq kun → ±3 kun → ±7 kun. Har bank qatori
  // FAQAT BIR MARTA ishlatiladi, aks holda bitta o'tkazma bir necha kassa
  // kirimini "tasdiqlab" yuborardi.
  let matched = 0;
  for (const window of [0, 3, 7]) {
    for (const t of inflows) {
      if ((t as { done?: boolean }).done) continue;
      const amount = Number(t.amount);
      const hit = bank.find(
        (b) =>
          !b.used &&
          Math.abs(b.amount - amount) < 1 &&
          Math.abs(b.time - t.date.getTime()) <= window * 86_400_000
      );
      if (hit) {
        hit.used = true;
        (t as { done?: boolean }).done = true;
        matched++;
      }
    }
  }

  const rate = inflows.length ? (matched / inflows.length) * 100 : 100;
  const open = inflows.filter((t) => !(t as { done?: boolean }).done);

  // CHEGARA 97% — 100% EMAS, va bu ataylab. 2026-09-01 auditida uchta kirim
  // moslashmagan va uchalasi ham IZOHLANGAN: bittasi bankda 8 kun keyin
  // o'tgan, bittasi oldingi oydan ko'chgan qoldiq (bank o'tkazmasi emas),
  // bittasi vipiska davri tugagandan keyin (29-avgust). Ya'ni 117/120 —
  // TO'G'RI natija, hisobga olinmagan pul yo'q. 100% talab qilinsa nazorat
  // doim qizil turadi va e'tibordan chiqadi.
  check(
    "Kassa kirimi bank chiqimi bilan tasdiqlanadi",
    rate >= 97,
    `${matched}/${inflows.length} = ${rate.toFixed(1)}% (talab: ≥97%)` +
      (open.length ? ` · moslashmagan: ${open.map((t) => som(Number(t.amount))).join(", ")}` : "")
  );
}

/** 4. Boshlang'ich qoldiq — faqat vipiskadan. */
async function checkOpenings(): Promise<void> {
  const entries = await prisma.kassaEntry.findMany({
    where: { category: "Boshlang'ich qoldiq", deletedAt: null },
    select: { amount: true, dedupKey: true },
  });
  const handWritten = entries.filter((e) => !e.dedupKey?.startsWith("opening:"));
  const total = entries.reduce((s, e) => s + Number(e.amount), 0);

  const expected = (await monthStatements()).reduce((s, x) => s + x.opening, 0);

  check(
    "Boshlang'ich qoldiq vipiskadan olingan",
    handWritten.length === 0 && near(total, expected),
    handWritten.length
      ? `${handWritten.length} ta qo'lda yozilgan qoldiq turibdi (scripts/set-opening-balances.ts)`
      : `${entries.length} ta yozuv · ${som(total)} — vipiskalar yig'indisi ${som(expected)}`
  );
}

/** 5. Bir odamga bitta kassa. */
async function checkDuplicateChannels(): Promise<void> {
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "employee_card" },
    select: { id: true, label: true },
  });
  const norm = (s: string) => s.toLowerCase().replace(/[‘’'`]/g, "").replace(/\s+/g, " ").trim();

  const groups = new Map<string, string[]>();
  for (const c of channels) {
    const k = norm(c.label);
    groups.set(k, [...(groups.get(k) ?? []), c.label]);
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1);

  check(
    "Bir odamga bitta kassa kanali",
    dupes.length === 0,
    dupes.length ? dupes.map((g) => g[0]).join(", ") : `${channels.length} kanal, dublikat yo'q`
  );
}

async function main(): Promise<void> {
  console.log(`\nDavr: ${month}\n${"─".repeat(72)}`);

  await checkStatements();
  await checkRegisters();
  await checkCrossReconciliation();
  await checkOpenings();
  await checkDuplicateChannels();

  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(44)} ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log("─".repeat(72));
  console.log(failed === 0 ? "Hammasi o'tdi." : `${failed} ta nazorat yiqildi.`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
