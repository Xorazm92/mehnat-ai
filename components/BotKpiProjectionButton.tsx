"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";
import { projectResponseKpiToPerformance } from "@/server/botKpiProjection";
import { friendlyError } from "@/lib/actionError";

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
        toast.error(friendlyError(e, "Xatolik yuz berdi"));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title={`Telegram bot javob ko'rsatkichlarini ${month} oyi uchun dashboardga chiqaradi (nazoratchi tasdiqlaydi)`}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-indigo)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bot className="h-3.5 w-3.5" />
      )}
      <span>{pending ? "Chiqarilmoqda…" : `Bot KPI'ni chiqarish (${month})`}</span>
    </button>
  );
}
