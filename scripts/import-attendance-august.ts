/**
 * AVGUST 2026 DAVOMATINI IMPORT QILISH (e-jurnal eksporti)
 * ========================================================
 * Manba: kassa/attendance_table_2026-08-01_2026-08-31 (1).json — e-jurnal
 * (yuz-skaneri) veb-kabinetidan olingan oylik jadval. Har xodim uchun kun
 * kalitlari "DD.MM.YYYY" ko'rinishida, qiymati uch xil bo'ladi:
 *   "09:03"          → faqat kelish
 *   "08:58 - 18:01"  → kelish va ketish
 *   "Dam olish kuni" → dam olish
 *
 * QARORLAR (foydalanuvchi tasdiqlagan):
 *  1. Dam olish kuniga qator YOZILMAYDI — u yo'qlik emas, KPI'ga kirmasligi
 *     kerak (`excused` deb yozilsa excusedDays soxta shishadi).
 *  2. Belgisi yo'q ish kuni → status='absent'. Shu tufayli oy "to'liq"
 *     bo'ladi: har ish kuni yo kelish, yo yo'qlik.
 *  3. Dam olish kuni FAQAT katakda yozilgani bilan aniqlanmaydi. E-jurnal
 *     ba'zi xodimlar uchun dam olish kataklarini umuman chiqarmagan (masalan
 *     Alisher, Mardon A, Mohirbek) — ularda faqat ish kunlari bor. Belgi
 *     qo'yilgan 10 kunning hammasi shanba/yakshanbaga tushadi, shuning uchun
 *     dam olish kuni hafta kunidan hisoblanadi; aks holda o'sha xodimlarga
 *     10 tadan soxta "kelmagan" yozilardi.
 *  3. Faqat ismi bazadagi xodimga ANIQ mos keladiganlar import qilinadi.
 *     Ikki xil odamga mos keladigan ("Azizbek", "Bekzod") va bazada yo'qlar
 *     tegilmaydi — hisobot oxirida ro'yxati chiqadi, ular bilan odam ishlaydi.
 *
 * Status va kechikish daqiqasi qo'lda emas, lib/attendance.ts#classifyArrival
 * orqali hisoblanadi — davomat mantig'i bitta joyda qolishi uchun.
 *
 * ISHLATISH (standart holat — QURUQ, hech narsa yozilmaydi):
 *   npx tsx scripts/import-attendance-august.ts
 *   npx tsx scripts/import-attendance-august.ts --apply
 */
import "./load-env";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { classifyArrival } from "@/lib/attendance";

const SOURCE_FILE =
  "kassa/attendance_table_2026-08-01_2026-08-31 (1).json";
const APPLY = process.argv.includes("--apply");

/** Ish kuni bo'lmagan bayramlar. 31.08 — Xotira va qadrlash kuni: dushanba,
 * lekin manbada 30 xodimning birortasida ham katak yo'q. */
const HOLIDAYS = new Set(["2026-08-31"]);

/**
 * E-jurnaldagi ism → bazadagi `User.fullName`. Ataylab qo'lda: e-jurnal
 * ismlari qisqartma ("Adham J"), baza ismlari boshqacha yozilgan ("Adxam"),
 * avtomatik moslashtirish esa xato odamga davomat yozib qo'yishi mumkin.
 * Ro'yxatda yo'q xodim import qilinmaydi.
 */
const NAME_MAP: Record<string, string> = {
  "Abdug'ani": "Abdugani",
  "Abrorbek B": "Abrorbek",
  "Adham J": "Adxam",
  "Alisher Aminboyev": "Alisher",
  // Ikki Azizbek: e-jurnaldagi "L" — bank klient, "Xasanov" — buxgalter.
  "Azizbek L": "Azizbek",
  "Azizbek Xasanov": "Azizbek (buxgalter)",
  // Ikki Bekzod: bazadagi "Bekzod" — "Bekzod S". Bekzod Najmiddinov bazada yo'q.
  "Bekzod S": "Bekzod",
  "Elbek": "Elbek Ismatillayev",
  "Go'zal R": "Go'zaloy",
  "Humora B": "Humora",
  "Javohir": "Javohir",
  "Mahmudahon": "Maxmuda",
  "Mardon A": "Mardonbek",
  "Mirabbos": "Mirabbos",
  "Mirahmad": "Mirahmad",
  "Mohirbek": "Mohirbek Yo'ldoshov",
  "Muslimbek J": "Muslimbek",
  "Musobek T": "Musobek",
  "Muxriddin Tojiboyev": "Muxriddin",
  "Ruslonbek A": "Ruslan",
  "Sevara": "Sevara",
  "Sevinchoy Bekturdiyeva": "Sevinch",
  "Umidjon Boymurotov": "Umid",
  "Zamira S": "Zamira",
};

interface SourceRow {
  "F.I.O": string;
  [key: string]: unknown;
}

