/**
 * SHABLON TO'PLAMI v2 (P4A).
 *
 * ⚠️ BU TESTLAR BAZA HOLATINI EMAS, REJANI TEKSHIRADI.
 *
 * Topshiriqdagi dastlabki holat "MOL_MULK_SOLIQ active=true,
 * lifecycle=active" ni tekshirishni so'ragan edi. Lekin o'sha topshiriqning
 * o'zi "`--apply` HECH QANDAY skriptda yurgizilmaydi" deydi — ya'ni bunday
 * qator bazada YO'Q va test kafolatli yiqilardi. Yoki test yashil bo'lishi
 * uchun `--apply` yurgizishga to'g'ri kelardi, bu esa taqiqni buzardi.
 *
 * Shuning uchun REJA sinaladi: `planTemplateSeed` sof funksiya, "skript nima
 * qiladi?" degan savolga bazaga tegmasdan javob beradi. Bu kuchliroq da'vo —
 * u faqat natijani emas, QARORNI tekshiradi (idempotentlik, yo'q shablonni
 * jimgina yaratmaslik, normativning manbasi).
 *
 * Oxirgi test bazaga qaraydi va rejaning bugungi haqiqatga mos kelishini
 * mahkamlaydi.
 */
import { describe, it, expect, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const {
  V2_ACTIVATE_CODES,
  V2_NEW_TEMPLATES,
  planTemplateSeed,
  normativeFor,
} = await import("@/lib/domains/accounting/deadlineTemplatesV2");
const { NORMATIVE_PRESETS } = await import("@/lib/domains/accounting/normativePresets");

afterAll(async () => {
  await prisma.$disconnect();
});

const draft = (code: string) => ({ code, lifecycle: "draft", active: true });
const live = (code: string) => ({ code, lifecycle: "active", active: true });
const find = (plan: ReturnType<typeof planTemplateSeed>, code: string) =>
  plan.find((p) => p.code === code);

describe("mavjud draftlar faollashadi", () => {
  it("uchalasi ham draft → active", () => {
    const plan = planTemplateSeed(V2_ACTIVATE_CODES.map(draft));
    for (const code of V2_ACTIVATE_CODES) {
      expect(find(plan, code)).toEqual({ kind: "activate", code, from: "draft" });
    }
  });

  it("allaqachon faol bo'lsa TEGILMAYDI — idempotent", () => {
    const plan = planTemplateSeed(V2_ACTIVATE_CODES.map(live));
    for (const code of V2_ACTIVATE_CODES) {
      expect(find(plan, code)?.kind).toBe("already_active");
    }
  });

  it("kutilgan shablon bazada yo'q bo'lsa — ogohlantirish, jimgina yaratish EMAS", () => {
    // Kod o'zgargan yoki baza boshqa holatda bo'lishi mumkin. Yaratib
    // yuborish `MULK`/`MOL_MULK_SOLIQ` dublikatini qaytarardi — P4A aynan
    // shundan qochish uchun qilingan.
    const plan = planTemplateSeed([]);
    expect(find(plan, "MOL_MULK_SOLIQ")).toEqual({ kind: "activate_missing", code: "MOL_MULK_SOLIQ" });
  });
});

describe("yangi shablonlar", () => {
  it("ikkalasi ham yaratiladi va `draft` bo'lib boshlaydi", () => {
    const plan = planTemplateSeed(V2_ACTIVATE_CODES.map(draft));
    for (const def of V2_NEW_TEMPLATES) {
      const step = find(plan, def.code);
      expect(step?.kind).toBe("create");
      // Universal (applicability bo'sh) shablon darhol `active` bo'lsa
      // 259 firmaning hammasiga tushardi — lifecycle darvozasi shuning uchun.
      expect(step).toMatchObject({ lifecycle: "draft" });
    }
  });

  it("kod allaqachon bo'lsa qayta yaratilmaydi", () => {
    const plan = planTemplateSeed([...V2_ACTIVATE_CODES.map(live), draft("STAT_BUXGALT")]);
    expect(find(plan, "STAT_BUXGALT")?.kind).toBe("exists");
  });

  it("normativ P1 jadvalidan keladi — ikkinchi raqam yozilmagan", () => {
    for (const def of V2_NEW_TEMPLATES) {
      expect(def.code in NORMATIVE_PRESETS).toBe(true);
      expect(normativeFor(def.code)).toBe(NORMATIVE_PRESETS[def.code]);
      expect(normativeFor(def.code)).toBe(60);
    }
  });

  it("davriylik enumga mos va muddat maydonlari anchor bilan izchil", () => {
    for (const def of V2_NEW_TEMPLATES) {
      expect(["monthly", "quarterly", "annual"]).toContain(def.periodicity);
      // `fixed_day_of_month` uchun `dueDay` MAJBURIY, aks holda `rawDueDate`
      // oyning 1-kuniga tushib qolardi.
      expect(def.anchorType).toBe("fixed_day_of_month");
      expect(def.dueDay).toBeGreaterThanOrEqual(1);
      expect(def.dueDay).toBeLessThanOrEqual(31);
      // Yillik shablonda oy ko'rsatilishi shart; choraklikda `null` —
      // u davrdan keyingi oyni oladi.
      if (def.periodicity === "annual") expect(def.dueMonth).not.toBeNull();
      else expect(def.dueMonth).toBeNull();
    }
  });
});

describe("bugungi baza holati", () => {
  it("reja haqiqatga mos: 3 tasi faollashadi, 2 tasi yaratiladi", async () => {
    const codes = [...V2_ACTIVATE_CODES, ...V2_NEW_TEMPLATES.map((t) => t.code)];
    const rows = await prisma.deadlineTemplate.findMany({
      where: { code: { in: codes } },
      select: { code: true, lifecycle: true, active: true },
    });
    const plan = planTemplateSeed(rows);
    // `--apply` yurgizilmagan, shuning uchun hech biri "already_active"
    // yoki "exists" bo'lmasligi kerak.
    expect(plan.filter((p) => p.kind === "activate_missing")).toEqual([]);
    expect(plan.filter((p) => p.kind === "activate")).toHaveLength(3);
    expect(plan.filter((p) => p.kind === "create")).toHaveLength(2);
  });
});
