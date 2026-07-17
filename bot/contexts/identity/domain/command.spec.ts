import { describe, it, expect } from "vitest";
import { parseCommand } from "./command";

describe("parseCommand", () => {
  it("parses a bare command", () => {
    expect(parseCommand("/whoami")).toEqual({
      name: "whoami",
      args: [],
      argString: "",
    });
  });

  it("lowercases the name and strips @BotUsername", () => {
    expect(parseCommand("/Bind@FincoKpiBot 123456789")).toEqual({
      name: "bind",
      args: ["123456789"],
      argString: "123456789",
    });
  });

  it("keeps the full argument string for multi-token args", () => {
    const c = parseCommand("/link  aziz@example.com  extra");
    expect(c!.name).toBe("link");
    expect(c!.args).toEqual(["aziz@example.com", "extra"]);
    expect(c!.argString).toBe("aziz@example.com  extra");
  });

  it("returns null for non-commands and empty input", () => {
    expect(parseCommand("salom")).toBeNull();
    expect(parseCommand("")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
    expect(parseCommand("  ")).toBeNull();
  });
});
