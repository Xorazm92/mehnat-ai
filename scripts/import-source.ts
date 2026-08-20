/**
 * IMPORT MANBA PAPKASI — bitta joyda hal qilinadi.
 *
 * Korxona ichki hisob fayllari (tranzit daftari, kassa, qarzdorlik, reja/fakt)
 * repozitoriyga tushmaydi (`.gitignore`), shuning uchun ular mashinadan
 * mashinaga har xil papkada yotadi: dastlab `others_json_files/` edi, keyin
 * `kassa/` bo'lib keldi. Har skript o'z `path.join(cwd, "others_json_files")`
 * satrini olib yurgani uchun papka nomi o'zgarganda BESHTA skript birdan
 * "fayl topilmadi" deb to'xtardi.
 *
 * Endi qidiruv tartibi: `IMPORT_DIR` env → `kassa/` → `others_json_files/`.
 * Fayl qaysi papkada bo'lsa, o'sha yerdan o'qiladi (papkalar aralash bo'lsa ham).
 */
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  ...(process.env.IMPORT_DIR ? [process.env.IMPORT_DIR] : []),
  "kassa",
  "others_json_files",
];

function dirs(): string[] {
  return CANDIDATES.map((d) => path.resolve(process.cwd(), d)).filter((d) => fs.existsSync(d));
}

/** Fayl yo'li — topilmasa `null` (chaqiruvchi o'zi qaror qiladi). */
export function findImportFile(name: string): string | null {
  for (const d of dirs()) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Fayl yo'li — topilmasa tushunarli xato bilan to'xtaydi. */
export function requireImportFile(name: string): string {
  const p = findImportFile(name);
  if (p) return p;
  throw new Error(
    `"${name}" topilmadi. Qidirilgan papkalar: ${CANDIDATES.join(", ")} ` +
      `(boshqa joyda bo'lsa: IMPORT_DIR=/yo'l npx tsx ...)`
  );
}

/** Mavjud manba papkalari — diagnostika uchun. */
export function importDirs(): string[] {
  return dirs();
}

/**
 * Prefiks bo'yicha fayl nomi — nom oxirida sana bo'lgan fayllar uchun
 * ("Plan fact 2026.json", "FinCo Obed harajatlar avgust.json").
 * Qaytadi: FAYL NOMI (yo'l emas), chunki chaqiruvchi uni xabarlarda
 * ko'rsatadi va keyin `requireImportFile` ga uzatadi.
 */
export function findImportFileByPrefix(prefix: string): string | null {
  for (const d of dirs()) {
    const hit = fs.readdirSync(d).find((f) => f.startsWith(prefix));
    if (hit) return hit;
  }
  return null;
}
