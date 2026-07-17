"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import DocumentsModule, { DocumentRecord } from "@/components/DocumentsModule";
import { Company } from "@/types";
import { createDocument, deleteDocument } from "@/server/documents";

interface Props {
  documents: DocumentRecord[];
  companies: Company[];
  canEdit: boolean;
}

export default function DocumentsClient({ documents, companies, canEdit }: Props) {
  const router = useRouter();
  useAutoRefresh();

  const handleSave = async (data: { companyId: string; name: string; filePath: string }) => {
    await createDocument(data);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    router.refresh();
  };

  return (
    <DocumentsModule
      documents={documents}
      companies={companies}
      lang="uz"
      canEdit={canEdit}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
