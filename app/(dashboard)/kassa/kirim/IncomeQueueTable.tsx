"use client";

// =====================================================
// BOG'LANMAGAN KIRIMLAR NAVBATI
// =====================================================
//
// Navbat IKKI TOMONDAN qaraydi va shuning uchun ikkala jadval ham shu yerda:
//
//   yuqorida — pul ASROda bor, QAYSI FIRMA ekani noma'lum
//   pastda   — firma to'lagani 1C kesimidan ma'lum, PUL ASROda yo'q
//
// NEGA ALOHIDA FAYL. `KirimKassaClient` 1329 qator edi. Navbat qismi o'z
// qidiruvi, o'z filtri va har qator uchun mustaqil holatga ega kartochkasi
// bilan keladi — ular ota komponentda yashaganda fayl bo'ylab uch xil ish
// (yuklash, navbat, qo'lda kiritish) bir-birining ichiga o'ralashib ketardi.

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, EyeOff, Inbox } from "lucide-react";
import { Badge, DataTable, EmptyState, Money, SearchInput, type DataColumn } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { CompanySelect } from "@/components/ui/CompanySelect";
import { Select } from "@/components/ui/Select";
import { formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import {
  matchAndPostTransaction,
  ignoreTransaction,
  postExpenseFromBankTransaction,
} from "@/server/bank/post";
import type { UnallocatedIncomeReport } from "@/server/debt";

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

export interface UnmatchedRow {
  id: string;
  valueDate: string;
  docNumber: string | null;
  amount: string | number;
  counterpartyInn: string | null;
  counterpartyName: string | null;
  contractHint: string | null;
  purpose: string | null;
  account: { label: string };
}

export interface CompanyOption {
  id: string;
  name: string;
  inn: string;
  contracts: { id: string; number: string }[];
}

export interface IncomeQueueTableProps {
  unmatched: UnmatchedRow[];
  companies: CompanyOption[];
  unallocated: UnallocatedIncomeReport;
  period: string;
  /** Navbatdan qator yopilgach — ota komponent ro'yxatlarni yangilaydi. */
  onDone: () => void;
}

export default function IncomeQueueTable({
  unmatched,
  companies,
  unallocated,
  period,
  onDone,
}: IncomeQueueTableProps) {
  const [search, setSearch] = useState("");
  const totalUnmatched = unmatched.length;


  const filteredUnmatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unmatched;
    return unmatched.filter(
      (u) =>
        (u.counterpartyName ?? "").toLowerCase().includes(q) ||
        (u.counterpartyInn ?? "").includes(q) ||
        (u.contractHint ?? "").toLowerCase().includes(q)
    );
  }, [unmatched, search]);
  return (
    <>
      {/* Moslashtirilmaganlar navbati */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
            Moslashtirilmagan kirimlar ({totalUnmatched})
          </h2>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Nom, STIR yoki shartnoma"
            ariaLabel="Moslashtirilmagan kirimlar ichidan qidirish"
          />
        </div>

        {filteredUnmatched.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<Inbox size={28} />}
              title={search.trim() ? "Qidiruvga mos kirim topilmadi" : "Moslashtirilmagan kirim yo'q"}
              description={
                search.trim()
                  ? "Boshqa nom, STIR yoki shartnoma raqamini kiriting."
                  : "Vipiskadagi barcha kirimlar firmalarga bog'langan."
              }
              action={
                search.trim() ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearch("")}>
                    Qidiruvni tozalash
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUnmatched.map((tx) => (
              <UnmatchedCard
                key={tx.id}
                tx={tx}
                companies={companies}
                onDone={onDone}
              />
            ))}
          </div>
        )}
      </div>

      <UnallocatedVsDebt report={unallocated} period={period} />
    </>
  );
}

/**
 * 1C BO'YICHA TO'LAGAN, ASRODA TAQSIMLANMAGAN.
 *
 * Yuqoridagi navbat bilan TESKARI tomondan qaraydi va shu sababli aynan shu
 * yorliqda turadi:
 *
 *   yuqorida — pul ASROda bor, QAYSI FIRMA ekani noma'lum
 *   bu yerda  — firma to'lagani 1C kesimidan ma'lum, PUL ASROda yo'q
 *
 * Faqat KO'RSATADI, tuzatmaydi: bo'shliqning sababi har xil (vipiska
 * yuklanmagan, boshqa hisobga tushgan, plastik reestri kelmagan) va uni
 * avtomatik yopish pulni o'ylab topish bo'lardi.
 */
