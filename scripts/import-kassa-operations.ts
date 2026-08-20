/**
 * KASSA OPERATSIYALARI — "Kassa.json" DATA varag'i
 * ================================================
 *
 *   npx tsx scripts/import-kassa-operations.ts            # solishtiradi, yozmaydi
 *   npx tsx scripts/import-kassa-operations.ts --apply    # faqat MOS KELMAGANLARINI yozadi
 *
 * NEGA TO'G'RIDAN-TO'G'RI IMPORT QILINMAYDI
 * ------------------------------------------
 * DATA varag'ining ko'p qatori — mijoz to'lovi ("Firma to'lovi", izohda mijoz
 * nomi). Bunday tushum bazada ALLAQACHON `Payment` bo'lib yotibdi (vipiska va
 * qo'lda kiritish orqali). Ularni yana `KassaEntry(income)` qilib yozsak,
 * bitta pul ikki marta sanalardi: balans (`lib/balance.ts`) ikkala jadvalni
 * ham qo'shadi, qarzdorlik esa kamaymaydi (`KassaEntry` `PaymentAllocation`
 * emas — `manual-receipt-allocation` qoidasiga qarang).
 *
 * Shuning uchun skript AVVAL SOLISHTIRADI:
 *   • summa teng (±1 so'm) VA izohdagi mijoz nomi `Payment.company` ga mos
 *     VA davr bir xil  → MOS, yozilmaydi;
 *   • aks holda                                              → NOMOS.
 *
 * `--apply` faqat NOMOS qatorlarni yozadi. Chiqim qatorlari har doim yoziladi
 * (ular `Payment` da bo'lishi mumkin emas), "Oylik" toifasidan tashqari —
 * oylik `Payout` dan chiqadi (`lib/kassaCategories.ts` izohi).
 *
 * Idempotent: `KassaEntry.dedupKey = "kassa-xls:<qator>"`.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { requireImportFile } from "./import-source";
import { formatNum as som } from "@/lib/format";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";
import fs from "node:fs";

/** Excel seriya raqami → sana (1899-12-30 bazasi). */
function excelDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

