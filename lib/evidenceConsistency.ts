// =====================================================
// DALIL YAXLITLIGI — ReportProof ↔ ObligationSubmission/SubmissionEvidence
// =====================================================
//
// NEGA BU MODUL BOR.
//
// `server/proofs.ts` bugun dalilni IKKI JOYGA yozadi:
//
//   eski yo'l   ReportProof            (companyId, period, colKey) bo'yicha upsert
//   yangi yo'l  ObligationSubmission   har topshirish urinishi uchun yangi qator
//               + SubmissionEvidence   `storageRef = "reportProof:<proofId>"`
//
// Ikkinchisi birinchisiga `applyObligationStatus` orqali ulanadi va u
// UCH SABABDAN muvaffaqiyatsiz bo'lishi mumkin: `no_template`,
// `no_obligation`, `bad_period` (`lib/domains/accounting/matrixWrite.ts`).
// Nosozlik dalil oqimini TO'XTATMAYDI — bu ataylab: skrinshot saqlangan
// bo'lsa saqlangan bo'lib qolishi kerak. Oqibati esa shu: `ReportProof`
// yoziladi, majburiyat tomoni esa yozilmaydi va ikki manba **jimgina
// ajralib ketadi**.
//
// Bu holat allaqachon bir marta yuz bergan. ADR-0009 dagi eski
// `obligationBridge` ham fail-silent edi: o'n beshta ustun xaritasidan
// beshtasi umuman ishlamasdi va buni oylar davomida hech kim sezmadi,
// chunki jim ko'prik ishlayotgan ko'prikka o'xshaydi.
//
// `MonthlyReport`/`Task` ni `Obligation` ga birlashtirish rejasi (mahsulot
// yaxlitligi 3-to'lqini, `docs/plan/OBLIGATION_UNIFICATION_PLAN.md`) eski
// yo'lni o'chirishdan boshlanmaydi. U SHU YERDAN boshlanadi: eski va yangi
// yozuv bugun mos kelayotganini hech nima tasdiqlamayapti. Avval o'lchov,
// keyin ko'chirish.
//
// Bu modul HECH NARSANI TUZATMAYDI va hech narsani o'chirmaydi — faqat
// ko'rsatadi. Avtomatik "tuzatish" bu yerda jim ravishda dalil tarixini
// buzishi mumkin.

import { Prisma } from "@prisma/client";
import type { ReconCheck } from "@/lib/reconciliation";

type Db = Prisma.TransactionClient;

/** `SubmissionEvidence.storageRef` dagi prefiks — `server/proofs.ts` yozadi. */
export const PROOF_REF_PREFIX = "reportProof:";

/**
 * `ReportProof.status` ↔ `ObligationSubmission.status` mosligi.
 *
 * Chapdagi — buxgalter/nazoratchi ko'radigan holat, o'ngdagi — majburiyat
 * tomonidagi enum (`SubmissionStatus`). Ular BOSHQA so'zlar bilan bir xil
 * narsani aytadi, shuning uchun xarita aniq yozilgan: `approved` va
 * `accepted` bir xil voqea.
 */
export const PROOF_TO_SUBMISSION_STATUS: Record<string, string> = {
  pending: "sent",
  approved: "accepted",
  rejected: "rejected",
};

/**
 * Yuqoridagi xaritaning SQL ko'rinishi — QO'LDA yozilmaydi, shu obyektdan
 * quriladi. Ilgari bu yerda `CASE ... WHEN 'pending' THEN 'sent' ...` qo'lda
 * yozilgan edi va bu aynan modul ogohlantirayotgan xatoning o'zi bo'lardi:
 * bitta haqiqatning ikki nusxasi, ular jimgina ajralib ketishi mumkin.
 *
 * Xaritada yo'q holat `__nomalum__` beradi, ya'ni HECH QANDAY urinish
 * holatiga teng bo'lmaydi va nomuvofiqlik deb sanaladi — yangi
 * `ReportProof.status` qiymati jimgina o'tib ketmaydi.
 */
