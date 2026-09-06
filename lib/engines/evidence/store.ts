// =====================================================
// EVIDENCE STORE — mazmun-adresli fayl ombori
// =====================================================
// DOMEN-NEYTRAL. Interfeys uch metoddan iborat, shuning uchun S3 keyinchalik
// 60 qatorlik adapter bo'ladi va chaqiruvchilar o'zgarmaydi.
//
// Nega hozir S3/MinYO emas: bugun 8 ta dalil fayli bor. Konteyner, sirlar
// rotatsiyasi va ikkinchi zaxira yo'li — nol foyda evaziga uchta yangi nosozlik
// manbai. Lekin base64'ni `pg_dump` dan chiqarish ALBATTA arziydi:
// `ReportProof.imageData` bazaning ichida data-URL sifatida yotibdi.
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface StoredEvidence {
  storageRef: string;
  sha256: string;
  byteSize: number;
}

export interface EvidenceStore {
  put(bytes: Buffer, mime: string): Promise<StoredEvidence>;
  get(storageRef: string): Promise<{ bytes: Buffer; byteSize: number }>;
  head(storageRef: string): Promise<{ sha256: string; byteSize: number } | null>;
}

/** `disk://2026/08/<64 hex>.<ext>` — boshqa hech qanday shakl qabul qilinmaydi. */
const REF_RE = /^disk:\/\/(\d{4})\/(\d{2})\/([a-f0-9]{64})\.([a-z0-9]{2,5})$/;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extForMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase().split(";")[0].trim()] ?? "bin";
}

export function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * `storageRef` → mutlaq yo'l.
 *
 * Path traversal himoyasi MAJBURIY va u ikki qatlamli: avval qat'iy regex
 * (`..`, mutlaq yo'l, `%2e%2e` — hech biri mos kelmaydi), keyin yechilgan
 * yo'lning ildiz ichida ekanini tekshirish. Bitta qatlam yetarli emas —
 * regex kelajakda yumshatilishi mumkin, ikkinchi tekshiruv esa qolаdi.
 */
export function refToPath(root: string, storageRef: string): string {
  const m = REF_RE.exec(storageRef);
  if (!m) throw new Error(`Yaroqsiz storageRef: ${storageRef}`);
  const [, yyyy, mm, hash, ext] = m;
  const abs = resolve(join(root, yyyy, mm, `${hash}.${ext}`));
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + "/")) {
    throw new Error("storageRef ildizdan tashqariga chiqdi");
  }
  return abs;
}

export function createDiskEvidenceStore(root: string, now: () => Date = () => new Date()): EvidenceStore {
  return {
    async put(bytes, mime) {
      const sha256 = sha256Of(bytes);
      const byteSize = bytes.byteLength;
      const d = now();
      const yyyy = String(d.getUTCFullYear());
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const storageRef = `disk://${yyyy}/${mm}/${sha256}.${extForMime(mime)}`;

      const path = refToPath(root, storageRef);
      await mkdir(dirname(path), { recursive: true });
      // Mazmun-adresli: bir xil baytlar bir xil yo'l. Qayta yozish bezarar,
      // ya'ni bir skrinshotni ikki marta yuklash bepul.
      await writeFile(path, bytes);
      return { storageRef, sha256, byteSize };
    },

    async get(storageRef) {
      // refToPath natijasi storageRef'dan deterministik, ammo bundler statik
      // tahlil ko'rmaydi — Turbopack butun loyihani nft trace'ga qo'shadi.
      // Prodda output: "standalone" yoqilmagan, nft ishlatilmaydi; bu yo'l
      // moliyaviy-muvofiqlik dalillarini o'qiydi, suppress qilinmaydi.
      const path = refToPath(root, storageRef);
      const bytes = await readFile(path);
      return { bytes, byteSize: bytes.byteLength };
    },

    async head(storageRef) {
      // Yuqoridagi sabab: statik tahlil ko'rmaydigan disk-yo'li, ataylab
      // bundler trace'ga qo'shmaslik uchun izohsiz.
      const path = refToPath(root, storageRef);
      try {
        const s = await stat(path);
        const m = REF_RE.exec(storageRef);
        return { sha256: m![3], byteSize: s.size };
      } catch {
        return null;
      }
    },
  };
}
