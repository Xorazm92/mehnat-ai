import { describe, it, expect } from "vitest";
import {
  classifyCell,
  tally,
  settledRatio,
  matchesStatusFilter,
  parseStatusFilter,
  MATRIX_STATUS_FILTERS,
  type MatrixStatusFilter,
} from "./reportStatus";

describe("classifyCell", () => {
  it("bo'sh, '0', 'not_required' va 'topshirmaydi' — talab qilinmaydi", () => {
    for (const v of ["", "   ", "0", "not_required", "topshirmaydi", null, undefined]) {
      expect(classifyCell(v)).toBe("none");
    }
  });

  it("registr va bo'shliqqa bog'liq emas", () => {
    expect(classifyCell(" Kartoteka ")).toBe("blocked");
    expect(classifyCell("TOPSHIRILDI")).toBe("submitted");
  });

  it("nol hisobot IZOH emas — alohida holat", () => {
    // Regressiya: eski `stats.countValue` 'nol' ni `val.length > 1` tarmog'ida
    // ushlab, uni erkin matn (izoh) deb sanardi.
    expect(classifyCell("nol")).toBe("zero");
    expect(classifyCell("nol")).not.toBe("note");
  });

  it("tanilmagan matn — izoh", () => {
    expect(classifyCell("bank javob bermadi")).toBe("note");
  });

  it("har bir xom qiymat kutilgan holatga tushadi", () => {
    expect(classifyCell("+")).toBe("approved");
    expect(classifyCell("accepted")).toBe("approved");
    expect(classifyCell("-")).toBe("failed");
    expect(classifyCell("rad etildi")).toBe("failed");
    expect(classifyCell("oshibka")).toBe("error");
  });
});

describe("tally", () => {
  it("bo'sh kataklar maxrajga kirmaydi", () => {
    const t = tally(["", "0", "topshirmaydi", "+"]);
    expect(t.required).toBe(1);
    expect(t.settled).toBe(1);
    expect(t.outstanding).toBe(0);
  });

  it("nol hisobot BAJARILGAN deb sanaladi", () => {
    // Regressiya: eski `rowCompletion` 'nol' ni maxrajga qo'shib, suratga
    // qo'shmasdi — barcha hisobotini nol topshirgan firma 0% ko'rinardi.
    const t = tally(["nol", "nol", "nol"]);
    expect(t.zero).toBe(3);
    expect(settledRatio(t)).toBe(1);
  });

  it("qolgan ish to'g'ri ajratiladi", () => {
    const t = tally(["+", "topshirildi", "nol", "kartoteka", "-", "oshibka", "izoh matni"]);
    expect(t.required).toBe(7);
    expect(t.settled).toBe(3);
    expect(t.outstanding).toBe(4);
    expect(t.blocked).toBe(1);
    expect(t.note).toBe(1);
  });

  it("hech narsa talab qilinmasa ulush 0 (nolga bo'linish yo'q)", () => {
    expect(settledRatio(tally(["", "0"]))).toBe(0);
  });
});