function UnallocatedVsDebt({ report, period }: { report: UnallocatedIncomeReport; period: string }) {
  const columns: DataColumn<UnallocatedIncomeReport["rows"][number]>[] = [
    {
      key: "company",
      header: "Firma",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate" style={{ color: "var(--text)" }}>{r.companyName}</div>
          <div className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>{r.inn}</div>
        </div>
      ),
      sortValue: (r) => r.companyName,
      sticky: true,
    },
    {
      key: "collected",
      header: "1C bo'yicha to'lagan",
      cell: (r) => <Money value={r.collected} />,
      sortValue: (r) => r.collected,
      numeric: true,
    },
    {
      key: "allocated",
      header: "ASROda taqsimlangan",
      cell: (r) => <Money value={r.allocated} dashIfZero />,
      sortValue: (r) => r.allocated,
      numeric: true,
    },
    {
      key: "gap",
      header: "Yetishmaydi",
      cell: (r) => <Money value={r.gap} tone="out" bold />,
      sortValue: (r) => r.gap,
      numeric: true,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          1C bo'yicha to'lagan, ASROda taqsimlanmagan ({report.rows.length})
        </h2>
        {report.totalGap > 0 && (
          <div className="text-meta" style={{ color: "var(--text-secondary)" }}>
            Jami yetishmaydi: <Money value={report.totalGap} tone="out" unit bold />
          </div>
        )}
      </div>

      {/* Qaysi kesimlar solishtirilgani AYTILADI — aks holda raqam qayerdan
          kelgani noma'lum bo'lib, ishonch yo'qoladi. */}
      <p className="text-meta" style={{ color: "var(--text-muted)" }}>
        {period} · 1C kesimlari:{" "}
        {report.openingAsOf ? formatUzDate(report.openingAsOf) : "—"} →{" "}
        {report.asOf ? formatUzDate(report.asOf) : "—"}
      </p>

      <DataTable
        rows={report.rows}
        columns={columns}
        rowKey={(r) => r.companyId}
        caption="1C bo'yicha to'lagan, ASROda taqsimlanmagan firmalar"
        density="compact"
        emptyIcon={<Inbox size={28} />}
        emptyTitle={
          report.asOf
            ? "Bo'shliq yo'q"
            : "1C kesimi topilmadi"
        }
        emptyDescription={
          report.asOf
            ? "1C kesimi bo'yicha to'langan pulning hammasi ASROda taqsimlangan."
            : "Bu oy uchun qarzdorlik kesimi yuklanmagan — solishtirish uchun manba yo'q."
        }
      />
    </div>
  );
}

