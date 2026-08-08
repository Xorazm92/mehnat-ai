/**
 * 1C REESTRIDAGI STIRGA MOSLASH.
 *
 * Muammo: `scripts/import-contracts.ts` reestr qatorini firmaga QAT'IY `inn`
 * bo'yicha bog'laydi. Bir nechta firmada ASRO'dagi STIR 1C dagidan farq qiladi,
 * shuning uchun ularning shartnomasi hech qachon yaratilmagan — 168 qatordan
 * 47 tasi "mos firma topilmadi" ga tushardi.
 *
 * Quyidagi juftliklar nom bo'yicha topilgan va SHARTNOMA SUMMASI bo'yicha
 * mustaqil tasdiqlangan: bazadagi `contractAmount` reestrdagi "Сумма" bilan
 * aynan bir xil. Shu sabab ular ishonchli hisoblanadi.
 *
 *   npx tsx scripts/fix-company-inn.ts            # nima o'zgarishini ko'rsatadi
 *   npx tsx scripts/fix-company-inn.ts --apply    # yozadi
 *
 * Keyin shartnomalar yaratilishi uchun:
 *   npx tsx scripts/import-contracts.ts --apply
 *
 * Idempotent: STIR allaqachon yangi qiymatda bo'lsa, o'tkazib yuboradi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";

interface Fix {
  /** Hozirgi (noto'g'ri) STIR. */
  from: string;
  /** 1C reestridagi STIR. */
  to: string;
  /** Xavfsizlik uchun: firma nomi shuni o'z ichiga olishi shart. */
  nameLike: string;
  /** Reestrdagi summa — bazadagi `contractAmount` bilan mos kelgani tasdiq. */
  registryAmount: number;
  sourceFile: string;
}

const FIXES: Fix[] = [
  { from: "205150295", to: "303240349", nameLike: "NIGINA FARM", registryAmount: 6_000_000, sourceFile: "barokat.json" },
  { from: "310310683", to: "310683277", nameLike: "RONICS ENGINEERING TEAM", registryAmount: 700_000, sourceFile: "council.json" },
  { from: "310786797", to: "306951197", nameLike: "LIDER ELITE", registryAmount: 3_000_000, sourceFile: "powerful.json" },
  { from: "306672520", to: "309849898", nameLike: "HI-TECH ORIENT MED-BUSINESS", registryAmount: 4_000_000, sourceFile: "seven.json" },
  { from: "311074535", to: "311035535", nameLike: "LOGAN", registryAmount: 6_000_000, sourceFile: "toolstreak.json" },
  // ⚠️  SHIRIN XK (200454180 → 202536307) ATAYLAB QO'SHILMAGAN.
  // Bazada 500 000, reestrda 2 500 000 — summa mos kelmaydi, ya'ni bu boshqa
  // firma bo'lishi mumkin. Ustiga ustak reestrdagi "SHIRIN SUPER TAOM"
  // (308543061) ham shu nomga o'xshaydi. Qo'lda aniqlangach qo'shilsin.
];

const som = (n: number) => n.toLocaleString("en-US");

async function main() {
  const apply = process.argv.includes("--apply");

  let willChange = 0;
  let alreadyDone = 0;
  let blocked = 0;

  for (const fix of FIXES) {
    const label = fix.nameLike.padEnd(32);

    // Allaqachon tuzatilganmi?
    const atTarget = await prisma.company.findFirst({
      where: { inn: fix.to },
      select: { id: true, name: true },
    });
    if (atTarget) {
      if (atTarget.name.toUpperCase().includes(fix.nameLike.toUpperCase())) {
        console.log(`= ${label} allaqachon ${fix.to}`);
        alreadyDone++;
      } else {
        // Boshqa firma bu STIRni egallab turibdi — tegmaymiz.
        console.log(`✗ ${label} ${fix.to} BAND: "${atTarget.name}"`);
        blocked++;
      }
      continue;
    }

    const company = await prisma.company.findFirst({
      where: { inn: fix.from },
      select: { id: true, name: true, contractAmount: true },
    });
    if (!company) {
      console.log(`✗ ${label} ${fix.from} STIRli firma topilmadi`);
      blocked++;
      continue;
    }

    // Nom mosligi — noto'g'ri bazada ishlab yuborishdan himoya.
    if (!company.name.toUpperCase().includes(fix.nameLike.toUpperCase())) {
      console.log(`✗ ${label} nom mos emas: "${company.name}"`);
      blocked++;
      continue;
    }

    const current = Number(company.contractAmount ?? 0);
    const amountOk = current === fix.registryAmount;
    console.log(
      `${apply ? "→" : "·"} ${label} ${fix.from} → ${fix.to}   ` +
        `summa ${som(current)} ${amountOk ? "= reestr ✓" : `≠ reestr ${som(fix.registryAmount)} ⚠`}`
    );

    if (apply) {
      await prisma.company.update({ where: { id: company.id }, data: { inn: fix.to } });
    }
    willChange++;
  }

  console.log(`\n${"─".repeat(64)}`);
  if (apply) {
    console.log(`✓ ${willChange} ta firma STIRi yangilandi (${alreadyDone} ta allaqachon, ${blocked} ta o'tkazildi).`);
    console.log("\nEndi shartnomalarni yarating:");
    console.log("   npx tsx scripts/import-contracts.ts --apply");
  } else {
    console.log(`${willChange} ta o'zgaradi, ${alreadyDone} ta allaqachon to'g'ri, ${blocked} ta o'tkaziladi.`);
    console.log("Yozish uchun: npx tsx scripts/fix-company-inn.ts --apply");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
