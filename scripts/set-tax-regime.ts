/**
 * SOLIQ REJIMINI RO'YXAT BO'YICHA O'RNATISH.
 *
 * Nima uchun skript: rahbariyat 159 ta korxonani NDS ga o'tkazishni so'radi.
 * Har birini wizard orqali o'tkazish — to'rt qadam × 159 marta. Bundan
 * tashqari qo'lda kiritishda nom xato tanlanishi mumkin, skriptda esa
 * moslashtirish qoidasi bitta va tekshirilgan.
 *
 * NOMLARNI MOSLASHTIRISH: ro'yxatdagi nomlar bilan bazadagi nomlar bir xil
 * yozilmagan — qo'shtirnoq, "MCHJ"/"ООО"/"ЧП" kabi yuridik shakl belgilari,
 * kirill va lotin harflarining aralashib ketishi (О/O, С/C, Р/P). Shuning
 * uchun ikkala tomon ham normallashtiriladi: kirill lotinga o'giriladi,
 * yuridik shakl va tinish belgilari olib tashlanadi.
 *
 * IKKILANISH — XATO. Bitta nomga ikkita firma mos kelsa, skript uni
 * O'ZGARTIRMAYDI va ro'yxatga chiqaradi: noto'g'ri firmaning soliq rejimini
 * o'zgartirish matritsani ham, majburiyat dvigatelini ham buzadi.
 *
 *   npx tsx scripts/set-tax-regime.ts --file scripts/data/nds-firmalar.txt --regime vat
 *   npx tsx scripts/set-tax-regime.ts --file ... --regime vat --apply
 *
 * `--apply` berilmasa hech narsa yozilmaydi (quruq rejim).
 * `--include-archived` — arxivdagi firmalarni ham qamraydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { readFileSync } from "node:fs";
import { normalizeTaxRegime } from "@/lib/taxRegimes";

/** Kirill harflarining lotin ko'rinishi — nom aralash yozilgan bo'lishi mumkin. */
const CYR: Record<string, string> = {
  А: "a", В: "b", Е: "e", К: "k", М: "m", Н: "h", О: "o", Р: "p", С: "c",
  Т: "t", У: "y", Х: "x", І: "i",
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c",
  т: "t", у: "y", х: "x", і: "i",
};

/** Moslashtirishda ahamiyatsiz yuridik shakl belgilari. */
const FORMS =
  /\b(mchj|мчж|мчj|ooo|ооо|chp|чп|xk|хк|xf|х ф|ab|аб|ie|yatt|mc|nou|ноу|адвокатлик|бюроси|бюро)\b/g;

function norm(raw: string): string {
  const latin = [...raw].map((ch) => CYR[ch] ?? ch).join("").toLowerCase();
  return latin
    .replace(/["'`’‘“”«»„]/g, " ")
    .replace(/[^a-z0-9а-яё]+/g, " ")
    .replace(FORMS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bo'shliqsiz ko'rinish — "CRAVE TECH" ↔ "CRAVETECH" kabi holatlar uchun. */
const tight = (s: string) => s.replace(/\s+/g, "");

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args[args.indexOf("--file") + 1];
  const regimeArg = args[args.indexOf("--regime") + 1];
  const apply = args.includes("--apply");
  const includeArchived = args.includes("--include-archived");

  if (!fileArg || args.indexOf("--file") < 0) throw new Error("--file <path> berilishi shart");
  const regime = normalizeTaxRegime(regimeArg);

  const wanted = readFileSync(fileArg, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const companies = await prisma.company.findMany({
    where: { isOwnFirm: false, ...(includeArchived ? {} : { isActive: true }) },
    select: { id: true, name: true, inn: true, taxRegime: true, isActive: true },
  });
  const indexed = companies.map((c) => ({ ...c, n: norm(c.name) }));

  const willChange: typeof indexed = [];
  const already: string[] = [];
  const ambiguous: { wanted: string; hits: string[] }[] = [];
  const notFound: string[] = [];
  const seen = new Set<string>();

  for (const w of wanted) {
    const wn = norm(w);
    if (!wn) continue;

    let hits = indexed.filter((c) => c.n === wn);
    if (hits.length === 0) hits = indexed.filter((c) => tight(c.n) === tight(wn));
    if (hits.length === 0) {
      hits = indexed.filter(
        (c) => (c.n.includes(wn) || wn.includes(c.n)) && Math.min(c.n.length, wn.length) >= 5,
      );
    }

    if (hits.length > 1) { ambiguous.push({ wanted: w, hits: hits.map((h) => h.name) }); continue; }
    if (hits.length === 0) { notFound.push(w); continue; }

    const hit = hits[0];
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    if (hit.taxRegime === regime) already.push(hit.name);
    else willChange.push(hit);
  }

  console.log(`\nSo'ralgan nom      : ${wanted.length}`);
  console.log(`Allaqachon ${regime.padEnd(8)}: ${already.length}`);
  console.log(`O'ZGARADI          : ${willChange.length}`);
  console.log(`Ikkilanish (tegilmaydi): ${ambiguous.length}`);
  console.log(`Topilmadi          : ${notFound.length}`);

  if (ambiguous.length) {
    console.log("\n── IKKILANISH — qaysi biri ekani noma'lum, tegilmadi ──");
    for (const a of ambiguous) console.log(`  "${a.wanted}" → ${a.hits.join("  ·  ")}`);
  }
  if (notFound.length) {
    console.log("\n── TOPILMADI ──");
    for (const n of notFound) console.log(`  ${n}`);
  }
  if (willChange.length) {
    console.log(`\n── O'ZGARADI (${willChange.length}) ──`);
    for (const c of willChange) {
      const arx = c.isActive ? "" : "  [ARXIV]";
      console.log(`  ${c.taxRegime.padEnd(9)} → ${regime}   ${c.name}  [${c.inn}]${arx}`);
    }
  }

  if (!apply) {
    console.log("\nQURUQ REJIM — hech narsa yozilmadi. Yozish uchun: --apply\n");
    return;
  }

  const res = await prisma.company.updateMany({
    where: { id: { in: willChange.map((c) => c.id) } },
    data: { taxRegime: regime as never },
  });
  console.log(`\n✅ ${res.count} ta firma "${regime}" ga o'tkazildi.\n`);
}

main()
  .catch((e) => { console.error("XATO:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