/** Bitta moslashtirilmagan tranzaksiya — firma tanlab hisobga olinadi. */
function UnmatchedCard({
  tx,
  companies,
  onDone,
}: {
  tx: UnmatchedRow;
  companies: CompanyOption[];
  onDone: () => void;
}) {
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [busy, setBusy] = useState(false);
  // "BU CHIQIM" rejimi — qator haqiqatda chiqim bo'lsa (xodimga oylik,
  // firmalararo yordam…). Ilgari bunday qatorni yopib bo'lmagan va u
  // navbatda abadiy turardi.
  const [expenseMode, setExpenseMode] = useState(false);
  const [expCategory, setExpCategory] = useState("oylik");
  const [expNote, setExpNote] = useState("");

  // STIR bo'yicha taklif — ko'pincha firma bazada bor, lekin STIR biroz
  // boshqacha yozilgan yoki bir nechta firma mos kelgan.
  const suggested = useMemo(
    () => (tx.counterpartyInn ? companies.filter((c) => c.inn === tx.counterpartyInn) : []),
    [companies, tx.counterpartyInn]
  );
  const selected = companies.find((c) => c.id === companyId);

  const post = async () => {
    if (!companyId) {
      toast.error("Avval firmani tanlang");
      return;
    }
    setBusy(true);
    try {
      await matchAndPostTransaction({
        transactionId: tx.id,
        companyId,
        contractId: contractId || null,
      });
      toast.success("Kirim hisobga olindi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const saveAsExpense = async (isSalary: boolean) => {
    setBusy(true);
    try {
      await postExpenseFromBankTransaction({
        transactionId: tx.id,
        category: isSalary ? "Oylik" : expCategory,
        description: expNote.trim() || tx.counterpartyName || null,
        isSalary,
      });
      toast.success(isSalary ? "Oylik chiqimi yozildi" : "Chiqim yozildi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await ignoreTransaction(tx.id, "Mijoz to'lovi emas");
      toast.success("E'tiborsiz qoldirildi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl" style={card}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {tx.counterpartyName ?? "Nomsiz"}
            </span>
            {tx.counterpartyInn && (
              <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                STIR {tx.counterpartyInn}
              </span>
            )}
            {tx.contractHint && <Badge tone="info">{tx.contractHint}</Badge>}
          </div>
          <div className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
            {formatUzDate(tx.valueDate)} · {tx.account.label}
            {tx.docNumber ? ` · hujjat ${tx.docNumber}` : ""}
          </div>
          {tx.purpose && (
            <div className="text-micro mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
              {tx.purpose}
            </div>
          )}
        </div>
        <div className="text-lg font-semibold tabular-nums whitespace-nowrap">
          <Money value={Number(tx.amount)} tone="in" showSign bold />
        </div>
      </div>

      {expenseMode ? (
        /* ── CHIQIM REJIMI ─────────────────────────────────────────────── */
        <div className="mt-3 p-3 rounded-lg space-y-2" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            Bu pul MIJOZ to&apos;lovi emas — xarajat sifatida yoziladi (kassadan chiqdi).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
            <Select
              size="sm"
              fullWidth={false}
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              disabled={busy}
              aria-label="Xarajat toifasi"
            >
              <option value="oylik">Oylik / maosh</option>
              <option value="Moliyaviy yordam">Moliyaviy yordam</option>
              <option value="Qarz">Qarz berish</option>
              <option value="Ijara">Ijara</option>
              <option value="Aloqa">Aloqa</option>
              <option value="Ovqatga">Ovqat</option>
              <option value="Texnika">Texnika</option>
              <option value="Boshqa xarajatlar">Boshqa</option>
            </Select>
            <input
              placeholder="Kimga / nima uchun (ixtiyoriy)"
              aria-label="Kimga / nima uchun"
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              disabled={busy}
              className="erp-input min-w-0"
            />
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void saveAsExpense(expCategory === "oylik")}>
              Yozish
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setExpenseMode(false)}>
              Orqaga
            </Button>
          </div>
        </div>
      ) : (
        <>
          {suggested.length === 1 && companyId !== suggested[0].id && (
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => { setCompanyId(suggested[0].id); setContractId(""); }}
              >
                <Link2 size={12} /> {suggested[0].name} — STIR mos
              </Button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <div className="flex gap-2">
              {/*
                Taklif ro'yxat ICHIDA `optgroup` bo'lib turardi: tizim javobni
                bilardi, lekin uni ko'rish uchun 269 talik ro'yxatni ochish
                kerak edi. Bank xodimi kechqurun o'nlab qatorni biriktiradi —
                shuning uchun BITTA aniq taklif endi bosiladigan chip.
              */}
              <CompanySelect
                className="flex-1 min-w-0"
                size="sm"
                companies={companies}
                value={companyId}
                onChange={(next) => {
                  setCompanyId(next);
                  setContractId("");
                }}
                suggestions={suggested.map((c) => c.id)}
                placeholder="Firmani tanlang…"
              />

              {selected && selected.contracts.length > 0 && (
                <Select
                  size="sm"
                  fullWidth={false}
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  placeholder="Shartnomasiz"
                  aria-label="Shartnoma"
                >
                  {selected.contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <Button variant="primary" size="sm" disabled={busy || !companyId} onClick={post}>
              <Link2 size={14} /> Hisobga olish
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={skip}>
              <EyeOff size={14} /> E&apos;tiborsiz
            </Button>
          </div>

          {/* QATOR HAQIQATDA KIRIM EMASMI? — oylik o'tkazmalari kabi.
              Buni yopishning yagona yo'li ilgari navbatni to'ldirib qo'yardi. */}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={() => setExpenseMode(true)}
          >
            Bu mijoz to&apos;lovi emas — chiqim sifatida yozish (oylik, yordam…) →
          </Button>
        </>
      )}
    </div>
  );
}
