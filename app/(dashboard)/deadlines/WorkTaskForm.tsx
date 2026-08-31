"use client";

/**
 * YANGI VAZIFA formasi — "Ishlar" ekranining tepasida ochiladi.
 *
 * Nega ajratildi: forma o'zining TO'QQIZ maydonli holatini olib yurardi va u
 * `WorkInboxClient` ichida jadval holati bilan yonma-yon turardi. Forma ochiq
 * bo'lmaganda ham holat mavjud edi; jadvalga tegishli har o'zgarish forma
 * holatini ham qayta o'qishga majbur qilardi.
 *
 * Biznes qoidalari SERVERDA (`server/tasks.createTask`): majburiyat
 * tanlanganda firma va muddat MANBADAN meros bo'ladi. Bu yerda faqat forma.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { TaskPriority } from "@prisma/client";
import { createTask } from "@/server/tasks";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import {
  PRIORITY_META,
  TERMINAL,
  type CompanyLite,
  type ObligationRow,
  type UserLite,
} from "./workInboxTypes";

const EMPTY_FORM = {
  title: "",
  description: "",
  companyId: "",
  obligationId: "",
  taskType: "",
  priority: "normal" as TaskPriority,
  assigneeUserId: "",
  dueAt: "",
};

// Maydonlar dizayn tizimining `.erp-input` sinfida (tokenli fon/ramka, fokus
// halqasi, telefonda 16px). Ilgari bu yerda o'z `INPUT_CLASS` + `INPUT_STYLE`
// juftligi bor edi — ramka `--border`, `Select` niki esa `--input-border` edi,
// ya'ni BIR FORMADA ikki xil maydon ko'rinishi.
const INPUT_CLASS = "erp-input mt-1";

export function WorkTaskForm({
  obligations,
  companies,
  users,
  pending,
  run,
  onCreated,
}: {
  obligations: ObligationRow[];
  companies: CompanyLite[];
  users: UserLite[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => void;
  onCreated: () => void;
}) {
  const [f, setF] = useState({ ...EMPTY_FORM });

  const submit = () => {
    if (!f.title.trim()) return toast.error("Sarlavha majburiy");
    run(
      () =>
        createTask({
          title: f.title,
          description: f.description || undefined,
          // Majburiyat tanlansa firma va muddat MANBADAN meros bo'ladi (server).
          companyId: f.obligationId ? undefined : f.companyId || undefined,
          obligationId: f.obligationId || undefined,
          taskType: f.taskType || undefined,
          priority: f.priority,
          assigneeUserId: f.assigneeUserId || undefined,
          dueAt: f.dueAt || undefined,
        }),
      "Vazifa yaratildi",
    );
    setF({ ...EMPTY_FORM });
    onCreated();
  };

  return (
    <div
      className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
      style={{ borderColor: "var(--border, var(--rule))" }}
    >
      <label className="text-xs sm:col-span-2 md:col-span-1" style={{ color: "var(--text-muted)" }}>
        Sarlavha
        <input
          className={INPUT_CLASS}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
      </label>

      <label className="text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>
        Majburiyatga biriktirish
        <Select
          className="mt-1"
          placeholder="— mustaqil vazifa —"
          value={f.obligationId}
          onChange={(e) => setF({ ...f, obligationId: e.target.value })}
        >
          {obligations.filter((o) => !TERMINAL.has(o.status)).map((o) => (
            <option key={o.id} value={o.id}>
              {o.companyName} · {o.templateName} · {o.periodKey}
            </option>
          ))}
        </Select>
      </label>

      {!f.obligationId && (
        <label className="text-xs" style={{ color: "var(--text-muted)" }}>
          Firma
          <Select
            className="mt-1"
            placeholder="—"
            value={f.companyId}
            onChange={(e) => setF({ ...f, companyId: e.target.value })}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      )}

      <label className="text-xs" style={{ color: "var(--text-muted)" }}>
        Tur (SLA uchun)
        <input
          className={INPUT_CLASS}
          value={f.taskType}
          onChange={(e) => setF({ ...f, taskType: e.target.value })}
          placeholder="masalan: hujjat_korish"
        />
      </label>

      <label className="text-xs" style={{ color: "var(--text-muted)" }}>
        Muhimlik
        <Select
          className="mt-1"
          value={f.priority}
          onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}
        >
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </label>

      <label className="text-xs" style={{ color: "var(--text-muted)" }}>
        Mas&apos;ul
        <Select
          className="mt-1"
          placeholder="—"
          value={f.assigneeUserId}
          onChange={(e) => setF({ ...f, assigneeUserId: e.target.value })}
        >
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </Select>
      </label>

      <label className="text-xs" style={{ color: "var(--text-muted)" }}>
        Muddat
        <DateField
          inputClassName={INPUT_CLASS}
          value={f.dueAt}
          onChange={(v) => setF({ ...f, dueAt: v })}
        />
        {f.obligationId && !f.dueAt && (
          <span className="block text-micro" style={{ color: "var(--text-muted)" }}>
            bo&apos;sh qolsa — majburiyat muddati
          </span>
        )}
      </label>

      <label className="text-xs sm:col-span-2 md:col-span-3" style={{ color: "var(--text-muted)" }}>
        Izoh
        <input
          className={INPUT_CLASS}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </label>

      <div className="sm:col-span-2 md:col-span-3">
        <Button variant="success" size="md" loading={pending} onClick={submit}>
          Yaratish
        </Button>
      </div>
    </div>
  );
}

export default WorkTaskForm;
