// Dalil shartnomasi — vakolat siyosati va sxema.
// ADR-0008: import taklif qiladi, hech qachon tasdiqlamaydi.
import { describe, it, expect } from "vitest";
import {
  claimSchema,
  maxStatusForConfidence,
  proposedStatus,
  claimIdempotencyKey,
  rankOf,
  type EvidenceClaim,
} from "@/lib/engines/evidence/claim";

const base = (over: Partial<EvidenceClaim> = {}): EvidenceClaim =>
  ({
    schemaVersion: 1,
    subject: { kind: "inn", inn: "301234567" },
    obligation: { kind: "templateCode", code: "QQS_DECL" },
    period: "2026-07",
    claim: "submitted",
    occurredAt: "2026-07-20T09:00:00.000Z",
    confidence: 0.4,
    provenance: { sourceSystem: "excel", rawHash: "abc123", profileId: "p1" },
    ...over,
  }) as EvidenceClaim;

describe("maxStatusForConfidence — vakolat, aniqlik emas", () => {
  it("vakolatli organ accepted qo'ya oladi", () => {
    expect(maxStatusForConfidence(1)).toBe("accepted");
  });

  it("harakatni ko'rgan tizim faqat sent gacha", () => {
    expect(maxStatusForConfidence(0.7)).toBe("sent");
    expect(maxStatusForConfidence(0.99)).toBe("sent");
  });

  it("operatorning jadvali ham faqat sent gacha", () => {
    expect(maxStatusForConfidence(0.4)).toBe("sent");
  });

  it("past ishonch hech narsani siljitmaydi", () => {
    expect(maxStatusForConfidence(0.39)).toBe("planned");
    expect(maxStatusForConfidence(0)).toBe("planned");
  });

  it("buzuq qiymat xavfsiz tarafga tushadi", () => {
    expect(maxStatusForConfidence(NaN)).toBe("planned");
  });
});

describe("proposedStatus — da'vo va vakolat minimumi", () => {
  it("Excel 'accepted' desa ham sent'dan oshmaydi", () => {
    // ADR-0008 ning butun mag'zi: 200 qatorli jadval 200 majburiyatni
    // tasdiqlay olmaydi.
    expect(proposedStatus("accepted", 0.4)).toBe("sent");
  });

  it("Soliq kvitansiyasi accepted qo'yadi", () => {
    expect(proposedStatus("accepted", 1)).toBe("accepted");
  });

  it("da'vo vakolatdan past bo'lsa — da'vo yutadi", () => {
    expect(proposedStatus("prepared", 1)).toBe("ready");
  });

  it("rad etish vakolat bilan cheklanmaydi — u ilgarilash emas", () => {
    expect(proposedStatus("rejected", 0.4)).toBe("rejected");
    expect(proposedStatus("not_applicable", 0.4)).toBe("cancelled");
  });

  it("'paid' accepted'ni nazarda tutadi, lekin shifti bor", () => {
    expect(proposedStatus("paid", 0.7)).toBe("sent");
    expect(proposedStatus("paid", 1)).toBe("accepted");
  });
});

describe("rankOf", () => {
  it("workflow tartibi", () => {
    expect(rankOf("planned")).toBeLessThan(rankOf("sent"));
    expect(rankOf("sent")).toBeLessThan(rankOf("accepted"));
  });
  it("ro'yxatda yo'q status −1", () => {
    expect(rankOf("rejected")).toBe(-1);
  });
});

describe("claimSchema", () => {
  it("to'g'ri da'voni qabul qiladi", () => {
    expect(claimSchema.safeParse(base()).success).toBe(true);
  });

  it("uch xil subyekt varianti", () => {
    for (const subject of [
      { kind: "inn", inn: "301234567" },
      { kind: "externalOrgId", externalOrgId: "1c-guid" },
      { kind: "companyId", companyId: "00000000-0000-4000-8000-000000000000" },
    ] as const) {
      expect(claimSchema.safeParse(base({ subject })).success, subject.kind).toBe(true);
    }
  });

  it("confidence 0..1 dan tashqarida rad etiladi", () => {
    expect(claimSchema.safeParse(base({ confidence: 1.5 })).success).toBe(false);
    expect(claimSchema.safeParse(base({ confidence: -0.1 })).success).toBe(false);
  });

  it("rawHash majburiy — usiz idempotentlik yo'q", () => {
    const bad = base();
    // @ts-expect-error — qasddan buzamiz
    delete bad.provenance.rawHash;
    expect(claimSchema.safeParse(bad).success).toBe(false);
  });

  it("noma'lum manba QABUL qilinadi — engine manbalar ro'yxatini bilmaydi", () => {
    // Modda 5: yangi manba qo'shish engine'ni o'zgartirmasligi kerak.
    // Ruxsat etilgan manbalar `OneCConnection.kind` da ro'yxatdan o'tadi.
    expect(claimSchema.safeParse(base({ provenance: { sourceSystem: "sap", rawHash: "x" } })).success).toBe(true);
  });

  it("bo'sh manba rad etiladi", () => {
    expect(claimSchema.safeParse(base({ provenance: { sourceSystem: "", rawHash: "x" } })).success).toBe(false);
  });

  it("occurredAt ISO bo'lishi shart", () => {
    expect(claimSchema.safeParse(base({ occurredAt: "2026-07-20" })).success).toBe(false);
  });
});

describe("claimIdempotencyKey", () => {
  it("bir xil qator — bir xil kalit", () => {
    expect(claimIdempotencyKey(base())).toBe(claimIdempotencyKey(base()));
  });

  it("tuzatilgan qator — YANGI kalit", () => {
    // Faylni qayta yuklash: tegilmagan qatorlar dedup bo'ladi, tuzatilgani
    // yangi da'vo sifatida tushadi. Qisman xatolikdan tiklanish shu.
    const a = claimIdempotencyKey(base());
    const b = claimIdempotencyKey(base({ provenance: { sourceSystem: "excel", rawHash: "def456", profileId: "p1" } }));
    expect(a).not.toBe(b);
  });

  it("manba kalitga kiradi — 1C va Excel to'qnashmaydi", () => {
    const excel = claimIdempotencyKey(base());
    const onec = claimIdempotencyKey(base({ provenance: { sourceSystem: "1c", rawHash: "abc123", profileId: "p1" } }));
    expect(excel).not.toBe(onec);
  });
});
