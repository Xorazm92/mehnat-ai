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

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CreditCard, Building2, CheckCheck } from "lucide-react";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { DataTable, Money, StatStrip, type DataColumn, type StatItem } from "@/components/ui";
import { usePageSize } from "@/hooks/usePageSize";
import { useTableState } from "@/hooks/useTableState";

import { Button } from "@/components/ui/Button";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import {
  postExpenseTransaction,
  postExpenseCategoryBulk,
  ignoreExpenseTransaction,
  postSalaryFromTransaction,
  postOylikBulk,
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
    hint: "O'zini-o'zi band shaxsga chiqarilgan oylik — pul hisobdan chiqqanda xarajat bo'ladi. Bir tugma bilan yoziladi.",
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
  // Saralash/sahifa/zichlik `useTableState` da — jadval endi `DataTable`
  // ustida va u shu holatni kutadi.
  const table = useTableState({ ns: "navbat", defaultSortKey: "date", defaultSortDir: "desc" });
  const [pageSize, setPageSize] = usePageSize("expense-queue");

  // Navbatda 349 qator bo'lishi mumkin. Hammasini birdan chiqarish sahifani
  // o'qib bo'lmaydigan qilib cho'zadi — ommaviy tugmalar baribir hammasini
  // qamrab oladi, ya'ni to'liq ro'yxat ish uchun shart emas.
  const allRows = useMemo(() => queue.rows.filter((r) => r.group === tab), [queue.rows, tab]);
  // Guruh (tab) almashganda ro'yxat butunlay boshqa bo'ladi — eski sahifada
  // qolib ketish "bo'sh navbat" degan yolg'on taassurot berardi.
  const { setPage } = table;
  useEffect(() => { setPage(1); }, [tab, setPage]);
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

  /**
   * USTUNLAR — jadval ham, telefondagi kartochka ham shundan yasaladi.
   * Amal tugmasi guruhga qarab boshqacha: uch guruh — uch xil yakun.
   */
  const columns: DataColumn<QueueRow>[] = [
    {
      key: "date",
      header: "Sana",
      cell: (r) => <span className="tabular-nums">{formatUzDate(r.valueDate)}</span>,
      sortValue: (r) => r.valueDate,
      width: "110px",
      mobile: "meta",
    },
    {
      key: "account",
      header: "Hisob",
      cell: (r) => r.accountLabel,
      sortValue: (r) => r.accountLabel,
    },
    {
      key: "party",
      header: "Kontragent",
      cell: (r) => (
        <span title={r.purpose ?? ""}>{r.counterpartyName ?? "—"}</span>
      ),
      sortValue: (r) => r.counterpartyName ?? "",
      sticky: true,
      mobile: "title",
    },
    {
      key: "category",
      header: "Toifa",
      cell: (r) => EXPENSE_CATEGORY_LABELS[r.expenseCategory as ExpenseCategory] ?? r.expenseCategory,
      sortValue: (r) => EXPENSE_CATEGORY_LABELS[r.expenseCategory as ExpenseCategory] ?? r.expenseCategory,
      mobile: "status",
    },
    {
      key: "amount",
      header: "Summa",
      cell: (r) => <Money value={r.amount} tone={r.group === "xarajat" ? "out" : "muted"} bold />,
      sortValue: (r) => r.amount,
      numeric: true,
      align: "right",
    },
    {
      key: "actions",
      header: "Amal",
      align: "right",
      cell: (r) => {
        if (r.group === "xarajat") {
          return (
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
          );
        }
        if (r.group === "ichki") {
          return (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => run(r.id, async () => { await ignoreExpenseTransaction({ transactionId: r.id }); })}
            >
              {busy === r.id ? "..." : "Ichki — yopish"}
            </Button>
          );
        }
        return (
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() => run(r.id, async () => { await postSalaryFromTransaction({ transactionId: r.id }); })}
          >
            {busy === r.id ? "..." : "Oylik yozish"}
          </Button>
        );
      },
      mobile: "actions",
    },
  ];

  return (
    // "Chiqim navbati" sarlavhali karta ATAYLAB olib tashlangan — bu blok
    // "Yopish kerak" tabining ICHIDA turadi, tab yorlig'i allaqachon aynan
    // shu ma'noni beradi ("Kassa → Chiqim → Yopish kerak → [bu jadval]").
    // Ikkinchi sarlavha faqat vertikal joy egallardi.
    <div className="rounded-xl" style={card}>
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

      {/* Guruh izohi — StatStrip ustidan chiqadigan tooltip'ga o'xshab, faqat
          matn sifatida bitta qatorda. Alohida katta paragraf edi, endi ixcham. */}
      <p className="px-3 py-1.5 text-micro" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)" }}>
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

      {/* Kartaga o'tkazmalar — OYLIK: bir tugmada hammasi */}
      {tab === "karta" && allRows.length > 0 && (
        <div className="px-3 pb-2">
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run("oylik-bulk", async () => {
                const r = await postOylikBulk({ limit: 100 });
                setNote(
                  `${r.posted} ta oylik yozildi` +
                    (r.failed ? ` · ${r.failed} ta yiqildi: ${r.firstError ?? ""}` : "") +
                    (r.remaining ? ` · ${r.remaining} ta qoldi, yana bosing` : "")
                );
              })
            }
          >
            {busy === "oylik-bulk" ? "..." : `Hammasini oylik yozish (${allRows.length})`}
          </Button>
        </div>
      )}

      <p
        className="px-3 py-2 text-micro"
        style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        {queue.truncated > 0 && `Serverda yana ${queue.truncated} ta · `}
        Ommaviy tugmalar SAHIFANI emas, butun navbatni qamrab oladi
      </p>

      <DataTable
        rows={allRows}
        columns={columns}
        rowKey={(r) => r.id}
        caption={`Chiqim navbati — ${meta.label} guruhi`}
        sortKey={table.sortKey}
        sortDir={table.sortDir}
        onToggleSort={table.toggleSort}
        density={table.density}
        page={table.page}
        pageSize={pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={setPageSize}
        emptyIcon={<CheckCheck size={28} />}
        emptyTitle="Bu guruhda kutayotgan qator yo'q"
        emptyDescription="Vipiskadan kelgan barcha chiqim shu guruhda yopilgan."
      />

    </div>
  );
}
