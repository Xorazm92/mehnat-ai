import { describe, expect, it } from "vitest";
import { todayKey, groupDigits, ungroupDigits } from "./format";

// `todayKey` sana inputining standart qiymati — prod server UTC da yurgani
// uchun `toISOString().slice(0,10)` Toshkentning ertalabki 5 soatida
// KECCHA sanani berardi. Shu xato qaytalanmasligi uchun chegara holatlar
// aynan shu oynada sinovdan o'tadi.
describe("todayKey", () => {
  it("UTC kechqurun — Toshkentda allaqachon keyingi kun", () => {
    expect(todayKey(new Date("2026-08-23T20:30:00Z"))).toBe("2026-08-24");
  });

  it("yil chegarasida ham Toshkent devori soati bo'yicha", () => {
    expect(todayKey(new Date("2025-12-31T19:30:00Z"))).toBe("2026-01-01");
  });

  it("kun ichida UTC va Toshkent bir kun bo'lsa farqi yo'q", () => {
    expect(todayKey(new Date("2026-08-23T06:00:00Z"))).toBe("2026-08-23");
  });
});

describe("groupDigits / ungroupDigits", () => {
  it("minglik ajratgich bilan guruhlaydi va yechib oladi", () => {
    expect(groupDigits(1500000)).toBe("1 500 000");
    expect(groupDigits("1000")).toBe("1 000");
    expect(groupDigits("")).toBe("");
    expect(ungroupDigits("1 500 000")).toBe("1500000");
    expect(ungroupDigits("abc")).toBe("");
  });
});
