import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCompanyPermission, companyRelations } from "@/lib/access";
import { isCompanyReviewer } from "@/lib/reportPermissions";
import { notFound, redirect } from "next/navigation";
import ProofViewClient from "./ProofViewClient";

export default async function ProofViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const proof = await prisma.reportProof.findUnique({
    where: { id },
    include: {
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

  return (
    <ProofViewClient
      proof={JSON.parse(JSON.stringify(proof))}
      userRole={role}
      canReview={canReview}
    />
  );
}
