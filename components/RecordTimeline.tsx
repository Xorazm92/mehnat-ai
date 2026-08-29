"use client";

import React, { useEffect, useState } from "react";
import { History, Plus, Pencil, Trash2, LogIn, LogOut } from "lucide-react";
import { getRecordHistory } from "@/server/audit";
import { formatUzDateTime } from "@/lib/format";
import { ROLE_LABELS, type UserRole } from "@/lib/platform/permissions";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";

/**
 * RECORD TIMELINE — bitta yozuvning o'zgarish tarixi.
 *
 * Auditdagi E4: `AuditLog` sodiqlik bilan yozilardi va HECH QAYERDA
 * ko'rinmasdi. Firma kartasida tarix yo'q, hisobot katagida tarix yo'q,
 * "kim o'zgartirdi" degan savolga javob yo'q edi. Odoo, Dynamics va
 * Salesforce mijoz kartasining o'ng ustunini aynan shu tasmaga beradi —
 * akkaunt-menejerlar shunday ishlaydi.
 *
 * Ma'lumot allaqachon bazada bor edi; yetishmagani — ko'rsatish.
 */

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  create: { label: "Yaratildi", icon: Plus, color: "var(--success)" },
  update: { label: "O'zgartirildi", icon: Pencil, color: "var(--accent-blue)" },
  delete: { label: "O'chirildi", icon: Trash2, color: "var(--danger)" },
  login: { label: "Kirdi", icon: LogIn, color: "var(--text-muted)" },
  logout: { label: "Chiqdi", icon: LogOut, color: "var(--text-muted)" },
};

interface Entry {
  id: string;
  action: string;
  createdAt: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  user: { id: string; fullName: string; role: string } | null;
}

/** O'zgargan maydonlarni eski→yangi ko'rinishida ajratib beradi. */
function changedFields(oldData?: Record<string, unknown> | null, newData?: Record<string, unknown> | null) {
  if (!newData) return [];
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const [k, to] of Object.entries(newData)) {
    const from = oldData?.[k];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    // Parol/token kabi maydonlar tasmada hech qachon ko'rsatilmaydi.
    if (/pass|token|secret|hash/i.test(k)) {
      out.push({ key: k, from: "•••", to: "•••" });
      continue;
    }
    out.push({ key: k, from, to });
  }
  return out.slice(0, 6);
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ha" : "yo'q";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

export function RecordTimeline({
  tableName,
  recordId,
  limit = 25,
}: {
  tableName: string;
  recordId: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [denied, setDenied] = useState(false);

  // Yozuv almashsa holatni render paytida tiklaymiz — effekt ichida sinxron
  // `setState` qilish kaskadli render beradi (React 19 buni belgilaydi).
  const key = `${tableName}:${recordId}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setEntries(null);
    setDenied(false);
  }

  useEffect(() => {
    let cancelled = false;
    getRecordHistory({ tableName, recordId, limit })
      .then((r) => { if (!cancelled) setEntries(r as unknown as Entry[]); })
      .catch(() => { if (!cancelled) { setDenied(true); setEntries([]); } });
    return () => { cancelled = true; };
  }, [tableName, recordId, limit]);

  if (entries === null) return <SkeletonTable rows={4} cols={2} />;

  // Ruxsat yo'qligini JIM yashirmaymiz — sababini aytamiz. Loyihada bu naqsh
  // faqat bitta joyda bor edi (reportPermissions), qolgan joyda taqiqlangan
  // narsa shunchaki g'oyib bo'lardi.
  if (denied) {
    return (
      <EmptyState
        icon={<History size={32} />}
        title="Tarix yopiq"
        description="O'zgarishlar tarixini faqat bosh buxgalter, nazoratchi va administrator ko'ra oladi."
      />
    );
  }

  if (entries.length === 0) {
    return <EmptyState icon={<History size={32} />} title="Hozircha o'zgarish yo'q" />;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => {
        const meta = ACTION_META[e.action] ?? ACTION_META.update;
        const Icon = meta.icon;
        const fields = changedFields(e.oldData, e.newData);
        const isLast = i === entries.length - 1;

        return (
          <li key={e.id} className="flex gap-3">
            {/* Vertikal chiziq — voqealar zanjiri */}
            <div className="flex flex-col items-center flex-shrink-0">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "var(--bg-sunken)", color: meta.color, border: "1px solid var(--rule)" }}
              >
                <Icon size={13} />
              </span>
              {!isLast && <span className="w-px flex-1 my-1" style={{ background: "var(--rule)" }} />}
            </div>

            <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4"}`}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>
                  {meta.label}
                </span>
                <span className="text-meta" style={{ color: "var(--text-secondary)" }}>
                  {e.user?.fullName ?? "Tizim"}
                  {e.user?.role && (
                    <span style={{ color: "var(--text-muted)" }}>
                      {" · "}{ROLE_LABELS[e.user.role as UserRole] ?? e.user.role}
                    </span>
                  )}
                </span>
                <time
                  className="font-mono text-micro ml-auto whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                  dateTime={e.createdAt}
                >
                  {formatUzDateTime(e.createdAt)}
                </time>
              </div>

              {fields.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {fields.map((f) => (
                    <div key={f.key} className="text-micro font-mono flex gap-1.5 flex-wrap">
                      <span style={{ color: "var(--text-muted)" }}>{f.key}</span>
                      <span style={{ color: "var(--text-muted)", textDecoration: "line-through" }}>{fmt(f.from)}</span>
                      <span style={{ color: "var(--text-muted)" }}>→</span>
                      <span style={{ color: "var(--text-primary)" }}>{fmt(f.to)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default RecordTimeline;
