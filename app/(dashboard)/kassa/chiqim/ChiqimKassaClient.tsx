"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard, Link2, Plus, Wand2, Snowflake, Play, AlertTriangle, ArrowDownRight, ArrowUpRight,
} from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { groupDigits, ungroupDigits, todayKey, formatNum, formatUzDate } from "@/lib/format";
import { Money } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/bank/classifyExpense";
// Sof konstantalar moduli — `lib/transit.ts` orqali kelsa Prisma/`pg` mijoz
// to'plamiga tortiladi va build "Can't resolve 'dns'/'net'/'tls'" bilan yiqiladi.
import { CHANNEL_TYPE_LABELS, type ChannelType } from "@/lib/transitChannels";
import {
  upsertChannel,
  setChannelActive,
  autoCreateChannelsFromStatements,
  linkCardTransfer,
  spendFromChannel,
  getTransitLedger,
} from "@/server/transit";
import { friendlyError } from "@/lib/actionError";
import ExpenseQueue, { type ExpenseQueueData } from "./ExpenseQueue";
import { Tabs, type TabItem } from "@/components/ui";
import ExpenseModule from "@/components/ExpenseModule";
import type { Expense, BalanceBreakdown } from "@/types";
import { createExpense, updateExpense, deleteExpense, approveExpense, rejectExpense } from "@/server/kassa";
import { usePrompt } from "@/components/ui/ConfirmDialog";

interface Channel {
  id: string;
  type: string;
  label: string;
  cardMask: string | null;
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
  entryCount: number;
  lastMovementAt: string | null;
}

interface UnlinkedTransfer {
  id: string;
  valueDate: string;
  amount: string | number;
  accountLabel: string;
  cardMask: string | null;
  holderName: string | null;
}

interface LedgerRow {
  id: string;
  direction: string;
  amount: string | number;
  date: string;
  category: string | null;
  description: string | null;
}


interface Props {
  overview: { channels: Channel[]; totalBalance: number; unlinkedCount: number };
  unlinked: UnlinkedTransfer[];
  employees: { id: string; fullName: string; role: string }[];
  /** Vipiskadagi chiqimlar — toifalanib kassaga yoziladi. */
  queue: ExpenseQueueData;
  /** Kundalik xo'jalik xarajatlari (ovqat, taksi, non…) — oy bo'yicha. */
  household?: {
    periods: { period: string; total: number; count: number }[];
    total: number;
    count: number;
  };
  /**
   * `KassaEntry(expense)` to'liq ro'yxati — avvalgi mustaqil `/expenses`
   * sahifasi. Xuddi shu jadvalga "Yopish kerak → Xarajat" navbati ham
   * yozadi (`postExpenseFromBankTransaction`) — ikkalasi bir xil ma'lumotni
   * ikki joyda ko'rsatgani "qayerga borishni bilmayman" chalkashligini
   * kuchaytirardi, endi bitta tab.
   */
  expenses: Expense[];
  expenseBalance?: BalanceBreakdown;
  expenseCategories?: string[];
  userRole: string;
  /**
   * `kassa_expense` ruxsati bormi (tranzit kanallarni boshqarish). Yo'q
   * bo'lsa (masalan Nazoratchi, Bosh buxgalter — ular xarajatni
   * tasdiqlaydi, lekin kartalarni boshqarmaydi) faqat "Xarajat" tabi
   * ko'rinadi, qolganlari yashiriladi — RBAC saqlanadi, joylashuv o'zgaradi.
   */
  canManageChannels: boolean;
  /** Eski `/expenses` havolasidan `?tab=xarajat` bilan kelinganda. */
  initialTab?: "navbat" | "kartalar" | "xojalik" | "xarajat";
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

/** Kartadan qilinadigan odatiy xarajatlar. */
const SPEND_CATEGORIES = ["ijara", "aloqa", "ovqat", "soliq", "bank_komissiya", "boshqa"] as const;

export default function ChiqimKassaClient({
  overview, unlinked, employees, household, queue,
  expenses, expenseBalance, expenseCategories, userRole, canManageChannels, initialTab,
}: Props) {
  const router = useRouter();
  const prompt = usePrompt();

  // TABLAR. Sahifada oltita blok bir vertikalda edi: 66 ta karta ro'yxati,
  // chiqim navbati, 15 oylik xo'jalik tarixi va 70 ta bog'lanmagan
  // o'tkazma. Kundalik ish — navbat — eng pastda qolib ketardi.
  //
  // "xarajat" — avvalgi mustaqil `/expenses` sahifasi shu yerga ko'chdi
  // (bir xil `KassaEntry` jadvaliga yoziladigan ikki ekran birlashtirildi).
  // `canManageChannels=false` bo'lgan foydalanuvchi (Nazoratchi, Bosh
  // buxgalter) uchun bu YAGONA tab — qolganlari (Navbat/Kartalar/Xo'jalik)
  // ularning RBAC doirasidan tashqarida.
  type TabKey = "navbat" | "kartalar" | "xojalik" | "xarajat";
  const [tab, setTab] = useState<TabKey>(
    initialTab ?? (canManageChannels ? "navbat" : "xarajat")
  );
  // Toifalash navbati: qaysi qator ustida ish ketyapti va xato matni.

  // Kassaga hali yozilmaganlar — yozilgani ro'yxatdan chiqadi.
  useAutoRefresh();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openLedger, setOpenLedger] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [spendFor, setSpendFor] = useState<Channel | null>(null);

