import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSeniorRole } from "@/lib/permissions";
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
        },
      },
    },
  });

  if (!proof) {
    notFound();
  }

  // Access check
  if (!isSeniorRole(role) && proof.company.accountantId !== userId) {
    redirect("/403");
  }

  const canReview = isSeniorRole(role);

  return (
    <ProofViewClient
      proof={JSON.parse(JSON.stringify(proof))}
      userRole={role}
      canReview={canReview}
    />
  );
}
