/**
 * MIGRATSIYA SKRIPTI — uchidan-uchiga, jonli Postgres.
 *
 * Skript prodda 1 673 ta majburiyatni bekor qiladi. Uni ishonch bilan
 * yurgizishdan oldin AYNAN O'ZI (CLI sifatida, sohta nusxasi emas) test
 * bazasida isbotlanadi:
 *
 *   • dry-run hech narsa yozmaydi
 *   • tasdiqlanmagan moslik qamrovga KIRMAYDI (APPLY bloklanadi)
 *   • apply: qoida yaratiladi, `planned` bekor qilinadi
 *   • `sent` va kalitsiz firma TEGILMAYDI
 *   • rollback: qoida o'chadi, majburiyat tiklanadi
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { prisma } = await import("@/lib/prisma");

const TAG = `vitest-mig-${Date.now()}`;
const KEY = `${TAG}-key`;
const OTHER = `${TAG}-other`;
/** Ro'yxatni "to'liq" qiladi — MIN_TRUSTED_KEYS chegarasidan o'tsin. */
const FILL = ["f1", "f2", "f3", "f4", "f5"].map((f) => `${TAG}-${f}`);
const SCRIPT = "scripts/migrate-service-key-applicability.ts";

const ids = { user: "", withKey: "", missing: "", keyless: "", partial: "", missingSent: "", tpl: "", oblCancel: "", oblSent: "", oblKeyless: "", oblPartial: "", oblKeep: "" };
let workDir = "";
let manifestPath = "";
let rollbackPath = "";

/** Skriptni CLI sifatida yurgizadi — testda ham xuddi prodagidek chaqiriladi. */
function runScript(args: string[]): string {
  return execFileSync("npx", ["tsx", SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const makeCompany = async (label: string, inn: string, services: string[]) =>
  (
    await prisma.company.create({
      data: {
        name: `${TAG} ${label}`,
        inn,
        taxRegime: "vat",
        isActive: true,
        companyStatus: "active",
        contractDate: new Date(Date.UTC(2099, 0, 1)),
        accountantId: ids.user,
        activeServices: services,
      },
      select: { id: true },
    })
  ).id;

const makeObl = async (companyId: string, status: string, periodKey: string) =>
  (
    await prisma.obligation.create({
      data: {
        companyId,
        templateId: ids.tpl,
        templateVersion: 1,
        periodStart: new Date(Date.UTC(2099, 0, 1)),
        periodEnd: new Date(Date.UTC(2099, 1, 1)),
        periodKey,
        dueAt: new Date(Date.UTC(2099, 1, 15)),
        status: status as never,
      },
      select: { id: true },
    })
  ).id;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "asro-mig-"));
  ids.user = (
    await prisma.user.create({
      data: { email: `${TAG}@vitest.local`, fullName: `${TAG}`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    })
  ).id;

  ids.tpl = (
    await prisma.deadlineTemplate.create({
      data: {
        code: `${TAG}-TPL`,
        name: "Migratsiya test shabloni",
        obligationType: "financial_statement",
        periodicity: "monthly",
        anchorType: "fixed_day_of_month",
        dueDay: 15,
        adjustmentPolicy: "none",
        effectiveFrom: new Date(Date.UTC(2099, 0, 1)),
        version: 1,
        lifecycle: "active",
        active: true,
        matrixKey: KEY, // qoidasi YO'Q → migratsiya nomzodi
      },
      select: { id: true },
    })
  ).id;

  ids.withKey = await makeCompany("kaliti bor", `${TAG}-1`, [KEY, ...FILL]);
  ids.missing = await makeCompany("kaliti yo'q", `${TAG}-2`, [OTHER, ...FILL]);
  ids.missingSent = await makeCompany("kaliti yo'q, sent", `${TAG}-3`, [OTHER, ...FILL]);
  ids.keyless = await makeCompany("kalitsiz", `${TAG}-4`, []);
  // Ro'yxati CHALA — bo'sh emas, lekin chegaradan past. Bo'sh ro'yxat bilan
  // bir xil muomala qilinishi kerak (UMID HOSPITAL holati).
  ids.partial = await makeCompany("chala ro'yxat", `${TAG}-5`, [OTHER]);

  ids.oblCancel = await makeObl(ids.missing, "planned", "2099-M01"); // bekor bo'ladi
  ids.oblSent = await makeObl(ids.missingSent, "sent", "2099-M01"); // tegilmaydi
  ids.oblKeyless = await makeObl(ids.keyless, "planned", "2099-M01"); // TEGILMAYDI
  ids.oblKeep = await makeObl(ids.withKey, "planned", "2099-M01"); // tegilmaydi
  ids.oblPartial = await makeObl(ids.partial, "planned", "2099-M01"); // TEGILMAYDI

  manifestPath = join(workDir, "manifest.json");
});

