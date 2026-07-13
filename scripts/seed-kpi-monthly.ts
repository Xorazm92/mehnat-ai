/**
 * Seed real monthly KPI records from data/kerak/kpi-oylik.json (212 rows).
 *
 * Each row is one company's monthly KPI snapshot with a `kpi_states` map keyed by
 * rule name (acc_* / bank_* / sup_*). We attribute each state to the company's
 * assigned employee for that role (company.accountantId / bankClientId /
 * supervisorId), which are already set on every company.
 *
 * Score handling:
 *   - select/checkbox states: use the coeff stored in the data (preserves the
 *     rare "severe systemic delay" -1 group_response entries exactly)
 *   - counter states (attendance/absence): recompute via the v2 scoring engine
 *
 * Records are seeded as source='system', status='approved' (historical, final)
 * for the current UI month (2026-07-01 by default). Idempotent: clears prior
 * system-seeded records for the month first.
 *
 * Run:  npx tsx scripts/seed-kpi-monthly.ts [YYYY-MM-01]
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeRuleScore, stateToInput } from "@/lib/kpiScoring";
import * as fs from "fs";
import * as path from "path";

const MONTH = process.argv[2] || "2026-07-01";

const normalize = (s: string) =>
  (s || "")
    .replace(/["'`«»]/g, " ")
    .toUpperCase()
    .replace(/\b(MCHJ|MCHU|OOO|ООО|ЧП|XK|X\/K|ЯТТ|YATT|QK|ХК|ТМ|LLC)\b/g, " ")
    .replace(/[^A-ZА-Я0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type State = {
  state?: string;
  coeff?: number;
  early_days?: number;
  late_5min?: number;
  absent_days?: number;
  penalty_amount?: number;
};

function roleForKey(key: string): "accountant" | "bank_client" | "supervisor" | null {
  if (key.startsWith("acc_")) return "accountant";
  if (key.startsWith("bank_")) return "bank_client";
  if (key.startsWith("sup_")) return "supervisor";
  return null;
}

async function main() {
  // Load companies (with role assignments)
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, accountantId: true, bankClientId: true, supervisorId: true },
  });
  const byNorm = new Map<string, typeof companies>();
  for (const c of companies) {
    const k = normalize(c.name);
    (byNorm.get(k) ?? byNorm.set(k, []).get(k)!).push(c);
  }

  // Load rules, resolving the acc_group -> acc_group_response alias
  const rules = await prisma.kpiRule.findMany();
  const ruleByName = new Map(rules.map((r) => [r.name, r]));
  const resolveRule = (key: string) =>
    ruleByName.get(key) ?? (key === "acc_group" ? ruleByName.get("acc_group_response") : undefined);

  const employeeForRole = (
    c: (typeof companies)[number],
    role: "accountant" | "bank_client" | "supervisor"
  ): string | null =>
    role === "accountant" ? c.accountantId : role === "bank_client" ? c.bankClientId : c.supervisorId;

  const file = path.join(process.cwd(), "data/kerak/kpi-oylik.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows: Array<Record<string, unknown> & { kpi_states?: Record<string, State> }> = json.KPI || json;

  const now = new Date();
  const records: Prisma.MonthlyPerformanceCreateManyInput[] = [];
  const stats = { rows: 0, noCompany: 0, states: 0, noRule: 0, noEmployee: 0, dupSkipped: 0, written: 0 };

  for (const row of rows) {
    stats.rows++;
    const hits = byNorm.get(normalize(String(row["НАИМЕНОВАНИЯ"] ?? "")));
    if (!hits || hits.length !== 1) {
      stats.noCompany++;
      continue;
    }
    const company = hits[0];
    const seen = new Set<string>(); // dedupe (rule+employee) within the row (acc_group vs acc_group_response)

    for (const [key, st] of Object.entries(row.kpi_states ?? {})) {
      stats.states++;
      const role = roleForKey(key);
      const rule = resolveRule(key);
      if (!role || !rule) {
        stats.noRule++;
        continue;
      }
      const employeeId = employeeForRole(company, role);
      if (!employeeId) {
        stats.noEmployee++;
        continue;
      }
      const dedupeKey = `${rule.id}:${employeeId}`;
      if (seen.has(dedupeKey)) {
        stats.dupSkipped++;
        continue;
      }
      seen.add(dedupeKey);

      // Score: prefer stored coeff for select/checkbox; recompute counters
      const input = stateToInput(st);
      const rawScore =
        typeof st.coeff === "number" ? st.coeff : computeRuleScore(rule as never, input).percent;
      const value = rawScore > 0 ? 1 : rawScore < 0 ? -1 : 0;

      records.push({
        month: MONTH,
        companyId: company.id,
        employeeId,
        ruleId: rule.id,
        selectedOption: st.state ?? null,
        earlyDays: Math.round(Number(st.early_days ?? 0)),
        lateMinutes: Math.round(Number(st.late_5min ?? 0)) * 5,
        absentDays: Math.round(Number(st.absent_days ?? 0)),
        penaltyAmount: new Prisma.Decimal(Number(st.penalty_amount ?? 0)),
        value: new Prisma.Decimal(value),
        calculatedScore: new Prisma.Decimal(rawScore),
        source: "system",
        status: "approved",
        submittedAt: now,
        approvedAt: now,
        recordedAt: now,
      });
      stats.written++;
    }
  }

  // Idempotent: clear prior system-seeded records for this month, then insert
  const cleared = await prisma.monthlyPerformance.deleteMany({ where: { month: MONTH, source: "system" } });
  const result = await prisma.monthlyPerformance.createMany({ data: records });

  console.log(`Month: ${MONTH}`);
  console.log(`Rows: ${stats.rows} (no-company ${stats.noCompany}) | states ${stats.states}`);
  console.log(`Skipped -> noRule ${stats.noRule}, noEmployee ${stats.noEmployee}, dup ${stats.dupSkipped}`);
  console.log(`Cleared prior system records: ${cleared.count}`);
  console.log(`✅ Inserted ${result.count} monthly KPI performance records`);

  // Sanity: per-role totals
  const byRole = await prisma.monthlyPerformance.groupBy({
    by: ["source"],
    where: { month: MONTH },
    _count: true,
  });
  console.log("By source:", JSON.stringify(byRole.map((x) => `${x.source}:${x._count}`)));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