describe("matchesStatusFilter", () => {
  const t = (vals: string[]) => tally(vals);

  it("'Barchasi' hamma qatorni o'tkazadi", () => {
    expect(matchesStatusFilter(t([]), "all")).toBe(true);
    expect(matchesStatusFilter(t(["-"]), "all")).toBe(true);
  });

  it("'Bajarilganlar' — qolgan ish yo'q va kamida bitta katak belgilangan", () => {
    expect(matchesStatusFilter(t(["+", "topshirildi", "nol"]), "done")).toBe(true);
    expect(matchesStatusFilter(t(["+", "-"]), "done")).toBe(false);
  });

  it("belgilanmagan firma na bajarilgan, na bajarilmagan", () => {
    // Aks holda 265 firmaning deyarli hammasi "Bajarilmaganlar" ga tushardi.
    const bosh = t(["", "0", "topshirmaydi"]);
    expect(matchesStatusFilter(bosh, "done")).toBe(false);
    expect(matchesStatusFilter(bosh, "pending")).toBe(false);
    expect(matchesStatusFilter(bosh, "all")).toBe(true);
  });

  it("'Bajarilmaganlar' izohli katakni ham qamrab oladi", () => {
    expect(matchesStatusFilter(t(["+", "bank javob bermadi"]), "pending")).toBe(true);
  });

  it("kartoteka / nol / izoh — mustaqil toifalar", () => {
    const row = t(["kartoteka", "nol", "izoh matni"]);
    expect(matchesStatusFilter(row, "kartoteka")).toBe(true);
    expect(matchesStatusFilter(row, "nol")).toBe(true);
    expect(matchesStatusFilter(row, "izoh")).toBe(true);
  });

  it("kartoteka bo'lgan qator 'Bajarilganlar' ga tushmaydi", () => {
    expect(matchesStatusFilter(t(["+", "kartoteka"]), "done")).toBe(false);
  });

  it("izoh tasdiqlansa qator 'Izohli' dan 'Bajarilganlar' ga o'tadi", () => {
    // Foydalanuvchi talabi: "izohga ptichka qo'yilsa avtomatik Bajarilganlarga
    // o'tib ketishi kerak". Alohida mexanizm yo'q — filtr joriy qiymatlardan
    // chiqariladi, shuning uchun katak "+" bo'lishi kifoya.
    const oldin = t(["+", "izoh matni"]);
    expect(matchesStatusFilter(oldin, "izoh")).toBe(true);
    expect(matchesStatusFilter(oldin, "done")).toBe(false);

    const keyin = t(["+", "+"]);
    expect(matchesStatusFilter(keyin, "izoh")).toBe(false);
    expect(matchesStatusFilter(keyin, "done")).toBe(true);
  });
});

describe("parseStatusFilter", () => {
  it("noma'lum qiymat 'all' ga tushadi", () => {
    for (const v of ["", null, undefined, "xyz", "DONE!"]) {
      expect(parseStatusFilter(v as string)).toBe("all");
    }
  });

  it("barcha e'lon qilingan filtrlar qayta o'qiladi (URL aylanishi)", () => {
    for (const o of MATRIX_STATUS_FILTERS) {
      expect(parseStatusFilter(o.value)).toBe(o.value);
    }
  });

  it("har bir filtr qiymati yagona", () => {
    const seen = new Set<MatrixStatusFilter>(MATRIX_STATUS_FILTERS.map((o) => o.value));
    expect(seen.size).toBe(MATRIX_STATUS_FILTERS.length);
  });
});

describe("nol hisobot — tizim bo'ylab bir xil qoida", () => {
  it("nol 'topshirildi' bilan bir xil bosqichda: yopilgan, lekin tasdiqlanmagan", () => {
    // Butun tizimda amal qiladigan qoida (2026-08 da qabul qilindi):
    //   nol == topshirildi  →  ish bajarilgan, tasdiq nazoratchida.
    // Shu bir xillik quyidagi joylarda ta'minlanadi:
    //   * lib/reportStatus.ts    — settled (matritsa foizi va filtri)
    //   * lib/obligationBridge.ts— cellValueToStatus → 'sent'
    //   * lib/kpiLogic.ts        — getReportStatusMultiplier → +1
    //   * server/cabinet.ts      — REPORT_PENDING
    expect(classifyCell("nol")).toBe("zero");
    expect(tally(["nol"]).settled).toBe(tally(["topshirildi"]).settled);
    expect(tally(["nol"]).outstanding).toBe(0);
  });

  it("nol 'shart emas' (0) DAN farq qiladi — maxrajga kiradi", () => {
    // lib/reportPermissions.ts CELL_ZERO_REPORT izohi: "0" = shart emas,
    // "nol" = bajarilgan ish. Ikkisi bir joyga tushsa matritsa yolg'on gapiradi.
    expect(tally(["nol"]).required).toBe(1);
    expect(tally(["0"]).required).toBe(0);
  });
});
