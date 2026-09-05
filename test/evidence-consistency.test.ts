/**
 * DALIL YAXLITLIGI INVARIANTI — o'zi ishlaydimi.
 *
 * `lib/evidenceConsistency.ts` eski (`ReportProof`) va yangi
 * (`ObligationSubmission` + `SubmissionEvidence`) dalil yozuvlari ajralib
 * ketmaganini tekshiradi. U 3-to'lqin migratsiyasining poydevori: eski
 * yozuvni o'chirishdan OLDIN ikkalasi bugun mos kelayotgani isbotlanishi
 * kerak.
 *
 * Ana shu sababdan invariantning O'ZI test qilinadi. Jim yiqilgan tekshiruv
 * — tekshiruvsizlikdan BATTAR: ekran "hammasi joyida" deb turadi va hech
 * kim qaramaydi. Aynan shu holat `lib/obligationBridge.ts` bilan bo'lgan
 * (ADR-0009): fail-silent ko'prik oylar davomida deyarli hech narsa
 * qilmadi va buni hech kim sezmadi.
 *
 * Bu yerda tekshiriladigan narsa:
 *   1. har bir tekshiruv HAQIQATAN yuguradi (SQL sinmagan) va shakli to'g'ri;
 *   2. kalitlar unikal va `lib/reconciliation.ts` kalitlari bilan to'qnashmaydi;
 *   3. bog'lanmagan dalil `evidence-proof-linked` ni HAQIQATAN qizartiradi;
 *   4. holat mos kelmasa `evidence-status-agrees` HAQIQATAN xato beradi;
 *   5. osilib qolgan havola `evidence-ref-resolves` ni qizartiradi.
 *
 * (3)–(5) tranzaksiya ichida buziladi va tranzaksiya ATAYLAB rollback
 * qilinadi — bazada hech qanday iz qolmaydi.
 *
 * Live Postgres kerak (`npm run test:db:setup`).
 */