/** Fayl JSON massiv emas — vergul bilan ajratilgan obyektlar oqimi. */
function readSource(): SourceRow[] {
  const raw = readFileSync(SOURCE_FILE, "utf8").trim();
  const rows = JSON.parse(`[${raw}]`) as SourceRow[];
  // Oxirgi "Jami" qatori — yig'indi, xodim emas.
  return rows.filter((r) => r["№"] !== "Jami");
}

const DAY_KEY = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/** "DD.MM.YYYY" → "YYYY-MM-DD". */
function toIsoDate(key: string): string {
  const m = DAY_KEY.exec(key)!;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * `date` UTC yarim tunda saqlanadi (Attendance unique kaliti shunga tayanadi),
 * kelish/ketish vaqti esa mahalliy vaqtda — classifyArrival getHours() ishlatadi.
 */
function dayUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function localTime(iso: string, hhmm: string): Date {
  return new Date(`${iso}T${hhmm}:00`);
}

interface Cell {
  iso: string;
  checkIn: string | null;
  checkOut: string | null;
  restDay: boolean;
}

/** Shanba/yakshanba yoki bayram — ish kuni emas. */
function isRestDay(iso: string): boolean {
  if (HOLIDAYS.has(iso)) return true;
  const wd = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

function parseCells(row: SourceRow): Cell[] {
  const cells: Cell[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!DAY_KEY.test(key)) continue;
    const iso = toIsoDate(key);
    const text = String(value).trim();

    if (text === "Dam olish kuni") {
      cells.push({ iso, checkIn: null, checkOut: null, restDay: true });
      continue;
    }

    const [inPart, outPart] = text.split("-").map((s) => s.trim());
    if (!TIME.test(inPart)) {
      throw new Error(`Tushunarsiz katak: ${row["F.I.O"]} ${key} = "${text}"`);
    }
    cells.push({
      iso,
      checkIn: inPart,
      checkOut: outPart && TIME.test(outPart) ? outPart : null,
      restDay: false,
    });
  }
  return cells;
}

/** Oyning barcha kunlari — belgisi yo'q ish kunini absent deb yozish uchun. */
function monthDays(year: number, month: number): string[] {
  const days: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

async function main() {
  const rows = readSource();
  const days = monthDays(2026, 8);

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true },
  });
  const byName = new Map(users.map((u) => [u.fullName, u.id]));

  const skipped: string[] = [];
  let people = 0;
  let present = 0;
  let late = 0;
  let absent = 0;
  let rest = 0;

  for (const row of rows) {
    const source = row["F.I.O"];
    const dbName = NAME_MAP[source];
    const userId = dbName ? byName.get(dbName) : undefined;
    if (!userId) {
      skipped.push(dbName ? `${source} → "${dbName}" bazada faol emas` : source);
      continue;
    }
    people++;

    const cells = new Map(parseCells(row).map((c) => [c.iso, c]));
    const records: {
      date: Date;
      status: string;
      checkIn: Date | null;
      checkOut: Date | null;
      lateMinutes: number;
    }[] = [];

    for (const iso of days) {
      const cell = cells.get(iso);
      // Dam olishda ishlagan bo'lsa (dam olish kunida kelish vaqti bor) —
      // u yozilishi kerak, chunki bu haqiqiy ish vaqti.
      if (cell?.restDay || (!cell && isRestDay(iso))) {
        rest++;
        continue;
      }
      if (!cell) {
        absent++;
        records.push({
          date: dayUtc(iso),
          status: "absent",
          checkIn: null,
          checkOut: null,
          lateMinutes: 0,
        });
        continue;
      }

      const checkIn = localTime(iso, cell.checkIn!);
      const cls = classifyArrival(checkIn);
      if (cls.status === "late") late++;
      else present++;
      records.push({
        date: dayUtc(iso),
        status: cls.status,
        checkIn,
        checkOut: cell.checkOut ? localTime(iso, cell.checkOut) : null,
        lateMinutes: cls.lateMinutes,
      });
    }

    if (APPLY) {
      for (const r of records) {
        const data = {
          status: r.status,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          lateMinutes: r.lateMinutes,
          source: "ejurnal",
        };
        await prisma.attendance.upsert({
          where: { userId_date: { userId, date: r.date } },
          create: { userId, date: r.date, ...data },
          update: data,
        });
      }
    }

    console.log(
      `  ${source.padEnd(24)} → ${dbName!.padEnd(20)} ${records.length} kun`,
    );
  }

  console.log(`\n${APPLY ? "YOZILDI" : "QURUQ ISHLASH (--apply berilmadi)"}`);
  console.log(`  xodim:        ${people} / ${rows.length}`);
  console.log(`  vaqtida:      ${present}`);
  console.log(`  kechikkan:    ${late}`);
  console.log(`  kelmagan:     ${absent}`);
  console.log(`  dam olish:    ${rest} (yozilmadi)`);
  if (skipped.length) {
    console.log(`\n  MOSLANMADI (${skipped.length}) — qo'lda hal qiling:`);
    for (const s of skipped) console.log(`    - ${s}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
