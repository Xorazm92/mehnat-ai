import { describe, it, expect } from "vitest";
import { buildMobileLayout, roleOf, type MobileLayoutColumn } from "./mobileCardLayout";

const col = (key: string, extra: Partial<MobileLayoutColumn> = {}): MobileLayoutColumn => ({
  key,
  ...extra,
});

describe("roleOf", () => {
  it("aniq maslahat hamma narsadan ustun", () => {
    expect(roleOf(col("actions", { mobile: "wide" }), 0)).toBe("wide");
    expect(roleOf(col("name", { sticky: true, mobile: "hide" }), 0)).toBe("hide");
  });

  it("maslahatsiz: yopishqoq ustun sarlavha, actions amal qatori", () => {
    expect(roleOf(col("name", { sticky: true }), 3)).toBe("title");
    expect(roleOf(col("actions"), 5)).toBe("actions");
  });

  it("yopishqoq ustun bo'lmasa birinchi ustun sarlavha bo'ladi", () => {
    expect(roleOf(col("date"), 0)).toBe("title");
    expect(roleOf(col("amount"), 1)).toBe("wide");
  });
});

describe("buildMobileLayout", () => {
  it("odatiy jadval: birinchi ustun sarlavha, actions pastda", () => {
    const layout = buildMobileLayout([
      col("name"),
      col("inn"),
      col("amount", { numeric: true }),
      col("actions"),
    ]);
    expect(layout.title?.key).toBe("name");
    expect(layout.actions?.key).toBe("actions");
    expect(layout.fields.map((f) => f.column.key)).toEqual(["inn", "amount"]);
  });

  it("raqamli ustun tor, matnli ustun keng bo'ladi", () => {
    const layout = buildMobileLayout([col("name"), col("izoh"), col("summa", { numeric: true })]);
    const byKey = Object.fromEntries(layout.fields.map((f) => [f.column.key, f.wide]));
    expect(byKey.izoh).toBe(true);
    expect(byKey.summa).toBe(false);
  });

  it("meta va status ajratiladi va maydonlar ro'yxatida TAKRORLANMAYDI", () => {
    const layout = buildMobileLayout([
      col("name", { sticky: true }),
      col("role", { mobile: "meta" }),
      col("status", { mobile: "status" }),
      col("dept"),
    ]);
    expect(layout.title?.key).toBe("name");
    expect(layout.meta?.key).toBe("role");
    expect(layout.status?.key).toBe("status");
    expect(layout.fields.map((f) => f.column.key)).toEqual(["dept"]);
  });

  it("yig'ilgan (barcha qatorda bir xil) ustun kartochkada ham ko'rinmaydi", () => {
    // Buxgalterda bitta firma bor: "Firma" ustuni 30 qatorda bir xil.
    // U jadvaldan tepadagi chipga chiqarilgan — kartochkada qaytarilsa,
    // takrorlanish telefonda YANADA qimmat (ekran tor).
    const layout = buildMobileLayout(
      [col("name"), col("company"), col("due")],
      new Set(["company"])
    );
    expect(layout.fields.map((f) => f.column.key)).toEqual(["due"]);
    expect(layout.title?.key).toBe("name");
  });

  it("ikkita status bo'lsa birinchisi nishon, ikkinchisi oddiy maydon", () => {
    // Ma'lumot YO'QOLMAYDI — faqat joyi o'zgaradi.
    const layout = buildMobileLayout([
      col("name"),
      col("s1", { mobile: "status" }),
      col("s2", { mobile: "status" }),
    ]);
    expect(layout.status?.key).toBe("s1");
    expect(layout.fields.map((f) => f.column.key)).toEqual(["s2"]);
  });

  it("hamma ustunga aniq rol berilgan bo'lsa ham kartochka nomsiz qolmaydi", () => {
    const layout = buildMobileLayout([
      col("a", { mobile: "status" }),
      col("b", { mobile: "wide" }),
    ]);
    expect(layout.title).not.toBeNull();
  });

  it("hide belgilangan ustun hech qayerga tushmaydi", () => {
    const layout = buildMobileLayout([col("name"), col("internalId", { mobile: "hide" })]);
    expect(layout.fields).toHaveLength(0);
  });

  it("bo'sh ro'yxat yiqilmaydi", () => {
    const layout = buildMobileLayout([]);
    expect(layout.title).toBeNull();
    expect(layout.fields).toEqual([]);
  });
});
