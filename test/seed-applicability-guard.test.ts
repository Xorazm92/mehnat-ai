/**
 * SEED ↔ MANIFEST QO'RIQCHISI.
 *
 * `scripts/seed-deadline-templates.ts` har run'da shablonning applicability
 * qatorlarini `deleteMany` bilan QAYTA QURADI. Ya'ni prodga qo'lda (yoki
 * migratsiya orqali) qo'shilgan qoida seed'da ham yozilmagan bo'lsa,
 * keyingi `deploy.sh` uni JIMGINA o'chirib yuboradi.
 *
 * 2026-09-07 da aynan shu holat yuz berishiga bir qadam qolgandi: 4 ta
 * `service_key` qoidasi prodga qo'llandi, seed'da esa yo'q edi.
 *
 * Bu test ikkovini bog'lab qo'yadi: manifestda `confirmed: true` bo'lgan har
 * bir moslik seed ro'yxatida ham bo'lishi SHART.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMappingManifest } from "@/lib/domains/accounting/mappingManifest";

const ROOT = resolve(__dirname, "..");
const SEED_SRC = readFileSync(resolve(ROOT, "scripts/seed-deadline-templates.ts"), "utf8");
const manifest = parseMappingManifest(
  JSON.parse(readFileSync(resolve(ROOT, "scripts/data/service-key-mappings.json"), "utf8")),
);

/** Seed manbaidan bitta shablon ta'rifining matnini kesib oladi. */
function seedBlockFor(code: string): string | null {
  const start = SEED_SRC.indexOf(`{ code: "${code}",`);
  if (start === -1) return null;
  const next = SEED_SRC.indexOf('{ code: "', start + 10);
  return SEED_SRC.slice(start, next === -1 ? SEED_SRC.length : next);
}

const confirmed = manifest.mappings.filter((m) => m.confirmed === true);

describe("seed ↔ manifest", () => {
  it("tasdiqlangan moslik bor (aks holda test hech narsani qo'riqlamaydi)", () => {
    expect(confirmed.length).toBeGreaterThan(0);
  });

  it.each(confirmed)(
    "$code — service_key=$matrixKey qoidasi seed'da ham yozilgan",
    ({ code, matrixKey }) => {
      const block = seedBlockFor(code);
      expect(block, `${code} seed ro'yxatida topilmadi`).not.toBeNull();
      expect(
        block!.includes(`criteriaValue: "${matrixKey}"`),
        `${code}: seed'da service_key="${matrixKey}" yo'q — keyingi deploy prodagi qoidani o'chiradi`,
      ).toBe(true);
    },
  );

  it.each(manifest.mappings.filter((m) => m.confirmed !== true))(
    "$code — tasdiqlanmagan, seed'da service_key qoidasi BO'LMASLIGI kerak",
    ({ code, matrixKey }) => {
      const block = seedBlockFor(code);
      if (!block) return; // seed ro'yxatida yo'q — tekshiradigan narsa yo'q
      expect(
        block.includes(`criteriaValue: "${matrixKey}"`),
        `${code}: manifestda tasdiqlanmagan, lekin seed uni qo'shadi`,
      ).toBe(false);
    },
  );

  it("seed hali ham applicability'ni qayta quradi — qo'riqchining sababi yo'qolmagan", () => {
    // Bu qator yo'qolsa qo'riqchi keraksiz bo'lib qoladi va testni
    // o'chirish mumkin. Turgan ekan — manifest bilan bog'liqlik SHART.
    expect(SEED_SRC).toContain("templateApplicability.deleteMany({ where: { templateId: tpl.id } })");
  });
});
