import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission, companyRelations } from "@/lib/platform/access";
import { isCompanyReviewer } from "@/lib/reportPermissions";
import { notFound, redirect } from "next/navigation";
import ProofViewClient from "./ProofViewClient";
import { SubmissionTrail, type TrailAttempt } from "./SubmissionTrail";
import { PROOF_REF_PREFIX } from "@/lib/evidenceConsistency";

export default async function ProofViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) {
    redirect("/login?expired=1");
  }

  const userId = session.user.id as string;
  const role = session.user.role as string;

  // `fileData` bu yerda ham tanlanmaydi — sahifa uni ko'rsatmaydi, faqat
  // havola beradi (`/api/proofs/[id]/file`). Aks holda har ochilishda 2 MB
  // serverdan klientga uzatilardi.
  const proof = await prisma.reportProof.findUnique({
    where: { id },
    select: {
      id: true, companyId: true, period: true, colKey: true,
      fileName: true, fileType: true, note: true, status: true,
      submittedById: true, submittedByName: true, submittedAt: true,
      reviewedById: true, reviewedByName: true, reviewedAt: true, rejectReason: true,
      company: {
        select: {
          id: true,
          name: true,
          inn: true,
          accountantId: true,
          supervisorId: true,
          chiefAccountantId: true,
          bankClientId: true,
          departmentRef: { select: { chiefAccountantId: true } },
          // Mas'uliyat slotdan YOKI "Jamoa" biriktiruvidan kelishi mumkin.
          contractAssignments: { where: { isActive: true }, select: { userId: true, role: true } },
        },
      },
    },
  });

  if (!proof) {
    notFound();
  }

  // Obyekt-scope: dalil portfeldagi firmaga tegishli bo'lishi shart
  try {
    await assertCompanyPermission(prisma, { id: userId, role }, proof.companyId, "proof:read");
  } catch {
    redirect("/403");
  }

  // Tasdiqlash — faqat shu firmaning nazoratchisi (o'z-o'zini nazorat bloki)
  const canReview = isCompanyReviewer(role, companyRelations(proof.company, userId));

  // TOPSHIRISH TARIXI. `SubmissionEvidence` dalilga `storageRef` satri orqali
  // ishora qiladi (chet kalit emas — u tashqi omborga ham ishora qilishi
  // mumkin), shuning uchun bog'lanish shu prefiks bilan quriladi.
  //
  // Ruxsat YUQORIDA tekshirilgan: bu qator faqat `proof:read` o'tgandan keyin
  // o'qiladi va faqat SHU dalilga tegishli urinishlarni qaytaradi.
  const evidence = await prisma.submissionEvidence.findMany({
    where: { storageRef: `${PROOF_REF_PREFIX}${proof.id}` },
    select: {
      submission: {
        select: {
          id: true, attemptNo: true, status: true, sentAt: true,
          acceptedAt: true, rejectedAt: true, rejectionNote: true, sourceSystem: true,
        },
      },
    },
  });

  const attempts: TrailAttempt[] = evidence
    .map((e) => ({
      id: e.submission.id,
      attemptNo: e.submission.attemptNo,
      status: e.submission.status as string,
      sentAt: e.submission.sentAt?.toISOString() ?? null,
      acceptedAt: e.submission.acceptedAt?.toISOString() ?? null,
      rejectedAt: e.submission.rejectedAt?.toISOString() ?? null,
      rejectionNote: e.submission.rejectionNote,
      sourceSystem: e.submission.sourceSystem,
    }))
    .sort((a, b) => a.attemptNo - b.attemptNo);

  return (
    <div className="space-y-4">
      <ProofViewClient
        proof={JSON.parse(JSON.stringify(proof))}
        userRole={role}
        canReview={canReview}
      />
      <SubmissionTrail attempts={attempts} />
    </div>
  );
}
