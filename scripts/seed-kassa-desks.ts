/**
 * KASSALARNI DICTIONARY DAN OCHISH
 * ================================
 * Manba: `Kassa.json` → `DICTIONARY` → `Kassalar` ustuni. Excelda 27 ta kassa
 * bor va ular uch guruhga bo'linadi:
 *
 *   • firma nomi bilan bir xil ("SOFYTEAM")  → o'z firma schyoti
 *     — buni `seed-own-firm-accounts.ts` ochadi, bu yerda TEGILMAYDI;
 *   • "BAND <ism>"                            → xodim kartasi
 *     — buni `import-transit.ts` reyestrdan ochadi, bu yerda TEGILMAYDI;
 *   • qolganlari                              → shu skript ochadi:
 *       "Cash (seyf)"     → naqd kassa
 *       "Plastik"         → plastik terminal
 *       "Ruslan grandga"  → maqsadli naqd kassa (grand pullari alohida turadi)
 *       "Arendaga"        → maqsadli naqd kassa (ijara uchun ajratilgan pul)
 *
 * NEGA MAQSADLI KASSALAR ALOHIDA: Excelda ular mustaqil ustun — pul jismonan
 * seyfda tursa ham, ajratilgani uchun umumiy naqd bilan aralashtirilmaydi.
 * Bittaga qo'shib yuborsak "seyfda qancha bor?" savoliga javob yolg'on bo'lardi.
 *
 *   npx tsx scripts/seed-kassa-desks.ts            # nima bo'lishini ko'rsatadi
 *   npx tsx scripts/seed-kassa-desks.ts --apply    # yozadi
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { requireImportFile } from "./import-source";
import fs from "node:fs";

/** Excel nomi → kanal turi. Ro'yxatda yo'q nom ochilmaydi (taxmin qilinmaydi). */
const DESKS: Record<string, { type: "cash" | "plastik"; note: string }> = {
  "cash (seyf)": { type: "cash", note: "Ofis seyfi — umumiy naqd." },
  plastik: { type: "plastik", note: "Plastik terminal orqali qabul qilingan to'lovlar." },
  "ruslan grandga": { type: "cash", note: "Maqsadli naqd: grand pullari." },
  arendaga: { type: "cash", note: "Maqsadli naqd: ijara uchun ajratilgan." },
};

const norm = (s: string) => s.toLowerCase().replace(/[‘’'`]/g, "").replace(/\s+/g, " ").trim();

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const dict = JSON.parse(fs.readFileSync(requireImportFile("Kassa.json"), "utf8"))["DICTIONARY"] ?? [];
  const names: string[] = Array.from(
    new Set(
      dict
        .map((r: Record<string, unknown>) => String(r["Kassalar"] ?? "").trim())
        .filter((v: string) => v.length > 0)
    )
  );

  const wanted = names.filter((n) => DESKS[norm(n)]);
  const skipped = names.filter((n) => !DESKS[norm(n)]);

  const existing = await prisma.disbursementChannel.findMany({
    where: { type: { in: ["cash", "plastik"] } },
    select: { id: true, label: true, type: true },
  });
  const byLabel = new Map(existing.map((c) => [norm(c.label), c]));

  console.log();
  console.log(`KASSALAR — "Kassa.json" DICTIONARY (${names.length} nom)`);
  console.log(`  shu skript qamrovida : ${wanted.length}`);
  console.log(`  boshqa skript ochadi : ${skipped.length} (firma schyoti / BAND karta)`);
  console.log();

  let created = 0;
  for (const name of wanted) {
    const spec = DESKS[norm(name)];
    const hit = byLabel.get(norm(name));
    console.log(`  ${hit ? "=" : "+"} ${name.padEnd(20)} ${spec.type}`);
    if (hit || !apply) {
      if (!hit) created++;
      continue;
    }
    await prisma.disbursementChannel.create({
      data: { type: spec.type, label: name, notes: spec.note },
    });
    created++;
  }

  console.log();
  if (!apply) {
    console.log(`Hech narsa yozilmadi (${created} ta yaratilardi). Yozish uchun: --apply`);
  } else {
    const total = await prisma.disbursementChannel.count({ where: { type: { in: ["cash", "plastik"] } } });
    console.log(`✓ Yaratildi: ${created} ta. Naqd/plastik kassalar jami: ${total}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
