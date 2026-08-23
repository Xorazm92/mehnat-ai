"use client";

// CHIQIM NAVBATI — vipiskadan kelgan chiqimlarni yopish joyi.
//
// Ilgari bu bitta "Toifalanmagan bank chiqimlari (446)" jadvali edi va u
// YOLG'ON raqam ko'rsatardi: 97 qatori (672,7 mln) hech qachon xarajat
// bo'la olmasdi — ular xodim kartasiga yoki o'z firmamizga o'tkazma. UI
// ularga "boshqa joyda hisobga olinadi" deb yozib, navbatda abadiy
// qoldirardi, va haqiqiy ish (349 ta / 251 mln, asosan soliq) ko'rinmasdi.
//
// Endi uch guruh, uch xil yakun — chunki bu uch xil pul:
//   Xarajat — tashqi kontragentga ketgan, kassaga yoziladi
//   Kartaga — o'z xodimimiz kartasiga, tranzit qoldig'iga qo'shiladi
//   Ichki   — o'z firmalarimiz orasida, hech qayerda xarajat emas
//
// Guruhni SERVER hisoblaydi (`getExpenseQueue`), bu yerda takrorlanmaydi:
// qoida `lib/bank/classifyExpense.ts` da yashaydi va ikki joyda ikki xil
// bo'lib ketmasligi kerak.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CreditCard, Building2, Layers } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/format";
import { Money, StatStrip, type StatItem } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import {
  postExpenseTransaction,
  postExpenseCategoryBulk,
  ignoreExpenseTransaction,
} from "@/server/bankImport";
import { friendlyError } from "@/lib/actionError";

type GroupKey = "xarajat" | "karta" | "ichki";

interface QueueRow {
  id: string;
  valueDate: string;
  amount: number;
  counterpartyName: string | null;
  expenseCategory: string;
  purpose: string | null;
  accountLabel: string;
  group: GroupKey;
}

/** Sahifadan komponentga uzatiladigan shakl — mijoz tomonida yagona ta'rif. */
export interface ExpenseQueueData {
  groups: { key: GroupKey; count: number; amount: number }[];
  byCategory: { category: string; label: string; count: number; amount: number; postable: boolean }[];
  rows: QueueRow[];
  truncated: number;
}

interface Props {
  queue: ExpenseQueueData;
}

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };

const GROUP_META: Record<GroupKey, { label: string; hint: string; icon: React.ReactNode; tone: string }> = {
  xarajat: {
    label: "Xarajat",
    hint: "Tashqi kontragentga ketgan pul — kassaga yoziladi va balansdan chiqadi.",
    icon: <ArrowUpRight size={14} />,
    tone: "var(--accent-red)",
  },
  karta: {
    label: "Kartaga o'tkazma",
    hint: "O'z xodimimizning kartasiga. XARAJAT EMAS — pul hali korxonada, faqat boshqa cho'ntakda. Pastdagi \"bog'lanmagan karta o'tkazmalari\" bo'limida kartaga bog'lanadi.",
    icon: <CreditCard size={14} />,
    tone: "var(--accent-blue)",
  },
  ichki: {
    label: "Firmalararo",
    hint: "O'z firmalarimiz orasidagi harakat — hech qayerda xarajat emas, shu yerda yopiladi.",
    icon: <Building2 size={14} />,
    tone: "var(--text-muted)",
  },
};

