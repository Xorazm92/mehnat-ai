/**
 * TRANZIT KASSANI EXCEL EKSPORTIDAN IMPORT QILISH.
 *
 * Ikki manba (`others_json_files/`):
 *   `Band qilganlar.json`      → DisbursementChannel (34 shaxs, 17 tasi karta bilan)
 *   `O'zini-o'zi band <Oy>.json`  → TransitEntry (o'sha oy daftari, `--month=`)
 *
 *   npx tsx scripts/import-transit.ts --month=iyul --dry-run
 *   npx tsx scripts/import-transit.ts --month=avgust --create-missing
 *
 * BALANS QOIDASI: tranzit daftari — XOM yozuv, kompaniya balansiga kirmaydi.
 * Bankdan kartaga o'tkazma xarajat EMAS (o'z cho'ntagimizdan o'z
 * cho'ntagimizga); haqiqiy xarajat kartadan pul sarflanganda yuz beradi.
 * Shuning uchun bu skript `KassaEntry` YOZMAYDI — u faqat daftarni tiklaydi.
 * Kartadan qilingan xarajatni kassaga yozish `server/transit.ts`
 * `spendFromChannel` orqali, admin qo'li bilan bo'ladi.
 *
 * Idempotent: `TransitEntry.dedupKey = "xls:<oy>:<varaq>:<qator>:<yo'nalish>"`.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import fs from "node:fs";
import path from "node:path";
import { requireImportFile } from "./import-source";
import {
  parseBandQilganlar,
  parseTransitSheet,
  parseTransitTotals,
  maskCard,
  nameKey,
  type ParsedChannelPerson,
} from "@/lib/transitImport";
import { recordKassaMovement, runCashTx } from "@/lib/cashGate";
import { ACCOUNTS } from "@/lib/ledger";

/**
 * --with-expenses: daftar CHIQIM qatorlari faqat TransitEntry bo'lib
 * qolmasin — KassaEntry(xarajat) ham yozilsin. Shu bo'lmaganda kartadan
 * sarflangan oylik va boshqa xarajatlar balansda, jurnalda va P&L da
 * UMUMAN KO'RINMASDI (qarzdorlik ekranidagi "kartada turgan pul" esa
 * ortiqcha ko'rinardi).
 *
 * Oylikka o'xshagan toifalar SALARY_EXPENSE hisobiga, qolgani OPERATING_EXPENSE
 * ga ketadi (`SALARY_CATEGORY_RE` — cashGate bilan bir xil qoida).
 * Actor "script" — tarixiy backfill uchun balans tekshiruvi YO'Q
 * (cashGate qoidasi: o'tmish allaqachon sodir bo'lgan).
 */
const withExpenses = process.argv.includes("--with-expenses");
const actor = { kind: "script" as const, name: "import-transit" };

const REGISTRY = requireImportFile("Band qilganlar.json");

// ── QAYSI OY ─────────────────────────────────────────────────────────────
// Har oy o'z daftar fayli bilan keladi ("O'zini-o'zi band <Oy>.json").
// Skript ilgari faqat IYUL'ni bilardi va oy nomi kod ichida qotib turardi.
//
// DIQQAT — `dedupKey` da OY BO'LISHI SHART. Varaq nomlari ("Abror") va qator
// raqamlari har oyda takrorlanadi, ya'ni oysiz kalit (`xls:Abror:1:in`) bilan
// avgust qatori iyul qatorining USTIGA yozilardi: iyul daftari jimgina
// yo'q bo'lib, qoldiqlar buzilardi.
const MONTHS: Record<string, { file: string; period: string; fallbackDate: Date }> = {
  iyul: { file: "O'zini-o'zi band Iyul.json", period: "2026-07", fallbackDate: new Date(2026, 6, 1) },
  avgust: { file: "O'zini-o'zi band Avgust.json", period: "2026-08", fallbackDate: new Date(2026, 7, 1) },
};

