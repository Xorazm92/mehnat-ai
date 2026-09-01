// Dalil/hujjat fayllari uchun YAGONA ombor namunasi.
//
// NEGA bu fayl bor: `lib/engines/evidence/store.ts` sof funksiya —
// u ildiz katalogini bilmaydi. Ildiz esa butun ilova uchun bitta bo'lishi
// kerak, aks holda yozuvchi bilan o'quvchi boshqa katalogga qarardi.
//
// Fayllar endi Postgres ichida emas, shuning uchun ZAXIRA IKKI QISMLI:
// `pg_dump` + shu katalogning arxivi. `scripts/backup.sh` ikkalasini ham oladi.
import { createDiskEvidenceStore } from "@/lib/engines/evidence/store";

export const FILES_ROOT = process.env.ASRO_FILES_ROOT ?? "./storage/files";

export const evidenceStore = createDiskEvidenceStore(FILES_ROOT);

/** `data:<mime>;base64,...` → baytlar va mime. Boshqa shakl qabul qilinmaydi. */
export function parseDataUrl(dataUrl: string): { bytes: Buffer; mime: string } {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("Fayl formati noto'g'ri (data URL kutilgan)");
  }
  const header = dataUrl.slice(5, comma); // "image/jpeg;base64"
  const mime = header.split(";")[0] || "application/octet-stream";
  return { bytes: Buffer.from(dataUrl.slice(comma + 1), "base64"), mime };
}

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * O'QISH IKKI YO'LLI: avval ombor havolasi, bo'lmasa eski base64 ustuni.
 *
 * Ko'chirish (`scripts/migrate-proofs-to-disk.ts`) bosqichma-bosqich ketadi va
 * shu orada ikkala shakl yonma-yon yashaydi. Ikkinchi yo'l ustunlar tashlangach
 * o'chadi — bir hafta prodda kuzatilgandan keyin.
 */
export async function readStoredFile(
  storageRef: string | null | undefined,
  legacyDataUrl: string | null | undefined
): Promise<{ bytes: Buffer; mime: string | null } | null> {
  if (storageRef) {
    const { bytes } = await evidenceStore.get(storageRef);
    const ext = storageRef.split(".").pop() ?? "";
    return { bytes, mime: EXT_MIME[ext] ?? null };
  }
  if (legacyDataUrl) {
    const { bytes, mime } = parseDataUrl(legacyDataUrl);
    return { bytes, mime };
  }
  return null;
}