  const { channels, totalBalance, unlinkedCount } = overview;
  const active = channels.filter((c) => c.isActive);
  const frozen = channels.filter((c) => !c.isActive);

  const run = async <T,>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Xatolik");
        return null;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
      return res.data ?? null;
    } catch (e) {
      setError(friendlyError(e) || "Xatolik");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleLedger = async (channelId: string) => {
    if (openLedger === channelId) {
      setOpenLedger(null);
      return;
    }
    setOpenLedger(channelId);
    setLedger((await getTransitLedger(channelId)) as unknown as LedgerRow[]);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            {canManageChannels ? "Chiqim kassa" : "Xarajatlar"}
          </h1>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            {canManageChannels
              ? "Xodim kartalari orqali o'tadigan pul va kassa xarajatlari"
              : "Kassa xarajatlarini ko'rish va tasdiqlash"}
          </p>
        </div>
        {canManageChannels && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={busy}
              onClick={() =>
                run(
                  () => autoCreateChannelsFromStatements(),
                  "Vipiskadan kanallar aniqlandi"
                )
              }
            >
              <Wand2 size={15} /> Vipiskadan aniqlash
            </Button>
            <Button variant="primary" size="md" disabled={busy} onClick={() => setShowNew(true)}>
              <Plus size={15} /> Yangi kanal
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
          <AlertTriangle size={18} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <p className="text-meta whitespace-pre-line flex-1" style={{ color: "var(--text-secondary)" }}>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setError(null)}>Yopish</Button>
        </div>
      )}

      {/* Umumiy holat — faqat "Xodim kartalari" tabida: qoldiq/kanal/bog'lanmagan
          o'tkazma xuddi shu tabning mavzusi. Boshqa tablarda (Yopish kerak,
          Xarajat) bu uchta karta mavzudan tashqari joy egallardi — ishchi
          jadvalgacha yetish uchun ko'proq pastga aylantirish kerak bo'lardi. */}
      {canManageChannels && tab === "kartalar" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl" style={card}>
            <div className="text-meta" style={{ color: "var(--text-muted)" }}>Kartalarda turgan qoldiq</div>
            <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: totalBalance < 0 ? "var(--danger)" : "var(--text)" }}>
              {formatNum(totalBalance)} <span className="text-meta">so&apos;m</span>
            </div>
            <div className="text-micro" style={{ color: "var(--text-muted)" }}>hali sarflanmagan</div>
          </div>
          <div className="p-4 rounded-xl" style={card}>
            <div className="text-meta" style={{ color: "var(--text-muted)" }}>Faol kanallar</div>
            <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>{active.length}</div>
            <div className="text-micro" style={{ color: "var(--text-muted)" }}>{frozen.length} ta muzlatilgan</div>
          </div>
          <div className="p-4 rounded-xl" style={card}>
            <div className="text-meta" style={{ color: "var(--text-muted)" }}>Bog&apos;lanmagan o&apos;tkazma</div>
            <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: unlinkedCount > 0 ? "var(--warning)" : "var(--text)" }}>
              {unlinkedCount}
            </div>
            <div className="text-micro" style={{ color: "var(--text-muted)" }}>qaysi kartaga tushgani noma&apos;lum</div>
          </div>
        </div>
      )}

      {/* `canManageChannels=false` bo'lganda tab almashtirgichning o'zi
          yashiriladi — bitta tab ko'rsatish uchun tanlov taqdim etish
          keraksiz interfeys shovqini bo'lardi. */}
      {canManageChannels && (
        <Tabs
          items={[
            { id: "navbat", label: "Yopish kerak", hint: "Vipiskadan kelgan chiqimni toifalab yopish", count: queue.rows.length || undefined },
            { id: "kartalar", label: "Xodim kartalari", hint: "Kartalar qoldig'i va bog'lanmagan o'tkazmalar", count: unlinked.length || undefined },
            { id: "xojalik", label: "Xo'jalik xarajati", hint: "Ovqat, taksi, non — kunlik xarajatlar" },
            { id: "xarajat", label: "Xarajat", hint: "Kassa xarajatlari ro'yxati va tasdiq oqimi" },
          ] as TabItem<TabKey>[]}
          value={tab}
          onChange={setTab}
          ariaLabel="Chiqim kassa bo'limlari"
        />
      )}

      {/* Yangi kanal */}
      {showNew && (
        <ChannelForm
          employees={employees}
          busy={busy}
          onCancel={() => setShowNew(false)}
          onSave={async (payload) => {
            const ok = await run(() => upsertChannel(payload), "Kanal qo'shildi");
            if (ok !== null) setShowNew(false);
          }}
        />
      )}

      {tab === "kartalar" && (<>
      {/* Kanallar */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Kanallar ({channels.length})
        </h2>
        {channels.length === 0 ? (
          <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--text-muted)" }}>
            Kanal yo&apos;q. &quot;Vipiskadan aniqlash&quot; tugmasi bilan xodim kartalarini avtomatik qo&apos;shing.
          </p>
        ) : (
          channels.map((c) => (
            <div key={c.id} className="rounded-xl overflow-hidden" style={card}>
              <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CreditCard size={15} style={{ color: "var(--text-muted)" }} />
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{c.label}</span>
                    {c.cardMask && (
                      <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>{c.cardMask}</span>
                    )}
                    <span className="text-micro px-1.5 py-0.5 rounded" style={{ background: "var(--input-bg)", color: "var(--text-muted)" }}>
                      {CHANNEL_TYPE_LABELS[c.type as ChannelType] ?? c.type}
                    </span>
                    {!c.isActive && (
                      <span className="text-micro px-1.5 py-0.5 rounded" style={{ background: "var(--input-bg)", color: "var(--text-muted)" }}>
                        muzlatilgan
                      </span>
                    )}
                  </div>
                  <div className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
                    {c.employeeName ? `${c.employeeName} · ` : ""}
                    {c.entryCount} ta harakat
                    {c.lastMovementAt ? ` · oxirgisi ${formatUzDate(c.lastMovementAt)}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-micro" style={{ color: "var(--text-muted)" }}>Qoldiq</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: c.balance < 0 ? "var(--danger)" : c.balance > 0 ? "var(--success)" : "var(--text)" }}>
                      {formatNum(c.balance)}
                    </div>
                  </div>
                  <div className="text-right text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <div><ArrowDownRight size={11} className="inline" /> {formatNum(c.totalIn)}</div>
                    <div><ArrowUpRight size={11} className="inline" /> {formatNum(c.totalOut)}</div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-3 flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => toggleLedger(c.id)}>
                  {openLedger === c.id ? "Tarixni yopish" : "Tarix"}
                </Button>
                {c.isActive && (
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => setSpendFor(c)}>
                    Xarajat yozish
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => setChannelActive(c.id, !c.isActive), c.isActive ? "Muzlatildi" : "Qayta yoqildi")}
                >
                  {c.isActive ? <><Snowflake size={13} /> Muzlatish</> : <><Play size={13} /> Yoqish</>}
                </Button>
              </div>

              {openLedger === c.id && (
                <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--card-border)" }}>
                  {ledger.length === 0 ? (
                    <p className="p-3 text-meta" style={{ color: "var(--text-muted)" }}>Harakat yo&apos;q.</p>
                  ) : (
                    <table className="w-full text-meta">
                      <thead>
                        <tr style={{ background: "var(--input-bg)" }}>
                          <th className="text-left p-2">Sana</th>
                          <th className="text-left p-2">Yo&apos;nalish</th>
                          <th className="text-left p-2">Toifa</th>
                          <th className="text-left p-2">Izoh</th>
                          <th className="text-right p-2">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((e) => (
                          <tr key={e.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                            <td className="p-2 whitespace-nowrap">{formatUzDate(e.date)}</td>
                            <td className="p-2">{e.direction === "in" ? "Kartaga tushdi" : "Sarflandi"}</td>
                            <td className="p-2">
                              {e.category
                                ? (EXPENSE_CATEGORY_LABELS[e.category as never] ?? e.category)
                                : "—"}
                            </td>
                            <td className="p-2 max-w-[320px] truncate">{e.description ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums font-semibold whitespace-nowrap">
                              <Money value={Number(e.amount)} tone={e.direction === "in" ? "in" : "out"} showSign bold />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Xarajat yozish */}
      {spendFor && (
        <SpendForm
          channel={spendFor}
          busy={busy}
          onCancel={() => setSpendFor(null)}
          onSave={async (payload) => {
            const res = await run(
              () => spendFromChannel({ ...payload, channelId: spendFor.id }),
              "Xarajat yozildi"
            );
            if (res !== null) setSpendFor(null);
          }}
        />
      )}

      </>)}

      {tab === "navbat" && (<>
      <ExpenseQueue queue={queue} />

      </>)}

      {tab === "xojalik" && (<>
      {/* Kundalik xo'jalik xarajatlari — 15 oylik tarix Excel'dan import qilingan.
          Tranzit kartalaridan alohida: bular naqd/kassadan to'langan. */}
      {household && household.count > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              Xo&apos;jalik xarajatlari (ovqat, taksi, non)
            </h2>
            <span className="text-meta" style={{ color: "var(--text-muted)" }}>
              {household.count} yozuv · jami {formatNum(household.total)} so&apos;m
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl" style={card}>
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--input-bg)" }}>
                  <th className="text-left p-2">Oy</th>
                  <th className="text-right p-2">Yozuv</th>
                  <th className="text-right p-2">Summa</th>
                </tr>
              </thead>
              <tbody>
                {household.periods.map((p) => (
                  <tr key={p.period} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="p-2 whitespace-nowrap">{p.period}</td>
                    <td className="p-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {p.count}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {formatNum(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}

      {tab === "xarajat" && (
        // Avvalgi mustaqil `/expenses` sahifasi — o'zgarishsiz ko'chirildi
        // (props/callback bir xil, faqat joylashuv o'zgardi).
        <ExpenseModule
          expenses={expenses}
          lang="uz"
          userRole={userRole}
          balance={expenseBalance}
          categories={expenseCategories}
          onSaveExpense={async (expense: Partial<Expense>) => {
            const data = {
              amount: Number(expense.amount || 0),
              date: new Date(expense.date as string),
              category: expense.category as string,
              description: expense.description,
              channelId: expense.channelId || undefined,
            };
            if (!data.channelId) {
              toast.error("Pul manbaini tanlang — qaysi schyot yoki plastikdan chiqdi");
              throw new Error("channelId required");
            }
            try {
              if (expense.id) await updateExpense(expense.id, data);
              else await createExpense(data);
              router.refresh();
            } catch (e) {
              toast.error(friendlyError(e));
              throw e; // modal ochiq qolishi uchun xatoni yuqoriga qaytaramiz
            }
          }}
          onDeleteExpense={async (id: string) => { await deleteExpense(id); router.refresh(); }}
          onApproveExpense={async (id: string) => {
            try { await approveExpense(id); router.refresh(); }
            catch (e) { toast.error(friendlyError(e)); }
          }}
          onRejectExpense={async (id: string) => {
            const reason = await prompt({
              title: "Xarajat rad etilsinmi?",
              reasonLabel: "Rad etish sababi",
              reasonPlaceholder: "Nima uchun rad etilyapti?",
              confirmLabel: "Rad etish",
              tone: "danger",
            });
            if (!reason) return;
            try { await rejectExpense(id, reason); router.refresh(); }
            catch (e) { toast.error(friendlyError(e)); }
          }}
        />
      )}

      {tab === "kartalar" && (<>
      {/* Bog'lanmagan karta o'tkazmalari */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Bog&apos;lanmagan karta o&apos;tkazmalari ({unlinked.length})
        </h2>
        {unlinked.length === 0 ? (
          <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--text-muted)" }}>
            Hammasi bog&apos;langan.
          </p>
        ) : (
          <div className="space-y-2">
            {unlinked.map((t) => (
              <div key={t.id} className="p-3 rounded-xl flex items-center justify-between gap-3 flex-wrap" style={card}>
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: "var(--text)" }}>
                    {t.holderName ?? "Nomsiz"}{" "}
                    {t.cardMask && (
                      <span className="text-micro tabular-nums font-normal" style={{ color: "var(--text-muted)" }}>{t.cardMask}</span>
                    )}
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    {formatUzDate(t.valueDate)} · {t.accountLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums whitespace-nowrap">
                    <Money value={-Math.abs(Number(t.amount))} tone="out" bold />
                  </span>
                  <select
                    className="px-2 py-1.5 rounded-lg text-meta outline-none"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void run(
                        () => linkCardTransfer({ transactionId: t.id, channelId: e.target.value }),
                        "Kanalga bog'landi"
                      );
                    }}
                  >
                    <option value="">Kanalni tanlang…</option>
                    {active.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}{c.cardMask ? ` (${c.cardMask})` : ""}
                      </option>
                    ))}
                  </select>
                  <Link2 size={14} style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>)}

    </div>
  );
}

// ── Yordamchi formalar ───────────────────────────────────────────────────

function ChannelForm({
  employees, busy, onCancel, onSave,
}: {
  employees: { id: string; fullName: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { type: ChannelType; label: string; employeeId: string | null; cardMask: string | null }) => void;
}) {
  const [label, setLabel] = useState("");
  const [cardMask, setCardMask] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<ChannelType>("employee_card");

  const input = "w-full px-3 py-2 rounded-lg text-meta outline-none";
  const style = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" } as const;

  return (
    <div className="p-5 rounded-xl space-y-3" style={{ ...card, borderColor: "var(--accent-blue)" }}>
      <h3 className="font-semibold" style={{ color: "var(--text)" }}>Yangi kanal</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Turi</span>
          <select className={input + " mt-1"} style={style} value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
            {(Object.keys(CHANNEL_TYPE_LABELS) as ChannelType[]).map((t) => (
              <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Nom</span>
          <input className={input + " mt-1"} style={style} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Masalan: Uchqun Azimboyev" />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Karta niqobi</span>
          <input className={input + " mt-1"} style={style} value={cardMask} onChange={(e) => setCardMask(e.target.value)} placeholder="8600****4957" />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Xodim (ixtiyoriy)</span>
          <select className={input + " mt-1"} style={style} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— Bog&apos;lanmagan —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </select>
        </label>
      </div>
      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
        To&apos;liq karta raqami saqlanmaydi — faqat niqob (birinchi 4 va oxirgi 4 raqam).
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="md" disabled={busy || !label.trim()}
          onClick={() => onSave({ type, label, cardMask: cardMask || null, employeeId: employeeId || null })}>
          Saqlash
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>Bekor qilish</Button>
      </div>
    </div>
  );
}

function SpendForm({
  channel, busy, onCancel, onSave,
}: {
  channel: Channel;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { amount: number; date: string; category: string; description?: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  // Toshkent kalendari — UTC standart tunda kecha sanani berardi.
  const [date, setDate] = useState(todayKey());
  const [category, setCategory] = useState<string>("ijara");
  const [description, setDescription] = useState("");

  const input = "w-full px-3 py-2 rounded-lg text-meta outline-none";
  const style = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" } as const;
  const value = Number(ungroupDigits(amount)) || 0;
  const over = value > channel.balance;

  return (
    <div className="p-5 rounded-xl space-y-3" style={{ ...card, borderColor: "var(--accent-blue)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold" style={{ color: "var(--text)" }}>
          {channel.label} — xarajat yozish
        </h3>
        <span className="text-meta tabular-nums" style={{ color: "var(--text-muted)" }}>
          Qoldiq: <b style={{ color: "var(--text)" }}>{formatNum(channel.balance)}</b> so&apos;m
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Summa</span>
          <input
            inputMode="numeric"
            className={input + " mt-1 text-right tabular-nums"}
            style={style}
            value={amount}
            onChange={(e) => setAmount(groupDigits(e.target.value))}
            placeholder="10 000 000"
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Sana</span>
          <input type="date" className={input + " mt-1"} style={style} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Toifa</span>
          <select className={input + " mt-1"} style={style} value={category} onChange={(e) => setCategory(e.target.value)}>
            {SPEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as never] ?? c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Izoh</span>
          <input className={input + " mt-1"} style={style} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ixtiyoriy" />
        </label>
      </div>
      {over && (
        <p className="text-meta" style={{ color: "var(--danger)" }}>
          Qoldiqdan {formatNum(value - channel.balance)} so&apos;m ortiq — bunday yozuvga yo&apos;l qo&apos;yilmaydi.
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="md" disabled={busy || value <= 0 || over}
          onClick={() => onSave({ amount: value, date, category, description })}>
          Yozish
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>Bekor qilish</Button>
      </div>
    </div>
  );
}