function resolveMonth() {
  const arg = process.argv.find((a) => a.startsWith("--month="))?.slice(8).toLowerCase();
  const name = arg ?? "iyul";
  const m = MONTHS[name];
  if (!m) {
    console.error(`Noma'lum oy: "${name}". Mavjud: ${Object.keys(MONTHS).join(", ")}`);
    process.exit(1);
  }
  return { name, ...m };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[‘’'`]/g, "").replace(/\s+/g, " ").trim();

/**
 * Varaq nomi ("Muslim") to'liq F.I.O ("JALILOV MUSLIMBEK") bilan bog'lanadi.
 *
 * Ko'pchiligi prefiks bo'yicha topiladi, lekin uchtasida imlo farq qiladi:
 * Guzaloy≠GO‘ZAL, Ruslan≠RUSLONBEK, Bekzod≠BEGZOD. Bular ATAYIN qo'lda
 * yozilgan — mavhum (fuzzy) moslashtirish ishlatilmaydi, chunki ro'yxatda
 * "…BEK" bilan tugaydigan 11 ta ism bor va noto'g'ri moslik pulni BOSHQA
 * xodimning kartasiga yozib qo'yardi. Har biri tekshirilgan: ro'yxatda
 * shu imlo bilan boshqa nomzod yo'q.
 */
const SHEET_ALIASES: Record<string, string> = {
  guzaloy: "RADJABOVA GO‘ZAL",
  ruslan: "ATAXONOV RUSLONBEK G‘AYRAT O‘G‘LI",
  bekzod: "SHAVKATOV BEGZOD",
};

function findPerson(sheet: string, people: ParsedChannelPerson[]): ParsedChannelPerson | null {
  const key = norm(sheet);

  const alias = SHEET_ALIASES[key];
  if (alias) {
    const exact = people.find((p) => norm(p.fullName) === norm(alias));
    if (exact) return exact;
  }

  // Varaq nomi qisqartma — to'liq ismning BIRON BO'LAGI bilan boshlanadi.
  const matches = people.filter((p) =>
    norm(p.fullName)
      .split(" ")
      .some((part) => part.startsWith(key) || key.startsWith(part))
  );
  if (matches.length === 1) return matches[0];

  // "Azizbek I" / "Azizbek X" — ikkita Azizbek bor, oxirgi harf FAMILIYA
  // BOSH HARFI (I=Isomiddinov, X=Xasanov). Ro'yxatda familiya birinchi
  // turadi, shuning uchun uni aniq ajratish mumkin.
  const parts = key.split(" ");
  if (parts.length === 2 && parts[1].length === 1) {
    const [given, initial] = parts;
    const byInitial = people.filter((p) => {
      const tokens = norm(p.fullName).split(" ");
      const surname = tokens[0] ?? "";
      return surname.startsWith(initial) && tokens.slice(1).some((t) => t.startsWith(given));
    });
    if (byInitial.length === 1) return byInitial[0];
  }

  // Bir nechta nomzod qolsa TANLAMAYMIZ — noto'g'ri moslik pulni boshqa
  // xodimning kartasiga yozib qo'yardi. Qo'lda ko'rib chiqiladi.
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const createMissing = process.argv.includes("--create-missing");
  const month = resolveMonth();
  const LEDGER = requireImportFile(month.file);
  /** Shu oy qatorlarining kalit prefiksi. */
  const key = (sheet: string, rowNo: number, dir: string) =>
    `xls:${month.period}:${sheet}:${rowNo}:${dir}`;

  console.log(`Oy: ${month.name.toUpperCase()} (${month.period}) — ${path.basename(LEDGER)}`);

  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));

  // ── ESKI KALITLARNI KO'CHIRISH ─────────────────────────────────────────
  // Birinchi import oysiz kalit yozgan (`xls:Abror:1:in`). Ular IYUL
  // daftaridan kelgan — boshqa oy hali import qilinmagan edi. Oy qo'shilgan
  // yangi formatga bir martalik ko'chirish, aks holda iyulni qayta ishga
  // tushirsak har qator ikki nusxada paydo bo'lardi.
  if (!dryRun) {
    const legacy = await prisma.transitEntry.findMany({
      where: { dedupKey: { startsWith: "xls:" }, NOT: { dedupKey: { startsWith: "xls:2026-" } } },
      select: { id: true, dedupKey: true },
    });
    for (const e of legacy) {
      await prisma.transitEntry.update({
        where: { id: e.id },
        data: { dedupKey: e.dedupKey.replace(/^xls:/, "xls:2026-07:") },
      });
    }
    if (legacy.length) console.log(`Eski kalit ko'chirildi (iyul): ${legacy.length} qator`);
  }

  const people = parseBandQilganlar(registry["Band Xodimlar"] ?? []);
  const totals = new Map(parseTransitTotals(ledger["Total"] ?? []).map((t) => [norm(t.person), t]));

  console.log(`O'qildi: ${people.length} shaxs, ${people.filter((p) => p.cardNumber).length} tasida karta`);

  // ── Firma nomlarini bazadagi o'z firmalarga bog'laymiz ────────────────
  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { id: true, name: true },
  });
  const firmByName = (name: string | null) => {
    if (!name) return null;
    const k = norm(name);
    return (
      ownFirms.find((f) => norm(f.name) === k) ??
      ownFirms.find((f) => norm(f.name).includes(k) || k.includes(norm(f.name))) ??
      null
    );
  };

  // ── Xodimlarni bazadagi User bilan bog'laymiz ─────────────────────────
  const staff = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
  });
  const staffByName = (fullName: string) => {
    const parts = norm(fullName).split(" ");
    return (
      staff.find((u) => norm(u.fullName) === norm(fullName)) ??
      staff.find((u) => parts.some((p) => p.length > 3 && norm(u.fullName).includes(p))) ??
      null
    );
  };

  // ─────────────────────────────────────────────────────────
  // 1. KANALLAR
  // ─────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}\nKANALLAR\n${"═".repeat(72)}`);

  let created = 0;
  let updated = 0;
  const noCard: string[] = [];
  const channelIdByPerson = new Map<string, string>();

  for (const p of people) {
    const mask = maskCard(p.cardNumber);
    if (!mask) noCard.push(p.fullName);

    const firm = firmByName(p.ownFirmName);
    const user = staffByName(p.fullName);
    const data = {
      type: "employee_card",
      label: p.fullName,
      employeeId: user?.id ?? null,
      cardMask: mask,
      ownFirmId: firm?.id ?? null,
      mfo: p.mfo,
      transitAccount: p.transitAccount,
      certificateNo: p.certificateNo,
      pinfl: p.pinfl,
      engagedAt: p.engagedAt,
      activityType: p.activityType,
    };

    if (dryRun) {
      created++;
      channelIdByPerson.set(norm(p.fullName), "dry");
      continue;
    }

    // Kanalni topish tartibi MUHIM — aks holda vipiskadan yaratilgan
    // kanalning yoniga reyestrdan ikkinchisi qo'shilib, bir odam ikki
    // kanal bo'lib ketadi (avval aynan shunday bo'lgan):
    //   1) KARTA bo'yicha (ChannelCard — bir odamda bir necha karta bo'ladi)
    //   2) ISM bo'yicha (so'z tartibi va transliteratsiya farqi hisobga olinadi)
    //   3) shundan keyingina yangi kanal
    let existing: { id: string } | null = null;

    if (mask) {
      const card = await prisma.channelCard.findUnique({
        where: { cardMask: mask },
        select: { channelId: true },
      });
      if (card) existing = { id: card.channelId };
    }

    if (!existing) {
      const key = nameKey(p.fullName);
      const all = await prisma.disbursementChannel.findMany({
        where: { type: "employee_card" },
        select: { id: true, label: true },
      });
      const hits = all.filter((c) => nameKey(c.label) === key);
      // Bir nechta mos kelsa TANLAMAYMIZ — merge-channels.ts hal qiladi.
      if (hits.length === 1) existing = { id: hits[0].id };
    }

    // Yangi reyestr ba'zan KAMROQ ustun bilan keladi (karta/MFO/JSHSHIR yo'q).
    // Mavjud kanalni to'liq `data` bilan yangilasak, turgan qiymatlar NULL ga
    // aylanardi — karta niqobi yo'qolib, ChannelCard bog'lanishi buzilardi.
    // Shuning uchun UPDATE faqat NULL BO'LMAGAN maydonlarni yozadi; CREATE
    // esa to'liq data oladi.
    const row = existing
      ? await prisma.disbursementChannel.update({
          where: { id: existing.id },
          data: Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== null && v !== undefined)
          ),
          select: { id: true },
        })
      : await prisma.disbursementChannel.create({ data, select: { id: true } });

    // Kartani ro'yxatga qo'shamiz (kanalda bir nechtasi bo'lishi mumkin).
    if (mask) {
      await prisma.channelCard.upsert({
        where: { cardMask: mask },
        create: { channelId: row.id, cardMask: mask, isPrimary: true },
        update: { channelId: row.id },
      });
    }

    if (existing) updated++;
    else created++;
    channelIdByPerson.set(norm(p.fullName), row.id);
  }

  console.log(`Yaratildi: ${created}, yangilandi: ${updated}`);
  if (noCard.length) {
    console.log(`\nKarta raqami ko'rsatilmagan (${noCard.length}) — kanal baribir yaratildi:`);
    for (const n of noCard) console.log(`   ${n}`);
  }

  // ─────────────────────────────────────────────────────────
  // 2. DAFTAR
  // ─────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}\n${month.name.toUpperCase()} DAFTARI\n${"═".repeat(72)}`);
  console.log(
    `${"XODIM".padEnd(12)}${"kirim".padStart(14)}${"chiqim".padStart(14)}${"komis".padStart(9)}${"qoldiq".padStart(13)}  Total  kanal`
  );

  const sheets = Object.keys(ledger).filter((s) => s !== "Total");
  let entriesWritten = 0;
  let skippedAsBankDuplicate = 0;
  let skippedAmount = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalBalance = 0;
  let postedExpenseCount = 0;
  let postedExpenseSum = 0;
  const unmatchedSheets: string[] = [];
  const autoCreated: string[] = [];
  const mismatched: string[] = [];

  for (const sheet of sheets) {
    const parsed = parseTransitSheet(sheet, ledger[sheet] ?? []);
    const person = findPerson(sheet, people);
    let channelId = person ? channelIdByPerson.get(norm(person.fullName)) : undefined;

    // ── REYESTRDA YO'Q VARAQ ───────────────────────────────────────────
    // Daftarda odam bor, "Band qilganlar" ro'yxatida yo'q (masalan avgustda
    // "Uchqun Marketing" — 5 mln harakat). Bunday varaq jimgina tashlansa,
    // pul hisobotdan tushib qolardi.
    //
    // Kanal ATAYIN faqat `--create-missing` bilan ochiladi va faqat VARAQ
    // NOMI bo'yicha: mavjud xodimga taxmin bilan bog'lash — pulni boshqa
    // odamning kartasiga yozish demak (`findPerson` izohiga qarang). Karta,
    // MFO, JSHSHIR bo'sh qoladi, ular reyestr yangilanganda to'ladi.
    if (!channelId && createMissing && !dryRun) {
      const existing = await prisma.disbursementChannel.findFirst({
        where: { type: "employee_card", label: sheet },
        select: { id: true },
      });
      const row = existing
        ? existing
        : await prisma.disbursementChannel.create({
            data: {
              type: "employee_card",
              label: sheet,
              notes: `Daftar varag'idan ochildi (${month.period}) — "Band qilganlar" reyestrida yo'q.`,
            },
            select: { id: true },
          });
      channelId = row.id;
      autoCreated.push(sheet);
    }

    const expected = totals.get(norm(sheet)) ?? null;
    const balanceOk =
      expected == null ? "—" : Math.abs(expected.cardBalance - parsed.balance) < 1 ? "✓" : "✗";
    if (balanceOk === "✗") {
      mismatched.push(`${sheet}: hisoblangan ${som(parsed.balance)}, faylda ${som(expected!.cardBalance)}`);
    }
    if (!channelId) unmatchedSheets.push(sheet);

    totalIn += parsed.totalIn;
    totalOut += parsed.totalOut;
    totalBalance += parsed.balance;

    console.log(
      `${sheet.padEnd(12)}${som(parsed.totalIn).padStart(14)}${som(parsed.totalOut).padStart(14)}` +
        `${som(parsed.totalCommission).padStart(9)}${som(parsed.balance).padStart(13)}` +
        `   ${balanceOk}    ${channelId ? "✓" : "✗ " + sheet}`
    );

    if (dryRun || !channelId) continue;

    // ── BANK KIRIMI BILAN TAKRORLANMASLIK ──────────────────────────────
    // Vipiskadan kelgan karta o'tkazmalari allaqachon `bank:` kaliti bilan
    // yozilgan. Excel daftari ham AYNAN O'SHA pulni ko'rsatadi — ikkalasi
    // yozilsa kanal qoldig'i ikki barobar shishadi (avval shunday bo'lgan:
    // 515 mln + 444 mln).
    //
    // Bank — ishonchli manba (pul haqiqatan o'tgani), shuning uchun mos
    // kelgan Excel kirimi TASHLANADI. Mos kelmagani qoladi: u vipiskasi
    // bizda yo'q firmadan kelgan pul bo'lishi mumkin.
    const bankIn = await prisma.transitEntry.findMany({
      where: { channelId, direction: "in", dedupKey: { startsWith: "bank:" } },
      select: { id: true, amount: true, date: true },
    });
    const bankPool = bankIn.map((b) => ({ amount: Number(b.amount), time: b.date.getTime(), used: false }));

    for (const m of parsed.movements) {
      const when = m.date ?? month.fallbackDate;
      const sourceFirm = firmByName(m.sourceFirm);

      // DIQQAT: bu yerda `continue` ISHLATILMAYDI. Bitta qatorda ham kirim,
      // ham chiqim bo'lishi mumkin (masalan "oldim va darhol oylikka berdim").
      // Kirim bank dublikati bo'lgani uchun tashlansa ham, o'sha qatordagi
      // CHIQIM baribir yozilishi kerak — aks holda 441 mln chiqimning
      // yarmi yo'qoladi.
      let skipThisInflow = false;
      if (m.amountIn > 0) {
        // Summa bir xil va sana ±3 kun ichida bo'lsa — bu o'sha bank o'tkazmasi.
        const twin = bankPool.find(
          (b) => !b.used && Math.abs(b.amount - m.amountIn) < 1 && Math.abs(b.time - when.getTime()) <= 3 * 86_400_000
        );
        if (twin) {
          twin.used = true;
          skippedAsBankDuplicate++;
          skippedAmount += m.amountIn;
          skipThisInflow = true;
        }
      }

      if (m.amountIn > 0 && !skipThisInflow) {
        await prisma.transitEntry.upsert({
          where: { dedupKey: key(sheet, m.rowNo, "in") },
          create: {
            dedupKey: key(sheet, m.rowNo, "in"),
            channelId,
            direction: "in",
            amount: m.amountIn,
            date: when,
            description: sourceFirm ? `${sourceFirm.name} dan` : (m.sourceFirm ?? "Excel importi"),
          },
          update: { amount: m.amountIn, date: when },
        });
        entriesWritten++;
      }

      if (m.amountOut > 0) {
        const label = [m.purpose, m.comment].filter(Boolean).join(" — ");
        const outKey = key(sheet, m.rowNo, "out");
        const trow = await prisma.transitEntry.upsert({
          where: { dedupKey: outKey },
          create: {
            dedupKey: outKey,
            channelId,
            direction: "out",
            amount: m.amountOut,
            date: when,
            category: m.purpose ?? "boshqa",
            description: label || null,
          },
          update: { amount: m.amountOut, date: when },
          select: { id: true, kassaEntryId: true },
        });
        entriesWritten++;

        // ── XARAJAT YOZUVI (--with-expenses) ────────────────────────────
        // Kartadan sarflangan pul HAQIQIY xarajat: KassaEntry + ikki
        // tomonlama jurnal. dedupKey transit bilan BIR XIL — qayta ishga
        // tushirish ikkinchi nusha yozmaydi.
        if (withExpenses) {
          const text = `${m.purpose ?? ""} ${m.comment ?? ""}`;
          const isSalary = /oylik|maosh|ish\s*haqi|mehnat\s*haqi/i.test(text);
          const res = await runCashTx((tx) =>
            recordKassaMovement(tx, actor, {
              type: "expense",
              category: m.purpose ?? "Boshqa xarajatlar",
              amount: m.amountOut,
              date: when,
              description: label ? `${sheet}: ${label}` : `${sheet} kassasidan xarajat`,
              channelId,
              dedupKey: outKey,
              expenseAccount: isSalary ? ACCOUNTS.SALARY_EXPENSE : ACCOUNTS.OPERATING_EXPENSE,
            })
          );
          postedExpenseSum += m.amountOut;
          postedExpenseCount += res.alreadyRecorded ? 0 : 1;
          if (!trow.kassaEntryId) {
            await prisma.transitEntry.update({
              where: { id: trow.id },
              data: { kassaEntryId: res.id },
            });
          }
        }
      }

      // Bank komissiyasi ham kartadan yechiladi — alohida chiqim qatori.
      if (m.commission > 0) {
        const feeKey = key(sheet, m.rowNo, "fee");
        const frow = await prisma.transitEntry.upsert({
          where: { dedupKey: feeKey },
          create: {
            dedupKey: feeKey,
            channelId,
            direction: "out",
            amount: m.commission,
            date: when,
            category: "bank_komissiya",
            description: "Bank komissiyasi",
          },
          update: { amount: m.commission, date: when },
          select: { id: true, kassaEntryId: true },
        });
        entriesWritten++;
        if (withExpenses) {
          const res = await runCashTx((tx) =>
            recordKassaMovement(tx, actor, {
              type: "expense",
              category: "Bank komissiyasi",
              amount: m.commission,
              date: when,
              description: `${sheet} — bank komissiyasi`,
              channelId,
              dedupKey: feeKey,
              expenseAccount: ACCOUNTS.OPERATING_EXPENSE,
            })
          );
          postedExpenseSum += m.commission;
          postedExpenseCount += res.alreadyRecorded ? 0 : 1;
          if (!frow.kassaEntryId) {
            await prisma.transitEntry.update({
              where: { id: frow.id },
              data: { kassaEntryId: res.id },
            });
          }
        }
      }
    }
  }

  console.log(
    `\nJAMI  kirim ${som(totalIn)} · chiqim ${som(totalOut)} · qoldiq ${som(totalBalance)}`
  );

  // Fayldagi "Total" formulasi bilan solishtiramiz.
  const declared = parseTransitTotals(ledger["Total"] ?? []);
  const declaredSum = declared.reduce((s, t) => s + t.monthIn, 0);
  const declaredBalance = declared.reduce((s, t) => s + t.cardBalance, 0);
  console.log(
    `Total varag'i: kirim ${som(declaredSum)} (${declared.length} qator) · qoldiq ${som(declaredBalance)}`
  );

  if (mismatched.length > 0) {
    console.log(`\n⚠️  QOLDIQ MOS KELMADI (${mismatched.length}):`);
    for (const m of mismatched) console.log(`   ${m}`);
    if (!dryRun) {
      console.error("\nImport to'xtatildi — qoldiq mos kelmasa ma'lumot ishonchsiz.");
      process.exit(1);
    }
  }

  if (autoCreated.length > 0) {
    console.log(`\n🆕 Varaq nomi bo'yicha kanal ochildi (${autoCreated.length}) — reyestrga qo'shishni unutmang:`);
    for (const s of autoCreated) console.log(`   ${s}`);
  }

  if (unmatchedSheets.length > 0) {
    console.log(`\n📋 QO'LDA KO'RIB CHIQISH — kanal topilmadi (${unmatchedSheets.length}):`);
    for (const s of unmatchedSheets) console.log(`   varaq "${s}" — "Band qilganlar" da mos F.I.O yo'q`);
    if (!createMissing) console.log(`   (kanal ochilsin: --create-missing)`);
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  console.log(`\nTransitEntry yozildi: ${entriesWritten}`);
  if (withExpenses) {
    console.log(
      `Xarajat yozuvi (KassaEntry): ${postedExpenseCount} ta / ${som(postedExpenseSum)} so'm` +
        ` (allaqachon turganlari qayta yozilmadi)`
    );
  }
  if (skippedAsBankDuplicate > 0) {
    console.log(
      `Bank o'tkazmasi bilan bir xil bo'lgani uchun tashlandi: ${skippedAsBankDuplicate} ta kirim · ${som(skippedAmount)} so'm`
    );
  }

  const check = await prisma.transitEntry.groupBy({ by: ["direction"], _sum: { amount: true } });
  for (const c of check) {
    console.log(`   ${c.direction}: ${som(Number(c._sum.amount))} so'm`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
