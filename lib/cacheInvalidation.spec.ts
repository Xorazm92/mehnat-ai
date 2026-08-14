import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * KESHNI BEKOR QILISH — mutatsiyadan keyin O'Z YOZGANINGNI ko'rish.
 *
 * Prod xatosi: nazoratchi matritsada katakni tasdiqlardi, ✅ chiqardi, bir
 * necha soniyadan keyin belgi YO'QOLARDI. "Nol hisobot (Ø)" ham xuddi shunday
 * uchib ketardi.
 *
 * Sabab — Next 16 dagi `revalidateTag(tag, "max")` semantikasi (hujjatdan):
 * u keshni O'CHIRMAYDI, "eskirgan" deb belgilaydi va keyingi so'rovga
 * stale-while-revalidate bo'yicha ESKI ma'lumotni beradi. O'qish qatlami
 * (`lib/cached-queries.ts`) 5 daqiqalik keshda, sahifa esa har 15 soniyada
 * `router.refresh()` qiladi — natijada yozuvdan keyingi birinchi yangilanish
 * katakni eski holatiga qaytarardi.
 *
 * `updateTag(tag)` — aynan shu holat uchun: keshni darhol muddati o'tgan deb
 * belgilaydi, keyingi so'rov yangi ma'lumotni kutadi.
 *
 * Shuning uchun server amallarida `revalidateTag` ISHLATILMAYDI.
 * (`revalidatePath` ta'sir qilmaydi — u boshqa vazifa bajaradi.)
 */

const SERVER_DIR = join(process.cwd(), "server");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("server amallarida kesh bekor qilish", () => {
  const files = walk(SERVER_DIR);

  it("`revalidateTag` ishlatilmaydi — `updateTag` ishlatiladi", () => {
    const offenders = files
      .filter((f) => /\brevalidateTag\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(process.cwd() + "/", ""));

    expect(
      offenders,
      "`revalidateTag(tag, \"max\")` eski ma'lumotni qaytaradi — foydalanuvchi o'z o'zgarishini yo'qotadi. `updateTag(tag)` ishlating.",
    ).toEqual([]);
  });

  it("matritsa yozuvi `operations` keshini yangilaydi", () => {
    const ops = readFileSync(join(SERVER_DIR, "operations.ts"), "utf8");
    expect(ops).toMatch(/updateTag\("operations"\)/);
    const proofs = readFileSync(join(SERVER_DIR, "proofs.ts"), "utf8");
    expect(proofs).toMatch(/updateTag\("operations"\)/);
  });
});