export default function ExpenseQueue({ queue }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<GroupKey>("xarajat");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [limit, setLimit] = useState(40);

  // Navbatda 349 qator bo'lishi mumkin. Hammasini birdan chiqarish sahifani
  // o'qib bo'lmaydigan qilib cho'zadi — ommaviy tugmalar baribir hammasini
  // qamrab oladi, ya'ni to'liq ro'yxat ish uchun shart emas.
  const allRows = queue.rows.filter((r) => r.group === tab);
  const rows = allRows.slice(0, limit);
  const meta = GROUP_META[tab];
  const bulkCats = queue.byCategory.filter((c) => c.postable && c.count > 1);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(friendlyError(e, "Bajarib bo'lmadi"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <Layers size={15} style={{ color: "var(--text-muted)" }} />
        <div>
          <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
            Chiqim navbati
          </h2>
          <p className="text-micro" style={{ color: "var(--text-muted)" }}>
            Vipiskadan kelgan har qator uch yakundan biri bilan yopiladi
          </p>
        </div>
      </div>

      {/* Guruhlar — StatStrip ning bosiladigan varianti: har biri ham
          ko'rsatkich, ham filtr. Ilgari bu qo'lda yozilgan tugmalar edi. */}
      <StatStrip
        items={queue.groups.map<StatItem>((g) => ({
          label: GROUP_META[g.key].label,
          value: g.amount,
          tone: g.key === "xarajat" ? "out" : "muted",
          meta: `${g.count} ta`,
          onClick: () => setTab(g.key),
          active: g.key === tab,
        }))}
        minWidth={150}
      />

      <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)" }}>
        {meta.hint}
      </p>

      {error && (
        <div
          className="mx-3 mb-2 p-2 rounded-lg text-micro"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", color: "var(--text-secondary)" }}
        >
          {error}
        </div>
      )}
      {note && (
        <div
          className="mx-3 mb-2 p-2 rounded-lg text-micro"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--text-secondary)" }}
        >
          {note}
        </div>
      )}

      {/* Ommaviy yozish — 135 ta soliq to'lovini bittalab bosish real ish emas. */}
      {tab === "xarajat" && bulkCats.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 items-center">
          <span className="text-micro" style={{ color: "var(--text-muted)" }}>
            Toifa bo&apos;yicha hammasini yozish:
          </span>
          {bulkCats.map((c) => (
            <Button
              key={c.category}
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run(`bulk:${c.category}`, async () => {
                  const r = await postExpenseCategoryBulk({ category: c.category as ExpenseCategory });
                  setNote(
                    `${c.label}: ${r.posted} ta yozildi (${formatNum(r.amount)} so'm)` +
                      (r.failed ? ` · ${r.failed} ta yiqildi: ${r.firstError ?? ""}` : "") +
                      (r.remaining ? ` · ${r.remaining} ta qoldi, yana bosing` : "")
                  );
                })
              }
            >
              {busy === `bulk:${c.category}` ? "..." : `${c.label} (${c.count})`}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-meta text-center" style={{ color: "var(--text-muted)" }}>
            Bu guruhda kutayotgan qator yo&apos;q.
          </p>
        ) : (
          <table className="w-full text-meta">
            <thead>
              <tr style={{ background: "var(--input-bg)" }}>
                <th className="text-left p-2">Sana</th>
                <th className="text-left p-2">Hisob</th>
                <th className="text-left p-2">Kontragent</th>
                <th className="text-left p-2">Toifa</th>
                <th className="text-right p-2">Summa</th>
                <th className="text-right p-2">Amal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td className="p-2 whitespace-nowrap">{formatUzDate(r.valueDate)}</td>
                  <td className="p-2 whitespace-nowrap">{r.accountLabel}</td>
                  <td className="p-2 max-w-[240px] truncate" title={r.purpose ?? ""}>
                    {r.counterpartyName ?? "—"}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {EXPENSE_CATEGORY_LABELS[r.expenseCategory as ExpenseCategory] ?? r.expenseCategory}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Money value={r.amount} tone={r.group === "xarajat" ? "out" : "muted"} bold />
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {r.group === "xarajat" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          run(r.id, async () => {
                            await postExpenseTransaction({
                              transactionId: r.id,
                              category: r.expenseCategory as ExpenseCategory,
                            });
                          })
                        }
                      >
                        {busy === r.id ? "..." : "Kassaga yozish"}
                      </Button>
                    )}
                    {r.group === "ichki" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          run(r.id, async () => {
                            await ignoreExpenseTransaction({ transactionId: r.id });
                          })
                        }
                      >
                        {busy === r.id ? "..." : "Ichki — yopish"}
                      </Button>
                    )}
                    {r.group === "karta" && (
                      <span className="text-micro" style={{ color: "var(--text-muted)" }}>
                        pastda kartaga bog&apos;lanadi
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-micro"
        style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        <span>
          {allRows.length} qatordan {rows.length} tasi
          {queue.truncated > 0 && ` · serverda yana ${queue.truncated} ta`}
          {" · ommaviy tugmalar hammasini qamrab oladi"}
        </span>
        {allRows.length > rows.length && (
          <button
            onClick={() => setLimit((v) => v + 100)}
            className="px-2.5 py-1 rounded-lg font-semibold"
            style={{ background: "var(--input-bg)", color: "var(--text-secondary)" }}
          >
            Yana 100 ta
          </button>
        )}
      </div>
    </div>
  );
}
