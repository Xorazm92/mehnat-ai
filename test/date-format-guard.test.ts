/**
 * SANA VA SON FORMATI — YAGONA MANBA QO'RIQCHISI (M6.3 / D6).
 *
 * AGENTS.md: "Sana va son `lib/platform/format.ts` orqali". Qoida bor edi,
 * lekin uni majburlaydigan hech narsa yo'q edi va ikkita joy undan chetga
 * chiqib ketgan edi.
 *
 * NEGA BU HAQIQIY NUQSON, "uslub" emas. `Intl.DateTimeFormat("ru-RU", …)`
 * NAQSHNI ICU ma'lumotidan o'qiydi. `small-icu` bilan qurilgan Node'da faqat
 * `en-US` mavjud va format jimgina unga tushadi — server "09/06/2026, 14:30",
 * brauzer esa "06.09.2026, 14:30" chizadi. Mijoz komponentida bu React
 * gidratatsiyasini buzadi. Vaqt mintaqasini qadash (`timeZone`) bu muammoni
 * YECHMAYDI: u devor soatini to'g'rilaydi, naqshni emas.
 *
 * `lib/platform/format.ts` esa locale NOMLARIGA umuman tayanmaydi — `Intl`
 * dan faqat raqamli qismlarni o'qiydi (har ICU qurilishida bir xil) va oy
 * nomlarini o'zi beradi. Shuning uchun u yagona ruxsat etilgan joy.
 *
 * SOF TEST — baza kerak emas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { formatUzDateTime, formatNum } from "@/lib/platform/format";

const ROOT = process.cwd();
/** Foydalanuvchi ko'radigan kod. `scripts/` ATAYLAB tashqarida — u konsolga
 *  yozadigan tekshiruv vositasi, ekranga emas. */
const SCANNED = ["lib", "app", "components", "server", "bot"];

/** Yagona ruxsat etilgan joy — qoidaning O'ZI shu yerda yashaydi. */
const FORMAT_MODULE = "lib/platform/format.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.spec\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = SCANNED.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  path: relative(ROOT, f),
  text: readFileSync(f, "utf8"),
}));

/** Izoh qatorlarini tashlaydi — qoidani TUSHUNTIRGAN matn uni buzmaydi. */
function codeOnly(text: string): string {
  return text
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("formatUzDateTime — ICU qurilishidan mustaqil", () => {
  it("oy nomini O'ZI beradi, locale ma'lumotidan olmaydi", () => {
    // 2026-09-06T09:30:00Z → Toshkent (UTC+5) 14:30, 6-sentabr.
    const out = formatUzDateTime(new Date("2026-09-06T09:30:00.000Z"));
    expect(out).toBe("6-sen, 14:30");
    // Natijada `ru-RU`/`en-US` naqshining hech qanday izi yo'q: na "/",
    // na "." bilan ajratilgan sana, na AM/PM.
    expect(out).not.toMatch(/[/]|AM|PM/);
  });

  it("UTC serverida ham Toshkent devor soatini beradi", () => {
    // Prod server UTC da yuradi. 21:00Z → ertasi kun 02:00 Toshkentda:
    // sana ham SURILADI, ya'ni faqat soatni to'g'rilash yetmaydi.
    expect(formatUzDateTime(new Date("2026-09-06T21:00:00.000Z"))).toBe("7-sen, 02:00");
  });

  it("yaroqsiz sana yiqitmaydi", () => {
    expect(formatUzDateTime(new Date("chalkash"))).toBe("—");
    expect(formatUzDateTime(null)).toBe("—");
  });
});

describe("formatNum — ajratgich muhitga bog'liq emas", () => {
  it("har doim vergul, `LANG` qanday bo'lishidan qat'i nazar", () => {
    // `toLocaleString()` argumentsiz shakli aynan shu yerda buzilardi:
    // server `LANG=ru_RU` bo'lsa "1 234 567", `de_DE` bo'lsa "1.234.567".
    expect(formatNum(1_234_567)).toBe("1,234,567");
    expect(formatNum(-1_234_567)).toBe("-1,234,567");
    expect(formatNum(null)).toBe("0");
  });
});

describe("qo'riqchi — chetga chiqish qaytib kelmaydi", () => {
  it("`Intl.DateTimeFormat` faqat lib/platform/format.ts da", () => {
    const bad = files
      .filter((f) => f.path !== FORMAT_MODULE)
      .filter((f) => /Intl\.DateTimeFormat/.test(codeOnly(f.text)))
      .map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("`toLocaleDateString` / `toLocaleTimeString` hech qayerda yo'q", () => {
    const bad = files
      .filter((f) => /\.toLocale(Date|Time)String\s*\(/.test(codeOnly(f.text)))
      .map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("`toLocaleString()` ARGUMENTSIZ chaqirilmaydi", () => {
    // Aniq locale berilgan chaqiruvlar (`toLocaleString("en-US")`) bu
    // qo'riqchidan o'tadi: ular server ichidagi xato matnlarida qoladi va
    // alohida tozalanadi. Argumentsiz shakl esa server muhitiga bog'liq —
    // uni hech qanday sharoitda oqlab bo'lmaydi.
    const bad: string[] = [];
    for (const f of files) {
      for (const [i, line] of codeOnly(f.text).split("\n").entries()) {
        if (/\.toLocaleString\s*\(\s*\)/.test(line)) bad.push(`${f.path}:${i + 1}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
