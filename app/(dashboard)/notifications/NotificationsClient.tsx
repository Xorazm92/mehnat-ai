"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import NotificationsModule, { NotificationRecord } from "@/components/NotificationsModule";
import { markNotificationsRead } from "@/server/audit";

interface Props {
  notifications: NotificationRecord[];
}

export default function NotificationsClient({ notifications }: Props) {
  const router = useRouter();
  useAutoRefresh();

  const handleMarkRead = async (ids?: string[]) => {
    await markNotificationsRead(ids);
    router.refresh();
  };

  return (
    <NotificationsModule
      notifications={notifications}
      lang="uz"
      onMarkRead={handleMarkRead}
    />
  );
}
