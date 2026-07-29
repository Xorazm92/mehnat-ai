import { describe, it, expect } from "vitest";
import {
  cbButton,
  webAppButton,
  inlineKeyboard,
  gridKeyboard,
  contactKeyboard,
  removeKeyboard,
} from "./keyboard";

describe("inlineKeyboard", () => {
  it("drops empty and nullish rows", () => {
    const kb = inlineKeyboard([
      [cbButton("A", "a")],
      [],
      null,
      undefined,
      [cbButton("B", "b"), cbButton("C", "c")],
    ]);
    expect(kb.inline_keyboard).toHaveLength(2);
    expect(kb.inline_keyboard[1]).toHaveLength(2);
  });

  it("produces markup Telegram accepts verbatim", () => {
    expect(inlineKeyboard([[cbButton("Jarima", "sig:qpen:1")]])).toEqual({
      inline_keyboard: [[{ text: "Jarima", callback_data: "sig:qpen:1" }]],
    });
  });
});

describe("gridKeyboard", () => {
  it("wraps buttons into rows of perRow", () => {
    const buttons = ["1", "2", "3", "4", "5"].map((n) => cbButton(n, n));
    const rows = gridKeyboard(buttons, 2).inline_keyboard;
    expect(rows.map((r) => r.length)).toEqual([2, 2, 1]);
  });

  it("returns no rows for no buttons", () => {
    expect(gridKeyboard([], 3).inline_keyboard).toEqual([]);
  });
});

describe("special keyboards", () => {
  it("builds a request_contact reply keyboard", () => {
    expect(contactKeyboard("📱 Raqamni yuborish")).toEqual({
      keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
  });

  it("builds a web_app button", () => {
    expect(webAppButton("Dashboard", "https://asro.uz/telegram-app")).toEqual({
      text: "Dashboard",
      web_app: { url: "https://asro.uz/telegram-app" },
    });
  });

  it("builds a keyboard removal", () => {
    expect(removeKeyboard()).toEqual({ remove_keyboard: true });
  });
});