const norm = (s: string) => s.toLowerCase().replace(/[«»"'`‘’]/g, "").replace(/\s+/g, " ").trim();

const words = (s: string) => norm(s).split(/[^a-z0-9\u0400-\u04ff]+/).filter(Boolean);

const STOP = new Set(["mchj", "yatt", "ooo", "chp", "ajm", "xk"]);

/** Firma nomining brend so'zlari — huquqiy shakl (MCHJ, YATT…) tashlanadi. */
function brandWords(companyName: string): string[] {
  return words(companyName).filter((t) => t.length >= 4 && !STOP.has(t));
}

/**
 * Izoh shu firmani ko'rsatyaptimi.
 *
 * QISM SATR BO'YICHA QIDIRISH XATO: brend "avto" bo'lsa, "Avtomatlashtirilgan
 * elektrik" izohi ham mos kelib qolardi va pul BUTUNLAY BOSHQA firmaga
 * bog'lanardi. Shuning uchun taqqoslash BUTUN SO'Z bo'yicha:
 *   • izohdagi so'z brendga teng ("banana" = "banana"), yoki
 *   • izohdagi so'z firma nomining bo'sh joysiz shakliga teng
 *     ("aviagorodok" = "AVIA GORODOK" → "aviagorodok").
 */
function commentMatchesCompany(comment: string, companyName: string): boolean {
  const brands = brandWords(companyName);
  if (brands.length === 0) return false;
  const toks = words(comment);
  if (toks.some((t) => t === brands[0])) return true;
  const glued = brands.slice(0, 2).join("");
  return glued.length >= 6 && toks.some((t) => t === glued);
}

interface DataRow {
  rowNo: number;
  date: Date;
  type: "income" | "expense";
  firm: string | null;
  desk: string | null;
  category: string | null;
  amount: number;
  period: string;
  comment: string | null;
}

function parseData(rows: Record<string, unknown>[]): DataRow[] {
  const out: DataRow[] = [];
  rows.forEach((r, i) => {
    const amount = Number(r["Сумма"] ?? 0);
    const rawType = String(r["Тип"] ?? "").trim();
    // Summasiz qator — Excelda formulaga qoldirilgan bo'sh joy, o'tkazib yuboriladi.
    if (!amount || !rawType) return;
    out.push({
      rowNo: i + 1,
      date: excelDate(Number(r["Дата"])),
      type: rawType === "Kirim" ? "income" : "expense",
      firm: (r["Фирма"] as string) ?? null,
      desk: (r["Касса"] as string) ?? null,
      category: (r["Статья"] as string) ?? null,
      amount,
      period: String(r["Месяц"] ?? ""),
      comment: (r["Комментарий"] as string) ?? null,
    });
  });
  return out;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const book = JSON.parse(fs.readFileSync(requireImportFile("Kassa.json"), "utf8"));
  const rows = parseData(book["DATA"] ?? []);
  console.log(`\nDATA varag'i: ${rows.length} ta summali qator`);

  // ── Kassalarni kanalga bog'laymiz ──────────────────────────────────────
  const channels = await prisma.disbursementChannel.findMany({
    select: { id: true, label: true, type: true },
  });
  const channelFor = (desk: string | null) =>
    desk ? (channels.find((c) => norm(c.label) === norm(desk))?.id ?? null) : null;

  // ── Mavjud to'lovlar (solishtirish uchun) ──────────────────────────────
  const periods = Array.from(new Set(rows.map((r) => r.period).filter(Boolean)));
  const payments = await prisma.payment.findMany({
    where: { period: { in: periods }, deletedAt: null },
    select: { id: true, amount: true, period: true, company: { select: { name: true } } },
  });
  console.log(`Solishtirish bazasi: ${payments.length} ta Payment (${periods.join(", ")})`);

  /**
   * Izohdagi mijoz nomi to'lov firmasiga mos keladimi.
   *
   * MOSLIK KALITI — FIRMA NOMINING BIRINCHI SO'ZI (brend so'zi). Buxgalter
   * izohda aynan uni yozadi: "Gita iyun", "Banana school iyun".
   *
   * Eng uzun so'z bo'yicha qidirish XATO edi: "GITA DASTURCHILAR
   * AKADEMIYASI" da eng uzun so'z "dasturchilar", u esa izohda yo'q —
   * natijada bazada bor to'lov "yangi" deb sanalib, ikkinchi marta
   * yozilardi. Umumiy so'z bo'yicha qidirish ham xato: "school" ikkala
   * "DOSANOV SCHOOL" va "BANANA SCHOOL" ga tegishli va ikkalasining
   * summasi ham 1 mln — noto'g'ri firmaga bog'lanardi.
   */
  function matchPayment(row: DataRow) {
    const c = row.comment ?? "";
    if (!c.trim()) return null;
    return (
      payments.find(
        (p) =>
          p.period === row.period &&
          Math.abs(Number(p.amount) - row.amount) <= 1 &&
          commentMatchesCompany(c, p.company.name)
      ) ?? null
    );
  }

  const NON_POSTABLE = new Set(["oylik"]);

  const matched: string[] = [];
  const toWrite: DataRow[] = [];
  const blocked: string[] = [];

  for (const r of rows) {
    if (r.type === "expense" && NON_POSTABLE.has(norm(r.category ?? ""))) {
      blocked.push(`qator ${r.rowNo}: "${r.category}" — oylik Payout dan chiqadi, kassaga yozilmaydi`);
      continue;
    }
    if (r.type === "income") {
      const hit = matchPayment(r);
      if (hit) {
        matched.push(`qator ${r.rowNo}: ${som(r.amount)} — ${hit.company.name} (${r.comment})`);
        continue;
      }
    }
    toWrite.push(r);
  }

  console.log(`\n${"═".repeat(76)}`);
  console.log(`MOS KELDI — Payment da allaqachon bor, yozilmaydi (${matched.length})`);
  console.log("═".repeat(76));
  for (const m of matched) console.log(`   ${m}`);

  if (blocked.length) {
    console.log(`\nBLOKLANDI (${blocked.length}):`);
    for (const b of blocked) console.log(`   ${b}`);
  }

  console.log(`\n${"═".repeat(76)}`);
  console.log(`YOZILADI (${toWrite.length})`);
  console.log("═".repeat(76));
  console.log(`${"#".padEnd(5)}${"sana".padEnd(12)}${"tur".padEnd(9)}${"summa".padStart(14)}  toifa / izoh`);
  for (const r of toWrite) {
    const ch = channelFor(r.desk);
    console.log(
      `${String(r.rowNo).padEnd(5)}${r.date.toISOString().slice(0, 10).padEnd(12)}` +
        `${(r.type === "income" ? "kirim" : "chiqim").padEnd(9)}${som(r.amount).padStart(14)}  ` +
        `${r.category ?? "—"} · ${r.comment ?? ""}${ch ? "" : `  ⚠ kassa "${r.desk}" topilmadi`}`
    );
  }

  const sum = (t: string) => toWrite.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
  console.log(`\nJami — kirim ${som(sum("income"))} · chiqim ${som(sum("expense"))}`);

  // ── QARZDORLIK OGOHLANTIRISHI ─────────────────────────────────────────
  // `KassaEntry(income)` pulni kassaga kiritadi, lekin MIJOZ QARZINI
  // KAMAYTIRMAYDI — buning uchun `Payment` + `PaymentAllocation` kerak
  // (`server/payments.ts` `applyAllocation`). Ya'ni import balansni
  // to'g'rilaydi, qarzdorlik ekrani esa bu mijozlarni baribir qarzdor
  // ko'rsatishda davom etadi. Jimgina qoldirilsa, keyin "nega to'lagan
  // mijoz qarzdor?" degan savol tug'ilardi.
  const incomeRows = toWrite.filter((r) => r.type === "income");
  if (incomeRows.length) {
    const allCompanies = await prisma.company.findMany({ select: { id: true, name: true } });
    const known: string[] = [];
    const unknown: string[] = [];
    for (const r of incomeRows) {
      const hit = allCompanies.find((co) => commentMatchesCompany(r.comment ?? "", co.name));
      (hit ? known : unknown).push(
        `qator ${r.rowNo}: ${som(r.amount)} — ${r.comment}${hit ? ` → ${hit.name}` : ""}`
      );
    }
    console.log(`\n${"─".repeat(76)}`);
    console.log("⚠ DIQQAT — kassa kirimi mijoz QARZINI KAMAYTIRMAYDI");
    console.log("─".repeat(76));
    if (known.length) {
      console.log(`Bazada firmasi BOR (${known.length}) — to'lov sifatida rasmiylashtirish kerak:`);
      for (const k of known) console.log(`   ${k}`);
    }
    if (unknown.length) {
      console.log(`Bazada firmasi YO'Q (${unknown.length}) — avval mijoz sifatida ochilsin:`);
      for (const u of unknown) console.log(`   ${u}`);
    }
  }

  if (!apply) {
    console.log("\nHech narsa yozilmadi. Yozish uchun: --apply");
    await prisma.$disconnect();
    return;
  }

  // ── JURNAL ─────────────────────────────────────────────────────────────
  // Kassalar hisoboti (`server/kassaReport.ts`) qoldiqni `LedgerEntry` ning
  // CASH oyoqlaridan o'qiydi, `KassaEntry` jadvalidan EMAS. Ya'ni jurnalsiz
  // yozuv balansga ham, kassalar jadvaliga ham TUSHMAYDI — u faqat
  // ro'yxatda ko'rinib turadigan "o'lik" qator bo'lardi. Shuning uchun
  // import ham `server/kassa.ts` dagi bilan AYNAN BIR XIL oyoqlarni yozadi.
  const importer = await prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });

  let written = 0;
  for (const r of toWrite) {
    const dedupKey = `kassa-xls:${r.rowNo}`;
    const existing = await prisma.kassaEntry.findFirst({ where: { dedupKey }, select: { id: true } });
    const data = {
      type: r.type,
      category: r.category ?? "Boshqa xarajatlar",
      amount: r.amount,
      date: r.date,
      description: [r.comment, r.firm].filter(Boolean).join(" · ") || null,
      channelId: channelFor(r.desk),
    };

    const row = existing
      ? await prisma.kassaEntry.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.kassaEntry.create({ data: { ...data, dedupKey }, select: { id: true } });

    // Jurnal APPEND-ONLY: qayta import qilinganda eskisi avval bekor qilinadi
    // (`postLedger` ochiq yozuv ustiga yozishni o'zi bloklaydi).
    if (existing) {
      await reverseLedger(prisma as never, {
        sourceTable: "KassaEntry",
        sourceId: row.id,
        createdBy: importer?.id ?? null,
        reason: "kassa importi qayta ishga tushirildi",
      });
    }
    await postLedger(prisma as never, {
      legs:
        r.type === "income"
          ? [
              { accountId: ACCOUNTS.CASH, debit: r.amount, channelId: data.channelId },
              { accountId: ACCOUNTS.KASSA_INCOME, credit: r.amount },
            ]
          : [
              { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: r.amount },
              { accountId: ACCOUNTS.CASH, credit: r.amount, channelId: data.channelId },
            ],
      period: periodKeyOf(r.date),
      sourceTable: "KassaEntry",
      sourceId: row.id,
      createdBy: importer?.id ?? null,
      description: `Kassa ${r.type === "income" ? "kirim" : "chiqim"}: ${data.category}`,
    });
    written++;
  }
  console.log(`\n✓ KassaEntry + jurnal yozildi/yangilandi: ${written}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
