"use client";

import React from "react";
import { useRouter } from "next/navigation";
import InventoryModule, { InventoryRecord } from "@/components/InventoryModule";
import { Staff } from "@/types";
import { upsertInventoryItem, deleteInventoryItem } from "@/server/inventory";

interface Props {
  items: InventoryRecord[];
  staff: Staff[];
}

export default function InventoryClient({ items, staff }: Props) {
  const router = useRouter();

  const handleSave = async (data: {
    id?: string;
    name: string;
    serialNumber?: string;
    status: string;
    condition: string;
    assignedToId?: string;
  }) => {
    await upsertInventoryItem(data);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteInventoryItem(id);
    router.refresh();
  };

  return (
    <InventoryModule
      items={items}
      staff={staff}
      lang="uz"
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
