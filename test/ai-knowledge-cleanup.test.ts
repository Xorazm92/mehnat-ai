/**
 * BILIM BAZASI YOLG'ON GAPIRMASIN (M5.1).
 *
 * `lib/ai/knowledge.ts` "Rentabellik moduli" ni tushuntirardi:
 * "Margin = Tushum − TimeEntry × stavka". Uchala qismi ham MAVJUD EMAS —
 * `server/profitability.ts` modul konsolidatsiyasida o'chirilgan (ADR-0016),
 * `TimeEntry` va `EmployeeCostRate` sxemada yo'q, ball esa ICEBOX da
 * (ADR-0010: tannarxsiz marja = daromad, ya'ni yolg'on raqam).
 *
 * Ya'ni AI mavjud bo'lmagan modulni ishonch bilan tushuntirardi — 4-va'daning
 * eng yomon buzilishi: raqam ham, tushuntirish ham to'qima.
 *
 * Bu test bilim bazasini SXEMAGA bog'laydi: modul qaytsa u ham qaytadi,
 * qaytmaguncha esa AI u haqda gapira olmaydi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KNOWLEDGE_CHUNKS, ASSISTANT_SYSTEM_INSTRUCTION, heuristicReply } from "@/lib/ai/knowledge";

describe("bilim bazasida o'chirilgan modul yo'q", () => {
  it("hech bir bo'lakda `TimeEntry` yoki marja formulasi yo'q", () => {
    const all = KNOWLEDGE_CHUNKS.map((c) => `${c.title} ${c.content}`).join("\n");
    expect(all).not.toMatch(/TimeEntry/i);
    expect(all).not.toMatch(/Margin\s*=/i);
    expect(all).not.toMatch(/Rentabellik modulining mantiqi/i);
  });

  it("tizim ko'rsatmasi rentabellikni MAVJUD modul sifatida sanamaydi", () => {
    // So'zning o'zi qolishi mumkin — lekin faqat "yo'q" degan ma'noda.
    expect(ASSISTANT_SYSTEM_INSTRUCTION).not.toMatch(/TimeEntry/i);
    expect(ASSISTANT_SYSTEM_INSTRUCTION).not.toMatch(/modullar \([^)]*Rentabellik/i);
    expect(ASSISTANT_SYSTEM_INSTRUCTION).toMatch(/HOZIRDA YO'Q|hozircha mavjud emas/i);
  });

  it("kalitsiz fallback ham modul yo'qligini aytadi, formulani emas", () => {
    const reply = heuristicReply("rentabellik qanday hisoblanadi?");
    expect(reply).not.toMatch(/TimeEntry/i);
    expect(reply).toMatch(/yo'q/i);
  });

  it("da'vo sxema bilan bog'langan — `TimeEntry` haqiqatan yo'q", () => {
    // Agar model qaytsa bu test qulaydi va bilim bazasini yangilashga
    // majbur qiladi — ya'ni ikkisi bir-biridan ajralib ketmaydi.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).not.toMatch(/^model TimeEntry\b/m);
    expect(schema).not.toMatch(/^model EmployeeCostRate\b/m);
  });
});