const STATUS_CASE_SQL = Prisma.sql`CASE proof_status ${Prisma.join(
  Object.entries(PROOF_TO_SUBMISSION_STATUS).map(
    ([proof, submission]) => Prisma.sql`WHEN ${proof} THEN ${submission}`,
  ),
  " ",
)} ELSE '__nomalum__' END`;

/** Namuna qatorlarni bitta o'qiladigan satrga yig'adi (hisobot uchun). */
function samples(rows: { label: string }[], total: number): string {
  if (rows.length === 0) return "";
  const shown = rows.map((r) => r.label).join(" · ");
  const rest = total - rows.length;
  return rest > 0 ? `${shown} … va yana ${rest} ta` : shown;
}

/**
 * Dalil yaxlitligi tekshiruvlari.
 *
 * `lib/reconciliation.ts` bilan BIR XIL shakl (`ReconCheck`) qaytaradi —
 * u yerdagi 17 ta invariant allaqachon shu shaklda UI'ga chiqadi, ya'ni
 * bu tekshiruvlarni ham ko'rsatish uchun yangi mexanizm kerak emas.
 *
 * Tranzaksiya klienti qabul qiladi, chunki testlar buzilishni ATAYLAB
 * yaratib, keyin rollback qiladi.
 */
export async function runEvidenceConsistency(db: Db): Promise<ReconCheck[]> {
  const checks: ReconCheck[] = [];

  // ── 1. Har bir dalil majburiyat tomonida iz qoldirganmi ───────────────
  //
  // ENG MUHIM TEKSHIRUV. `applyObligationStatus` yiqilganda aynan shu
  // holat qoladi: skrinshot bor, topshirish urinishi yo'q. Matritsa
  // "topshirildi" deb turadi, majburiyat esa hali `planned` — va KPI
  // qaysi birini o'qishiga qarab xodim ballini yo'qotadi yoki bekorga oladi.
  const orphanRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*)::bigint AS total
      FROM "ReportProof" p
     WHERE NOT EXISTS (
       SELECT 1 FROM "SubmissionEvidence" e
        WHERE e."storageRef" = ${PROOF_REF_PREFIX} || p.id)`;
  const orphans = Number(orphanRows[0]?.total ?? 0);

  // Bog'langan dalil UMUMAN yo'qmi? Bu ikki BUTUNLAY boshqa tashxisni
  // ajratadi va ularning tuzatilishi ham boshqacha:
  //   linked = 0  → yangi yo'l bu bazada HECH QACHON ishlamagan (ikki
  //                 tomonlama yozuv 2026-08-30 da qo'shilgan; undan
  //                 oldingi dalillar tabiiy ravishda bog'lanmagan) —
  //                 ya'ni BACKFILL kerak, drift emas;
  //   linked > 0  → yo'l ishlayapti, lekin ba'zi yozuvlar tushib qolgan —
  //                 ya'ni HAQIQIY ajralish.
  const linkedRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*)::bigint AS total
      FROM "SubmissionEvidence"
     WHERE "storageRef" LIKE ${PROOF_REF_PREFIX + "%"}`;
  const linked = Number(linkedRows[0]?.total ?? 0);

  const orphanSample = orphans
    ? await db.$queryRaw<{ label: string }[]>`
        SELECT c.name || ' · ' || p.period || ' · ' || p."colKey" AS label
          FROM "ReportProof" p
          JOIN "Company" c ON c.id = p."companyId"
         WHERE NOT EXISTS (
           SELECT 1 FROM "SubmissionEvidence" e
            WHERE e."storageRef" = ${PROOF_REF_PREFIX} || p.id)
         ORDER BY p."submittedAt" DESC
         LIMIT 5`
    : [];

  checks.push({
    key: "evidence-proof-linked",
    title: "Har bir dalil majburiyatga bog'langan",
    status: orphans === 0 ? "ok" : "error",
    value: orphans,
    detail:
      orphans === 0
        ? "Barcha `ReportProof` qatorlari `SubmissionEvidence` orqali topshirish urinishiga ulangan"
        : `${orphans} ta dalil majburiyat tomonida iz qoldirmagan` +
          (linked === 0
            ? " — va bu bazada BOG'LANGAN dalil umuman yo'q, ya'ni yangi yo'l hali hech qachon ishlamagan (backfill kerak, ajralish emas)"
            : ` (${linked} tasi bog'langan, ya'ni yo'l ishlayapti — bular tushib qolgan)`) +
          `: ${samples(orphanSample, orphans)}`,
    action:
      orphans === 0
        ? undefined
        : linked === 0
          ? "Yangi yo'l ishga tushmagan. Avval `server/proofs.ts` ikki tomonlama yozuvi bilan bitta HAQIQIY topshirish qiling va shu tekshiruv yashil bo'lishini ko'ring; keyin eski dalillarni backfill qiling. Backfillsiz `ReportProof` ni o'chirib bo'lmaydi."
          : "Sabab odatda majburiyat yo'qligi (`no_template` / `no_obligation`): matritsa ustuniga `DeadlineTemplate` yozilmagan. `matrix.obligation_sync_failed` jurnal yozuvlarini ko'ring va shablonni to'ldiring.",
  });

  // ── 2. Osilib qolgan havola ───────────────────────────────────────────
  //
  // Teskari yo'nalish: dalil ko'rsatkichi bor, ko'rsatgan `ReportProof`
  // esa yo'q. `ReportProof` firma o'chirilganda kaskad bilan ketadi
  // (`onDelete: Cascade`), `SubmissionEvidence` esa ketmaydi — u
  // majburiyatga bog'langan. Ya'ni firma arxivlanganda dalil tarixi
  // manbasiz qolishi MUMKIN va buni hech kim ko'rmaydi.
  //
  // `substring(ref from $n)` ISHLATILMAYDI: Prisma uzunlikni bog'langan
  // parametr sifatida yuboradi va Postgres bunda NULL qaytaradi — natijada
  // HAR BIR havola osilgan bo'lib ko'rinardi. Bu yolg'on qizil jonli
  // topshirishda ushlandi. Shuning uchun solishtiruv teskari yo'nalishda:
  // prefiks + id qurilib, satr bilan tenglashtiriladi (1-tekshiruv bilan
  // bir xil uslub).
  const danglingRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*)::bigint AS total
      FROM "SubmissionEvidence" e
     WHERE e."storageRef" LIKE ${PROOF_REF_PREFIX + "%"}
       AND NOT EXISTS (
         SELECT 1 FROM "ReportProof" p
          WHERE ${PROOF_REF_PREFIX} || p.id = e."storageRef")`;
  const dangling = Number(danglingRows[0]?.total ?? 0);

  checks.push({
    key: "evidence-ref-resolves",
    title: "Dalil havolasi mavjud yozuvga boradi",
    status: dangling === 0 ? "ok" : "error",
    value: dangling,
    detail:
      dangling === 0
        ? "Har bir `reportProof:` havolasi mavjud dalil qatoriga boradi"
        : `${dangling} ta dalil havolasi o'chirilgan yoki topilmaydigan \`ReportProof\` ga ishora qiladi`,
    action:
      dangling === 0
        ? undefined
        : "Bu qatorlarni O'CHIRMANG — ular topshirish tarixining yagona izi bo'lishi mumkin. Avval firma arxivlanganini tekshiring, keyin dalilni omborga (`lib/evidenceStore.ts`) qayta bog'lashni rejalashtiring.",
  });

  // ── 3. Ikki tomondagi holat bir narsani aytadimi ──────────────────────
  //
  // Solishtirish AYNAN SHU dalilga bog'langan ENG SO'NGGI urinish bilan
  // qilinadi, majburiyatning umumiy oxirgi urinishi bilan emas: bitta
  // majburiyatga `server/obligations.ts#addSubmission` orqali qo'lda yoki
  // 1C dan ham urinish qo'shilishi mumkin va u dalilga tegishli emas.
  const mismatchRows = await db.$queryRaw<{ total: bigint }[]>`
    WITH linked AS (
      SELECT p.id                AS proof_id,
             p.status            AS proof_status,
             s.status::text      AS sub_status,
             row_number() OVER (PARTITION BY p.id ORDER BY s."attemptNo" DESC) AS rn
        FROM "ReportProof" p
        JOIN "SubmissionEvidence" e   ON e."storageRef" = ${PROOF_REF_PREFIX} || p.id
        JOIN "ObligationSubmission" s ON s.id = e."submissionId")
    SELECT count(*)::bigint AS total
      FROM linked
     WHERE rn = 1
       AND sub_status <> ${STATUS_CASE_SQL}`;
  const mismatched = Number(mismatchRows[0]?.total ?? 0);

  const mismatchSample = mismatched
    ? await db.$queryRaw<{ label: string }[]>`
        WITH linked AS (
          SELECT p.id AS proof_id, p.status AS proof_status, s.status::text AS sub_status,
                 c.name AS company, p.period AS period, p."colKey" AS col_key,
                 row_number() OVER (PARTITION BY p.id ORDER BY s."attemptNo" DESC) AS rn
            FROM "ReportProof" p
            JOIN "Company" c              ON c.id = p."companyId"
            JOIN "SubmissionEvidence" e   ON e."storageRef" = ${PROOF_REF_PREFIX} || p.id
            JOIN "ObligationSubmission" s ON s.id = e."submissionId")
        SELECT company || ' · ' || period || ' · ' || col_key
               || ' (dalil: ' || proof_status || ' ↔ urinish: ' || sub_status || ')' AS label
          FROM linked
         WHERE rn = 1
           AND sub_status <> ${STATUS_CASE_SQL}
         LIMIT 5`
    : [];

  checks.push({
    key: "evidence-status-agrees",
    title: "Dalil holati va topshirish urinishi kelishadi",
    status: mismatched === 0 ? "ok" : "error",
    value: mismatched,
    detail:
      mismatched === 0
        ? "`pending↔sent`, `approved↔accepted`, `rejected↔rejected` — hamma joyda mos"
        : `${mismatched} ta katakda ikki manba boshqa narsa aytadi: ${samples(mismatchSample, mismatched)}`,
    action:
      mismatched === 0
        ? undefined
        : "Nazoratchi qarori `closeSubmissionAttempt` orqali tushmagan. Qaysi tomon haq ekanini QO'LDA aniqlang — avtomatik tenglashtirish qaysi biri to'g'ri ekanini bilmaydi.",
  });

  // ── 4. Urinish raqamlari uzluksiz ─────────────────────────────────────
  //
  // `attemptNo` `(obligationId, attemptNo)` bo'yicha unikal, ya'ni dublikat
  // bo'lolmaydi. Lekin TESHIK bo'lishi mumkin: `count(*)` ni `+1` qilib
  // beruvchi ikkita joy bor (`server/proofs.ts` va `server/obligations.ts`)
  // va ikkalasi ham tranzaksiyasiz o'qib-yozadi. Teshik — yo'qolgan yozuv
  // yoki poyga alomati, shuning uchun `warn`: ma'lumot buzilmagan, lekin
  // tarix to'liq emas.
  const gapRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*)::bigint AS total FROM (
      SELECT "obligationId"
        FROM "ObligationSubmission"
       GROUP BY "obligationId"
      HAVING max("attemptNo") <> count(*)::int OR min("attemptNo") <> 1
    ) x`;
  const gaps = Number(gapRows[0]?.total ?? 0);

  checks.push({
    key: "evidence-attempt-sequence",
    title: "Topshirish urinishlari 1..N, teshiksiz",
    status: gaps === 0 ? "ok" : "warn",
    value: gaps,
    detail:
      gaps === 0
        ? "Har bir majburiyatning urinishlari 1 dan boshlanadi va uzilmaydi"
        : `${gaps} ta majburiyatda urinish raqamlari uzilgan (yo'qolgan yozuv yoki poyga)`,
    action:
      gaps === 0
        ? undefined
        : "Ma'lumot buzilmagan, lekin tarix to'liq emas. `attemptNo` ni `count(*) + 1` bilan hisoblash poygaga ochiq — birlashtirish paytida ketma-ketlik bazaga o'tkazilsin.",
  });

  return checks;
}

/** Eng yomon holat — `lib/reconciliation.ts#worstStatus` bilan bir xil qoida. */
export function hasEvidenceError(checks: ReconCheck[]): boolean {
  return checks.some((c) => c.status === "error");
}
