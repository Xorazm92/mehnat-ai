// =====================================================
// BAZADAGI base64 FAYLLARNI DISKDAGI OMBORGA KO'CHIRISH
// =====================================================
//
// `ReportProof` prodda 128 MB edi (1 454 qator, ~90 KB/qator), chunki
// skrinshot `@db.Text` ustunida data-URL bo'lib yotardi va har `pg_dump`
// shuni ko'tarib yurardi. Ombor mazmun-adresli
// (`lib/engines/evidence/store.ts`), ya'ni bir xil baytlar bir xil faylga
// tushadi va takror yuklash bepul.
//
// IDEMPOTENT: havolasi bor qator o'tkazib yuboriladi, shuning uchun skriptni
// xohlagancha qayta yurgizsa bo'ladi.
//
//   npx tsx scripts/migrate-proofs-to-disk.ts            # dry-run
//   npx tsx scripts/migrate-proofs-to-disk.ts --apply
//   npx tsx scripts/migrate-proofs-to-disk.ts --apply --batch=50

import "./load-env";
import { prisma } from "@/lib/prisma";
import { evidenceStore, parseDataUrl, FILES_ROOT } from "@/lib/evidenceStore";

const APPLY = process.argv.includes("--apply");
const BATCH = Number(process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? 100);

const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";

/** Bitta data-URL ni omborga qo'yadi. Bo'sh/buzuq bo'lsa `null`. */
async function store(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const { bytes, mime } = parseDataUrl(dataUrl);
  if (bytes.byteLength === 0) return null;
  if (!APPLY) return "disk://(dry-run)";
  const { storageRef } = await evidenceStore.put(bytes, mime);
  return storageRef;
}

async function migrateProofs() {
  let moved = 0, skipped = 0, bytes = 0, broken = 0;

  for (;;) {
    const rows = await prisma.reportProof.findMany({
      where: { imageRef: null },
      select: { id: true, imageData: true, fileData: true },
      take: BATCH,
      orderBy: { submittedAt: "asc" },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      bytes += (r.imageData?.length ?? 0) + (r.fileData?.length ?? 0);
      const imageRef = await store(r.imageData);
      if (!imageRef) {
        broken++;
        // Havolasiz qolsa keyingi yugurishda YANA tanlanadi va sikl aylanardi.
        // Shuning uchun buzuq qator ham belgilanadi — ustun bo'shatilmaydi,
        // ya'ni ma'lumot yo'qolmaydi, faqat ko'chirish uni chetlab o'tadi.
        if (APPLY) {
          await prisma.reportProof.update({ where: { id: r.id }, data: { imageRef: "" } });
        }
        continue;
      }
      const fileRef = await store(r.fileData);

      if (APPLY) {
        await prisma.reportProof.update({
          where: { id: r.id },
          // `imageData: null` — ustun D1 da nullable qilindi, ya'ni
          // ko'chirilgan qator bo'shligini bo'sh satr bilan taqlid qilmaydi.
          data: { imageRef, fileRef, imageData: null, fileData: null },
        });
      }
      moved++;
    }

    if (!APPLY) { skipped = rows.length; break; } // dry-run: bitta partiya yetadi
  }

  return { moved, skipped, bytes, broken };
}

async function migrateDocuments() {
  let moved = 0, broken = 0, bytes = 0;

  for (;;) {
    const rows = await prisma.document.findMany({
      where: { storageRef: null },
      select: { id: true, fileData: true },
      take: BATCH,
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      bytes += r.fileData?.length ?? 0;
      const storageRef = await store(r.fileData);
      if (!storageRef) {
        broken++;
        if (APPLY) await prisma.document.update({ where: { id: r.id }, data: { storageRef: "" } });
        continue;
      }
      if (APPLY) {
        await prisma.document.update({
          where: { id: r.id },
          data: { storageRef, fileData: "" },
        });
      }
      moved++;
    }
    if (!APPLY) break;
  }

  return { moved, broken, bytes };
}

async function main() {
  console.log(`\n━━━ base64 → ombor ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ━━━`);
  console.log(`ombor ildizi: ${FILES_ROOT}\n`);

  const total = await prisma.reportProof.count({ where: { imageRef: null } });
  const totalDocs = await prisma.document.count({ where: { storageRef: null } });
  console.log(`ko'chirilmagan: ReportProof ${total} · Document ${totalDocs}`);

  // ALLAQACHON KO'CHIRILGAN — bu XATO EMAS. Skript idempotent, ya'ni uni
  // deploy'dan keyin ham, ikkinchi marta ham yurgizish normal. Bo'sh natijani
  // xato bilan tugatish CI yoki deploy zanjirini bekorga yiqitardi.
  if (total === 0 && totalDocs === 0) {
    console.log("\n✓ Ko'chiriladigan qator yo'q — hammasi allaqachon omborda.");
    return;
  }

  const p = await migrateProofs();
  console.log(`ReportProof: ko'chdi=${p.moved} buzuq=${p.broken} hajm=${mb(p.bytes)}`);

  const d = await migrateDocuments();
  console.log(`Document:    ko'chdi=${d.moved} buzuq=${d.broken} hajm=${mb(d.bytes)}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — hech narsa yozilmadi. Bajarish: --apply`);
    console.log(`DIQQAT: --apply dan OLDIN zaxira oling (bash scripts/backup.sh daily).`);
  } else {
    console.log(`\nTayyor. Endi VACUUM FULL "ReportProof"; bilan joyni bo'shating.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
