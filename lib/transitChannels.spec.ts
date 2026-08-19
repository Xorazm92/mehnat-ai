// Kassa kanal turlarining sof testi (CI yuritadi).
//
// Nima uchun: `own_bank` FANTOM TUR bo'lib yurgan edi — kod uni kutardi,
// bazada esa `own_firm_account` yozilgan. Natijada 10 ta bank hisobi kanalini
// UI orqali tahrirlab bo'lmasdi va ular yorliqsiz ko'rinardi. Bunday
// nomuvofiqlik jimgina yashaydi, shuning uchun u testda qulflanadi.
import { describe, it, expect } from "vitest";
import {
  CHANNEL_TYPES,
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
  normalizeChannelType,
} from "@/lib/transitChannels";

describe("kanal turlari", () => {
  it("bazadagi haqiqiy turlarni qamraydi", () => {
    // Prodda mavjud ikki tur — ular ro'yxatda BO'LISHI SHART, aks holda
    // `upsertChannel` o'sha kanallarni tahrirlashni rad etadi.
    expect(CHANNEL_TYPES).toContain("own_firm_account");
    expect(CHANNEL_TYPES).toContain("employee_card");
    // Auditda yetishmayotgan deb ko'rsatilgan ikkitasi.
    expect(CHANNEL_TYPES).toContain("cash");
    expect(CHANNEL_TYPES).toContain("plastik");
  });

  it("har turning yorlig'i bor", () => {
    for (const t of CHANNEL_TYPES) {
      expect(CHANNEL_TYPE_LABELS[t], `${t} uchun yorliq yo'q`).toBeTruthy();
    }
  });

  it("tartib ro'yxati to'liq va takrorsiz", () => {
    expect([...CHANNEL_TYPE_ORDER].sort()).toEqual([...CHANNEL_TYPES].sort());
    expect(new Set(CHANNEL_TYPE_ORDER).size).toBe(CHANNEL_TYPE_ORDER.length);
  });
});

describe("normalizeChannelType", () => {
  it("kanonik turni o'zgartirmaydi", () => {
    expect(normalizeChannelType("own_firm_account")).toBe("own_firm_account");
    expect(normalizeChannelType("cash")).toBe("cash");
  });

  // Eski nom saqlanadi: prodda bunday qator yo'q, lekin o'qish yo'li
  // yiqilmasligi kerak.
  it("eski `own_bank` nomini kanonikga keltiradi", () => {
    expect(normalizeChannelType("own_bank")).toBe("own_firm_account");
  });

  // ENG MUHIMI: noma'lum tur JIM YUTILMAYDI. Ilgari `else` shoxi uni
  // "xodim kartasi" ga aylantirardi va qoldiq noto'g'ri guruhda ko'rinardi.
  it("noma'lum turni kartaga aylantirmaydi", () => {
    expect(normalizeChannelType("qandaydir")).toBeNull();
    expect(normalizeChannelType("")).toBeNull();
  });
});