afterAll(async () => {
  await prisma.obligationStatusEvent.deleteMany({ where: { obligation: { templateId: ids.tpl } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.tpl } });
  await prisma.templateApplicability.deleteMany({ where: { templateId: ids.tpl } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.tpl } });
  await prisma.company.deleteMany({
    where: { id: { in: [ids.withKey, ids.missing, ids.missingSent, ids.keyless, ids.partial] } },
  });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  rmSync(workDir, { recursive: true, force: true });
  if (rollbackPath) rmSync(rollbackPath, { force: true });
  await prisma.$disconnect();
});

/**
 * Manifest test bazasidagi HAMMA nomzoddan quriladi.
 *
 * Skript "bazada nomzod bor, manifestda yo'q" holatini ataylab to'xtatadi —
 * eskirgan manifest bilan yarim migratsiya qilish eng yomon natija bo'lardi.
 * Shuning uchun test ham to'liq manifest beradi: faqat O'Z shabloni
 * `confirmed: true`, qolganlari `false` (ataylab rad etilgan).
 */
async function writeManifest(mine: boolean | null): Promise<void> {
  const templates = await prisma.deadlineTemplate.findMany({
    where: { matrixKey: { not: null } },
    select: { code: true, name: true, matrixKey: true, lifecycle: true, applicability: true },
  });
  const candidates = templates.filter((t) => !t.applicability.some((a) => a.criteriaType === "service_key"));
  const mappings = candidates.map((t) => {
    const isMine = t.code === `${TAG}-TPL`;
    const confirmed = isMine ? mine : false;
    return {
      code: t.code,
      name: t.name,
      matrixKey: t.matrixKey,
      lifecycle: t.lifecycle,
      confirmed,
      confirmedBy: confirmed === true ? "vitest" : null,
      confirmedAt: confirmed === true ? "2099-01-01" : null,
      auditAffected: 0,
      auditOpen: 0,
      auditCompanies: 0,
      note: "",
    };
  });
  writeFileSync(
    manifestPath,
    JSON.stringify({ schemaVersion: 1, source: "test", measuredAt: "2099-01-01", howTo: ["test"], mappings }),
  );
}

const statusOf = async (id: string) =>
  (await prisma.obligation.findUnique({ where: { id }, select: { status: true } }))!.status;

const ruleCount = () =>
  prisma.templateApplicability.count({ where: { templateId: ids.tpl, criteriaType: "service_key" } });

