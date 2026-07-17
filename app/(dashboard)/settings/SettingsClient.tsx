"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import SettingsModule, { ProfileData } from "@/components/SettingsModule";
import { updateUser, changePassword } from "@/server/users";

interface Props {
  profile: ProfileData;
}

export default function SettingsClient({ profile }: Props) {
  const router = useRouter();
  useAutoRefresh();

  const handleSaveProfile = async (data: {
    fullName: string;
    phone?: string;
    department?: string;
    avatarColor?: string;
  }) => {
    await updateUser(profile.id, data);
    router.refresh();
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    await changePassword(profile.id, currentPassword, newPassword);
  };

  return (
    <SettingsModule
      profile={profile}
      lang="uz"
      onSaveProfile={handleSaveProfile}
      onChangePassword={handleChangePassword}
    />
  );
}
