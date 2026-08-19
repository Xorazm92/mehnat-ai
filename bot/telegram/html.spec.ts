import { describe, it, expect } from "vitest";
import { b, code, esc, expandableQuote, i, quote } from "./html";

describe("esc", () => {
  // Bitta qochirilmagan `&` butun xabarni yo'q qiladi: Telegram uni rad etadi
  // va hisobot umuman yetib bormaydi.
  it("HTML belgilarini qochiradi", () => {
    expect(esc('AVTO & TRADE <MCHJ>')).toBe("AVTO &amp; TRADE &lt;MCHJ&gt;");
  });

  it("null/undefined dan bo'sh satr yasaydi", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("raqamni ham qabul qiladi", () => {
    expect(esc(126)).toBe("126");
  });
});

describe("belgilar", () => {
  it("ichidagi matnni qochirib o'raydi", () => {
    expect(b("A & B")).toBe("<b>A &amp; B</b>");
    expect(i("x")).toBe("<i>x</i>");
    expect(code("2026-M07")).toBe("<code>2026-M07</code>");
  });
});

describe("sitatalar", () => {
  it("yig'iladigan sitata qatorlarni saqlaydi", () => {
    expect(expandableQuote(["bir", "ikki"])).toBe(
      "<blockquote expandable>bir\nikki</blockquote>",
    );
  });

  it("oddiy sitata ham bor", () => {
    expect(quote(["bir"])).toBe("<blockquote>bir</blockquote>");
  });
});
