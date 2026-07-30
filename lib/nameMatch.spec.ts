import { describe, it, expect } from "vitest";
import { normalizeName, nameCandidates, editDistance, scoreMatch } from "./nameMatch";

describe("normalizeName", () => {
  it("folds the Uzbek x/h spelling split", () => {
    // The same person is written both ways across HR lists and Telegram.
    expect(normalizeName("Axmadjon")).toBe(normalizeName("Ahmadjon"));
    expect(normalizeName("Xumora")).toBe(normalizeName("Humora"));
    expect(normalizeName("Adxam")).toBe(normalizeName("Adham"));
  });

  it("strips every apostrophe variant", () => {
    expect(normalizeName("Abdugʻani")).toBe("abdugani");
    expect(normalizeName("Abdug'ani")).toBe("abdugani");
    expect(normalizeName("O'ktamov")).toBe("oktamov");
  });

  it("transliterates Cyrillic", () => {
    expect(normalizeName("Шерзод")).toBe("sherzod");
    expect(normalizeName("Мирсаидов")).toBe("mirsaidov");
    // Uzbek-specific letters.
    expect(normalizeName("Ўктамов")).toBe("oktamov");
    expect(normalizeName("Ғани")).toBe("gani");
  });

  it("survives a name pasted as Unicode mathematical bold", () => {
    // Telegram display names arrive like this; without NFKD the whole string
    // is stripped to "" and the person silently never matches.
    expect(normalizeName("𝐌𝐚𝐫𝐝𝐨𝐧")).toBe("mardon");
    expect(normalizeName("𝐌𝐚𝐫𝐝𝐨𝐧")).toBe(normalizeName("Mardon"));
  });

  it("catches Cyrillic lookalikes hidden in Latin text", () => {
    // "Sevarа" here ends with Cyrillic а — invisible, but it would otherwise
    // be dropped and change the name.
    expect(normalizeName("Sevarа")).toBe("sevara");
  });
});

describe("nameCandidates", () => {
  it("drops job titles and company suffixes", () => {
    expect(nameCandidates("Adham buxgalter FinCo")).toEqual(["adham"]);
    expect(nameCandidates("Muslimbek Buxgalter nazoratchi")).toEqual(["muslimbek"]);
    expect(nameCandidates("Ruslan banking")).toEqual(["ruslan"]);
    expect(nameCandidates("Buxgalter_Ahmadjon")).toEqual(["ahmadjon"]);
  });

  it("keeps the surname as a candidate", () => {
    // The card may hold either part, so both stay in play.
    expect(nameCandidates("Elbek Ismatillayev FinCo 2")).toEqual(["elbek", "ismatillayev"]);
  });

  it("drops digits and too-short tokens", () => {
    expect(nameCandidates("Umid Buxgalter FinCo 2")).toEqual(["umid"]);
  });
});

describe("editDistance", () => {
  it("counts single-character edits", () => {
    expect(editDistance("bekzod", "begzod")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("scoreMatch", () => {
  it("matches the real roster against the real cards", () => {
    expect(scoreMatch(nameCandidates("Buxgalter_Ahmadjon"), "Axmadjon").tier).toBe("exact");
    expect(scoreMatch(nameCandidates("Xumora Buxgalter"), "Humora").tier).toBe("exact");
    expect(scoreMatch(nameCandidates("Begzod Banking"), "Bekzod").tier).toBe("near");
    expect(scoreMatch(nameCandidates("Dilxushbek Buxgalter"), "Dilhush").tier).toBe("near");
    expect(scoreMatch(nameCandidates("Шерзод Мирсаидов chicken"), "Sherzod").tier).toBe("exact");
  });

  it("refuses unrelated names", () => {
    expect(scoreMatch(nameCandidates("Alisher FinCo"), "Olloshukur").tier).toBe("none");
    expect(scoreMatch(nameCandidates("Zamira Buxgalter"), "Mirabbos").tier).toBe("none");
  });

  it("does not let a short name prefix-match everything", () => {
    // The prefix rule needs 5+ characters, or "Ali" would claim "Alisher".
    expect(scoreMatch(["ali"], "Alisher").tier).not.toBe("near");
  });

  it("returns none for an empty card name", () => {
    expect(scoreMatch(["ruslan"], "").tier).toBe("none");
  });
});
