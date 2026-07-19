"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { projectResponseKpiToPerformance } from "@/server/botKpiProjection";

/**
 * Senior-only trigger that projects the bot's response KPI ledger for `month`
 * into `MonthlyPerformance` (as `submitted` rows — a supervisor still approves
 * before payroll). The server action re-checks the senior gate, so rendering
 * this is a UI affordance only. Refreshes the KPI page on success.
 */
export default function BotKpiProjectionButton({ month }: { month: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      try {
        const res = await projectResponseKpiToPerformance(month);
        toast.success(
          `Bot KPI (${month}): ${res.written} qator yozildi` +
            (res.skippedApproved ? `, ${res.skippedApproved} tasdiqlangan o'zgarmadi` : "") +
            (res.written === 0 && res.groups === 0 ? " — bu oyda javob hodisasi yo'q" : ""),
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik yuz berdi");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title="Telegram bot javob KPI'sini shu oy uchun dashboardga chiqaradi (nazoratchi tasdiqlaydi)"
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Chiqarilmoqda…" : `Bot KPI'ni chiqarish (${month})`}
    </button>
  );
}