describe("1) tasdiqlanmagan moslik", () => {
  it("confirmed=null → APPLY bloklanadi, hech narsa yozilmaydi", async () => {
    await writeManifest(null);
    const out = runScript([`--manifest=${manifestPath}`, "--accept-drift"]);
    expect(out).toContain("MIGRATSIYA BLOKLANGAN");
    expect(out).toContain("javob berilmagan");
  });

  it("bloklangan holatda --apply ham hech narsa yozmaydi", async () => {
    let failed = false;
    try {
      runScript([`--manifest=${manifestPath}`, "--apply", "--backup=test", "--accept-drift"]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await ruleCount()).toBe(0);
    expect(await statusOf(ids.oblCancel)).toBe("planned");
  });
});

describe("2) dry-run", () => {
  it("tasdiqlangan bo'lsa ham DRY-RUN bazaga tegmaydi", async () => {
    await writeManifest(true);
    const out = runScript([`--manifest=${manifestPath}`, "--accept-drift"]);
    expect(out).toContain("DRY-RUN TUGADI");
    expect(out).toContain("bazaga hech narsa yozilmadi");
    expect(await ruleCount()).toBe(0);
    expect(await statusOf(ids.oblCancel)).toBe("planned");
  });

  it("--max-cancel=0 bekor qilish rejalashtirilganda to'xtatadi", async () => {
    // Shu paytda 1 ta `planned` bekor qilinishi rejalashtirilgan.
    let failed = false;
    try {
      runScript([`--manifest=${manifestPath}`, "--accept-drift", "--max-cancel=0"]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await statusOf(ids.oblCancel)).toBe("planned");
  });

  it("--backup bo'lmasa APPLY rad etiladi", async () => {
    let failed = false;
    try {
      runScript([`--manifest=${manifestPath}`, "--apply", "--accept-drift"]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await ruleCount()).toBe(0);
  });
});

describe("3) apply", () => {
  it("qoida yaratiladi va faqat kerakli majburiyat bekor qilinadi", async () => {
    const out = runScript([
      `--manifest=${manifestPath}`,
      "--apply",
      "--backup=vitest-backup",
      "--accept-drift",
      `--out=${join(workDir, "rb.json")}`,
    ]);
    rollbackPath = join(workDir, "rb.json");
    expect(out).toContain("APPLY TUGADI");
    expect(await ruleCount()).toBe(1);
  });

  it("kaliti yo'q firmaning `planned` majburiyati → cancelled", async () => {
    expect(await statusOf(ids.oblCancel)).toBe("cancelled");
  });

  it("`sent` majburiyat TEGILMAYDI — bajarilgan ish dalili", async () => {
    expect(await statusOf(ids.oblSent)).toBe("sent");
  });

  it("KALITSIZ firma TEGILMAYDI — 'bilmaymiz' holati saqlanadi", async () => {
    expect(await statusOf(ids.oblKeyless)).toBe("planned");
  });

  it("CHALA ro'yxatli firma ham TEGILMAYDI (MIN_TRUSTED_KEYS)", async () => {
    expect(await statusOf(ids.oblPartial)).toBe("planned");
  });

  it("kaliti BOR firma tegilmaydi", async () => {
    expect(await statusOf(ids.oblKeep)).toBe("planned");
  });

  it("bekor qilish ObligationStatusEvent bilan izlanadi", async () => {
    const ev = await prisma.obligationStatusEvent.findFirst({
      where: { obligationId: ids.oblCancel, toStatus: "cancelled" },
    });
    expect(ev).toBeTruthy();
    expect(ev!.note).toContain("xizmatiga ega emas");
  });

  it("rollback fayli yozildi va ID larni saqlaydi", () => {
    expect(readdirSync(workDir)).toContain("rb.json");
  });

  it("post-audit hamma bandni o'tkazadi", () => {
    const out = runScript([`--post-audit=${rollbackPath}`, `--manifest=${manifestPath}`]);
    expect(out).toContain("POST-AUDIT: HAMMASI O'TDI");
    expect(out).toContain("chala ro'yxatli firmalar");
    expect(out).toContain("rad etilgan moslik qo'shilmagan");
    expect(out).toContain("dublikat qoida yo'q");
    expect(out).toContain("qamrovdagi majburiyat soni o'zgarmagan");
  });
});

describe("3b) dublikat himoyasi", () => {
  it("takroriy apply yangi qoida yaratmaydi va mavjudini o'zgartirmaydi", async () => {
    const out = runScript([
      `--manifest=${manifestPath}`,
      "--apply",
      "--backup=vitest-backup-2",
      "--accept-drift",
      `--out=${join(workDir, "rb2.json")}`,
    ]);
    expect(out).toContain("qoida ALLAQACHON bor");
    expect(await ruleCount()).toBe(1);
  });

  it("takroriy apply hech narsani bekor qilmaydi", async () => {
    expect(await statusOf(ids.oblSent)).toBe("sent");
    expect(await statusOf(ids.oblKeyless)).toBe("planned");
    expect(await statusOf(ids.oblPartial)).toBe("planned");
    expect(await statusOf(ids.oblKeep)).toBe("planned");
  });
});

describe("4) rollback", () => {
  it("dry-run rollback hech narsani o'zgartirmaydi", async () => {
    const out = runScript([`--rollback=${rollbackPath}`]);
    expect(out).toContain("DRY-RUN TUGADI");
    expect(await ruleCount()).toBe(1);
    expect(await statusOf(ids.oblCancel)).toBe("cancelled");
  });

  it("--apply bilan qoida o'chadi va majburiyat tiklanadi", async () => {
    const out = runScript([`--rollback=${rollbackPath}`, "--apply"]);
    expect(out).toContain("ROLLBACK TUGADI");
    expect(await ruleCount()).toBe(0);
    expect(await statusOf(ids.oblCancel)).toBe("planned");
  });

  it("rollback tegmasligi kerak bo'lganlarga tegmagan", async () => {
    expect(await statusOf(ids.oblSent)).toBe("sent");
    expect(await statusOf(ids.oblKeyless)).toBe("planned");
    expect(await statusOf(ids.oblPartial)).toBe("planned");
    expect(await statusOf(ids.oblKeep)).toBe("planned");
  });
});
