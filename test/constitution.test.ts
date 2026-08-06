// =====================================================
// CONSTITUTION — the articles of docs/CONSTITUTION.md, with teeth
// =====================================================
// Deliberately DB-free: this suite runs in the CI unit job, on every PR, before
// the integration job exists. It reads the schema and the source tree as text.
//
// Two shapes of assertion are used, and the difference matters:
//   - FROZEN ALLOWLIST — the set may shrink (cleanup) but never grow. Adding a
//     new member fails; removing one does not. This is how a rule survives the
//     very refactors it was written to permit.
//   - RATCHET — a violation count that may only go down. Lets a rule bite today
//     without blocking on debt it was written to retire.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import ts from "typescript";

const ROOT = join(__dirname, "..");
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.spec\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function modelBody(name: string): string {
  const m = new RegExp(`^model ${name} \\{(.*?)^\\}`, "sm").exec(schema);
  if (!m) throw new Error(`model ${name} topilmadi`);
  return m[1];
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Modda 1 — ASRO buxgalteriya yuritmaydi", () => {
  // Double-entry is NOT forbidden: lib/ledger.ts guarantees cash integrity and is
  // used by kassa/payouts/payroll/monthClose. What is forbidden is new
  // period-closing ceremony — see ADR-0011.
  const ALLOWED = [
    "lib/monthClose.ts", // operational month close — in use
    "lib/operationalTables.ts", // reset registry, names the table only
    "lib/periodLock.ts", // guard read by finance writers
    "server/accounting.ts", // archived in block A5; listed so today is green
    "server/monthClosing.ts", // operational month close — in use
  ];

  it("no file outside the frozen list touches AccountingPeriod", () => {
    const offenders = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "server")), ...walk(join(ROOT, "app")), ...walk(join(ROOT, "bot"))]
      .filter((f) => /\baccountingPeriod\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.includes(f));

    expect(offenders, "yangi davr-yopish marosimi qo'shilgan — ADR-0011 ga qarang").toEqual([]);
  });
});

describe("Modda 2 — Obligation yagona ish birligi", () => {
  it("MonthlyReport is frozen — no new columns", () => {
    const fields = modelBody("MonthlyReport")
      .split("\n")
      .filter((l) => /^\s+\w+\s+\S/.test(l) && !l.includes("@@") && !l.trim().startsWith("//"));

    // 60 as of 2026-08-06. This table is being retired into Obligation (block B);
    // the count may fall, never rise.
    expect(fields.length, "MonthlyReport ga ustun qo'shilgan — u nafaqaga chiqarilmoqda").toBeLessThanOrEqual(60);
  });

  it("no second 'company × period × status' table appears", () => {
    // Frozen allowlist of models keyed uniquely on a company and a period.
    // Operation left in block A5; MonthlyReport leaves in block B — shrinking is fine.
    const ALLOWED = new Set([
      "MonthlyReport",
      "ReportProof",
      "Payment",
      "MonthlyPerformance",
      "AccountingPeriod",
      "FinancialSnapshot",
      "PaymentReminder",
      "Obligation",
    ]);

    const found: string[] = [];
    // [\s\S] rather than the `s` flag: the tsconfig target predates es2018.
    for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const [, name, body] = m;
      for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]/g)) {
        const keys = u[1].split(",").map((s) => s.trim());
        if (keys.includes("companyId") && keys.some((k) => /^(period|periodKey|month|periodStart|year)$/.test(k))) {
          if (!ALLOWED.has(name)) found.push(name);
        }
      }
    }

    expect(found, "Obligation'dan boshqa 'firma × davr × holat' jadvali qo'shilgan").toEqual([]);
  });
});

describe("Modda 4a — bog'liqlik o'qi ichkariga qaraydi", () => {
  // AST, not regex: regex misses `import type`, re-exports and multi-line imports.
  const ENGINES = join(ROOT, "lib/engines");

  function internalImports(file: string): string[] {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const out: string[] = [];
    const visit = (n: ts.Node) => {
      const spec =
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)
          ? n.moduleSpecifier.text
          : undefined;
      if (spec?.startsWith("@/")) out.push(spec);
      ts.forEachChild(n, visit);
    };
    visit(src);
    return out;
  }

  it("engines import only from engines and platform", () => {
    const bad: string[] = [];
    for (const f of walk(ENGINES)) {
      for (const spec of internalImports(f)) {
        if (!/^@\/lib\/(engines|platform)\//.test(spec)) bad.push(`${relative(ROOT, f)} → ${spec}`);
      }
    }
    expect(bad, "engine domen yoki adapter qatlamidan import qilyapti").toEqual([]);
  });
});

describe("Modda 4b — core domen lug'atini bilmaydi", () => {
  // RATCHET — may only fall. Opened at 20 (2026-08-06); block A3 took it to 7 by
  // replacing CompanyFacts with SubjectFacts, so the 13 taxRegime/statsType hits
  // in applicability.ts and obligations.ts are gone.
  //
  // The remaining 7 are role labels: "bosh buxgalter" in obligationSweep.ts (3)
  // and escalation.ts (4). Organisational, not fiscal — an audit firm has a chief
  // auditor, and the L1→L2 ladder itself is generic. Retiring them means moving
  // escalation's display strings into the domain layer, which is not worth a PR
  // today; capped here so the debt cannot grow.
  const BASELINE = 7;
  const VOCAB = /\b(soliq|qqs|inps|vat|taxRegime|statsType|didox|buxgalter)\b/gi;

  it(`domain vocabulary in engine-bound files never grows (baseline ${BASELINE})`, () => {
    const perFile: Record<string, number> = {};
    let total = 0;
    for (const p of walk(join(ROOT, "lib/engines"))) {
      const rel = relative(ROOT, p);
      const n = (readFileSync(p, "utf8").match(VOCAB) ?? []).length;
      if (n) perFile[rel] = n;
      total += n;
    }
    expect(total, `domen lug'ati o'sdi: ${JSON.stringify(perFile)}`).toBeLessThanOrEqual(BASELINE);
  });
});

describe("Modda 8 — template ma'lumot, kod emas", () => {
  it("DeadlineTemplate carries no domain-specific column", () => {
    const body = modelBody("DeadlineTemplate");
    expect(body).not.toMatch(/\b(taxRegime|statsType|vatPayer|soliq|qqs)\b/i);
    // obligationType stays a free String so a new type is a seed row, not a migration.
    expect(body).toMatch(/^\s+obligationType\s+String\s*(\/\/.*)?$/m);
  });
});

// Modda 3  → lib/engines/evidence/*.spec.ts            (block A6)
// Modda 5  → test/evidence-landing-source-agnostic.ts  (block A6)
// Modda 6  → test/company-scope.test.ts (16 tests, exists)
// Modda 7  → test/ai-tools-scope.test.ts               (block C)
// Modda 9  → human gate, deliberately not automatable
// Modda 10 → .github/workflows/ci.yml, promise-id step