import { describe, it, expect, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { runEvidenceConsistency, PROOF_REF_PREFIX, PROOF_TO_SUBMISSION_STATUS } =
  await import("@/lib/evidenceConsistency");

const TAG = `vitest-evidence-${Date.now()}`;
const STATUSES = new Set(["ok", "warn", "error"]);

/** Har urug'lantirishga unikal qo'shimcha — dublikat cheklovlari uchun. */
let seedCounter = 0;

/** Tranzaksiyani ataylab bekor qilish uchun — ma'lumot bazada qolmaydi. */
class Rollback extends Error {}

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Sinov uchun eng kichik to'liq zanjir: firma → shablon → majburiyat →
 * urinish → dalil ko'rsatkichi, va yonida `ReportProof`.
 *
 * Mavjud ma'lumotdan foydalanilmaydi: bazadagi haqiqiy qatorlarga tayangan
 * test lokal bazaning holatiga bog'lanib qolardi va boshqa mashinada
 * boshqacha javob berardi.
 */
async function seed(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts: { proofStatus: string; submissionStatus: "sent" | "accepted" | "rejected"; link: boolean },
) {
  // Har chaqiruv O'Z qatorlarini yaratadi: `DeadlineTemplate` da
  // `@@unique([code, version])` bor va bitta testda bir necha marta
  // urug'lansa ikkinchisi yiqilardi.
  const uniq = `${TAG}-${seedCounter++}`;
  const company = await tx.company.create({
    data: { name: `${uniq}-firma`, inn: String(900_000_000 + seedCounter) },
    select: { id: true },
  });
  const template = await tx.deadlineTemplate.create({
    data: {
      code: `${uniq}-shablon`,
      name: `${uniq} shablon`,
      obligationType: "tax_declaration",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 15,
      effectiveFrom: new Date("2099-01-01"),
    },
    select: { id: true, version: true },
  });
  const obligation = await tx.obligation.create({
    data: {
      companyId: company.id,
      templateId: template.id,
      templateVersion: template.version,
      periodStart: new Date("2099-01-01"),
      periodEnd: new Date("2099-01-31"),
      periodKey: "2099-M01",
      dueAt: new Date("2099-02-15"),
    },
    select: { id: true },
  });
  const proof = await tx.reportProof.create({
    data: {
      companyId: company.id,
      period: "2099-01",
      colKey: "didox",
      imageData: "",
      imageRef: `disk://2099/01/${uniq}.jpg`,
      status: opts.proofStatus,
      submittedById: TAG,
      submittedByName: TAG,
    },
    select: { id: true },
  });
  const submission = await tx.obligationSubmission.create({
    data: {
      obligationId: obligation.id,
      attemptNo: 1,
      status: opts.submissionStatus,
      sentAt: new Date(),
      sourceSystem: "asro",
    },
    select: { id: true },
  });
  if (opts.link) {
    await tx.submissionEvidence.create({
      data: {
        submissionId: submission.id,
        type: "screenshot",
        storageRef: `${PROOF_REF_PREFIX}${proof.id}`,
        note: TAG,
      },
    });
  }
  return { companyId: company.id, proofId: proof.id, submissionId: submission.id };
}

const find = <T extends { key: string }>(checks: T[], key: string) => checks.find((c) => c.key === key);

describe("runEvidenceConsistency", () => {
  it("har bir tekshiruv yuguradi va shakli to'g'ri", async () => {
    const checks = await prisma.$transaction(async (tx) => runEvidenceConsistency(tx), {
      timeout: 60_000,
    });

    expect(checks.length, "tekshiruvlar ro'yxati bo'sh").toBeGreaterThanOrEqual(4);

    for (const c of checks) {
      expect(c.key, "kalit bo'sh").toBeTruthy();
      expect(c.title, `${c.key} — sarlavha bo'sh`).toBeTruthy();
      expect(STATUSES.has(c.status), `${c.key} — noma'lum holat: ${c.status}`).toBe(true);
      expect(Number.isFinite(c.value), `${c.key} — qiymat son emas`).toBe(true);
      expect(c.detail, `${c.key} — izoh bo'sh`).toBeTruthy();
      // Muammo bor tekshiruv NIMA QILISH kerakligini aytishi shart.
      if (c.status !== "ok") {
        expect(c.action, `${c.key} — muammo bor, lekin harakat ko'rsatilmagan`).toBeTruthy();
      }
    }
  }, 90_000);

  it("kalitlar unikal va sverka kalitlari bilan to'qnashmaydi", async () => {
    // Ikkala to'plam bir ekranda yonma-yon chizilishi mumkin — `key` UI'da
    // React `key` sifatida ishlatiladi, dublikat jim buzilish beradi.
    const { runReconciliation } = await import("@/lib/reconciliation");
    const [evidence, recon] = await prisma.$transaction(
      async (tx) => [await runEvidenceConsistency(tx), await runReconciliation(tx)] as const,
      { timeout: 90_000 },
    );
    const keys = evidence.map((c) => c.key);
    expect(new Set(keys).size, `dublikat kalit: ${keys.join(", ")}`).toBe(keys.length);
    const clash = keys.filter((k) => recon.some((r) => r.key === k));
    expect(clash, "sverka kalitlari bilan to'qnashuv").toEqual([]);
  }, 120_000);

  it("bog'lanmagan dalil `evidence-proof-linked` ni qizartiradi", async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = find(await runEvidenceConsistency(tx), "evidence-proof-linked");
          expect(before, "`evidence-proof-linked` tekshiruvi yo'q").toBeDefined();
          const baseline = before!.value;

          // Dalil bor, `SubmissionEvidence` yo'q — `applyObligationStatus`
          // yiqilganda aynan shunday qoladi.
          await seed(tx, { proofStatus: "pending", submissionStatus: "sent", link: false });

          const after = find(await runEvidenceConsistency(tx), "evidence-proof-linked");
          expect(after?.status, "bog'lanmagan dalil xato bermadi").toBe("error");
          expect(after?.value, "hisob o'smadi").toBe(baseline + 1);
          expect(after?.action, "xato bor, lekin harakat aytilmagan").toBeTruthy();
          // Hisobot manbani KO'RSATISHI kerak — quruq son bilan tuzatib bo'lmaydi.
          expect(after?.detail).toContain(TAG);

          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
  }, 90_000);

  it("holat mos kelmasa `evidence-status-agrees` xato beradi", async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = find(await runEvidenceConsistency(tx), "evidence-status-agrees");
          const baseline = before!.value;

          // Nazoratchi tasdiqladi (`approved`), lekin urinish hali `sent`:
          // `closeSubmissionAttempt` tushmagan holat.
          await seed(tx, { proofStatus: "approved", submissionStatus: "sent", link: true });

          const after = find(await runEvidenceConsistency(tx), "evidence-status-agrees");
          expect(after?.status, "holat ziddiyati xato bermadi").toBe("error");
          expect(after?.value).toBe(baseline + 1);
          expect(after?.detail).toContain("approved");
          expect(after?.detail).toContain("sent");

          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
  }, 90_000);

  it("mos holat xato BERMAYDI (yolg'on qizil yo'q)", async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = find(await runEvidenceConsistency(tx), "evidence-status-agrees");
          const baseline = before!.value;

          for (const [proofStatus, submissionStatus] of Object.entries(PROOF_TO_SUBMISSION_STATUS)) {
            await seed(tx, {
              proofStatus,
              submissionStatus: submissionStatus as "sent" | "accepted" | "rejected",
              link: true,
            });
          }

          const after = find(await runEvidenceConsistency(tx), "evidence-status-agrees");
          expect(after?.value, "to'g'ri juftliklar nomuvofiq deb sanaldi").toBe(baseline);

          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
  }, 90_000);

  it("osilib qolgan havola `evidence-ref-resolves` ni qizartiradi", async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = find(await runEvidenceConsistency(tx), "evidence-ref-resolves");
          const baseline = before!.value;

          const ids = await seed(tx, {
            proofStatus: "pending",
            submissionStatus: "sent",
            link: true,
          });
          // Firma o'chsa `ReportProof` kaskad bilan ketadi, `SubmissionEvidence`
          // esa qoladi — u majburiyatga bog'langan, firmaga emas.
          await tx.reportProof.delete({ where: { id: ids.proofId } });

          const after = find(await runEvidenceConsistency(tx), "evidence-ref-resolves");
          expect(after?.status, "osilib qolgan havola xato bermadi").toBe("error");
          expect(after?.value).toBe(baseline + 1);

          throw new Rollback();
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);
  }, 90_000);
});
