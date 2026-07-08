import { auth } from "@/lib/auth";
import { getCachedCompanies } from "@/lib/cached-queries";
import { getDocuments } from "@/server/documents";
import { isSeniorRole } from "@/lib/permissions";
import DocumentsClient from "./DocumentsClient";

export default async function DocumentsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const canEdit = isSeniorRole(userRole);

  const [companies, documents] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getDocuments(),
  ]);

  const records = documents.map((d) => ({
    id: d.id,
    companyId: d.companyId,
    companyName: d.company?.name || "—",
    name: d.name,
    filePath: d.filePath,
    mimeType: d.mimeType || undefined,
    uploadedAt: d.uploadedAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <DocumentsClient
        documents={JSON.parse(JSON.stringify(records))}
        companies={JSON.parse(JSON.stringify(companies))}
        canEdit={canEdit}
      />
    </div>
  );
}
