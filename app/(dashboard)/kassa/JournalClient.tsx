"use client";

// =====================================================
// OPERATSIYALAR JURNALI — buxgalterning "Excel varag'i"
// =====================================================
//
// Barcha pul harakati bitta jadvalda: kassa kirim/chiqim, shartnoma
// to'lovlari va oyliklar. Manbalar `server/kassaJournal.ts` da
// birlashtiriladi — bu yerda faqat ko'rsatish, filtrlash va tez kiritish.
//
// TEZ KIRITISH Exceldagi kabi: yozding → saqlandi → ro'yxat yangilanadi,
// forma ochiq qoladi (summa bo'shadi, tur/kassa/sana QOLADI) — ketma-ket
// 10 ta xarajat kiritish uchun har safar formani ochib-yopish shart emas.

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { Pagination, pageSlice } from "@/components/ui";
import { usePageSize } from "@/hooks/usePageSize";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownRight, ArrowUpRight, Download, Plus, Search, Trash2,
  CheckCircle2, XCircle, Clock, NotebookPen, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { useConfirm, usePrompt } from "@/components/ui/ConfirmDialog";
import { groupDigits, ungroupDigits, todayKey, formatUzDate, formatNum } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { canApproveExpense } from "@/lib/expenseApproval";
import { RANGE_LABELS, type RangePreset } from "@/lib/dateRange";
import { exportRowsToExcel, type ExportColumn } from "@/lib/exportTable";
import type { JournalRow } from "@/server/kassaJournal";
import { getKassaJournal } from "@/server/kassaJournal";
import {
  createKassaEntry, deleteKassaEntry, approveExpense, rejectExpense,
} from "@/server/kassa";
import { DateField } from "@/components/ui/DateField";
import { isSalaryCategory } from "@/lib/salaryCategory";

const PRESETS: RangePreset[] = ["month_to_date", "last_month", "today", "yesterday", "this_week", "year_to_date", "custom"];

const SOURCE_BADGE: Record<string, { bg: string; fg: string }> = {
  kassa: { bg: "var(--input-bg)", fg: "var(--text-secondary)" },
  shartnoma: { bg: "var(--accent-blue-light)", fg: "var(--accent-blue)" },
  oylik: { bg: "var(--warning-bg)", fg: "var(--warning)" },
};

interface Props {
  userRole: string;
  /** Korxona lug'ati — tez kiritish formasi uchun. */
  incomeCategories: string[];
  expenseCategories: string[];
}

export default function JournalClient({ userRole, incomeCategories, expenseCategories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const [preset, setPreset] = useState<RangePreset>("month_to_date");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [kind, setKind] = useState<"all" | "kirim" | "chiqim">("all");
  const [channelId, setChannelId] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<JournalRow[]>([]);
  const [totals, setTotals] = useState<{ kirim: number; chiqim: number; netto: number }>({ kirim: 0, chiqim: 0, netto: 0 });
  const [truncated, setTruncated] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ── Tez kiritish holati ────────────────────────────────────────────────
  // `?add=kirim|chiqim` — Dashboard "Tezkor amallar"dan kelganda forma
  // avtomatik ochiladi va turi to'g'ri o'rnatiladi (yana bir marta
  // "Yozuv qo'shish" tugmasini qidirish shart bo'lmasin).
  const addParam = searchParams.get("add");
  const [addOpen, setAddOpen] = useState(addParam === "kirim" || addParam === "chiqim");
  const [addKind, setAddKind] = useState<"kirim" | "chiqim">(addParam === "kirim" ? "kirim" : "chiqim");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(todayKey());
  const [saveChannelId, setSaveChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  // Sana va izoh — ORTIQCHA maydonlar emas, lekin har safar ko'rinishi shart
  // ham emas: sana standart bugun, izoh ixtiyoriy. Asosiy 4 ta maydon
  // (tur/summa/toifa/kassa) darhol ko'rinadi, bularniki "Batafsil" ostida.
  const [showAdvanced, setShowAdvanced] = useState(false);

  /**
   * CHIQIMDA OYLIK TOIFASI TAKLIF QILINMAYDI.
   *
   * Server uni allaqachon rad etadi (`server/kassa.ts#assertNotSalary`) —
   * oylik `/payroll` orqali beriladi va uni kassa chiqimi qilib yozish
   * bitta pulni ikki marta hisoblaydi. Lekin ekran o'sha taqiqlangan
   * tanlovni ro'yxatda TAKLIF QILARDI: foydalanuvchi tanlar, summani
   * yozar, saqlar — va faqat shundan keyin xato ko'rardi. Next
   * production'da esa xato matni yashirilgani uchun SABABNI ham
   * ko'rmasdi (brauzer testida tasdiqlangan).
   *
   * Endi noto'g'ri tanlov umuman mavjud emas — xatoni tushuntirishdan
   * ko'ra oldini olish yaxshiroq. Kirimda cheklov yo'q: oylik QAYTIB
   * tushishi mumkin (masalan ortiqcha berilgan pul qaytarilishi).
   */
  const categoryOptions = useMemo(
    () =>
      addKind === "kirim"
        ? incomeCategories
        : expenseCategories.filter((c) => !isSalaryCategory(c)),
    [addKind, incomeCategories, expenseCategories],
  );
  const salaryHidden =
    addKind === "chiqim" && expenseCategories.some((c) => isSalaryCategory(c));

  // Tur almashganda toifa ro'yxati ham almashadi. Effekt EMAS: React 19
  // effekt ichidagi sinxron setState ni kaskadli render deb belgilaydi —
  // rasmiy naqsh: render paytida oldingi qiymat bilan solishtirish.
  const [prevOptions, setPrevOptions] = useState(categoryOptions);
  if (categoryOptions !== prevOptions) {
    setPrevOptions(categoryOptions);
    setCat(categoryOptions[0] ?? "");
  }

  const load = () => {
    let cancelled = false;
    startTransition(() => {
      // Qidiruv MIJOZDA filtrlanadi — har harfda serverga so'rov yubormaslik
      // uchun (jurnal limiti 1000, mijozda filtrlash tez).
      getKassaJournal({
        preset,
        custom: preset === "custom" ? { from: customFrom, to: customTo } : undefined,
        kind,
        channelId: channelId || null,
      })
        .then((res) => {
          if (cancelled) return;
          setRows(res.rows);
          setTotals(res.totals);
          setTruncated(res.truncated);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(friendlyError(e) || "Jurnalni yuklab bo'lmadi");
        });
    });
    return () => { cancelled = true; };
  };

  useEffect(load, [preset, customFrom, customTo, kind, channelId]);

  // Qidiruv MIJOZDA (har harf uchun serverga so'rov yubormaslik uchun).
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.who?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.channelLabel?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  /**
   * SAHIFALASH. Jurnal 1165 qatorgacha chiqadi va ilgari hammasi bitta uzun
   * sahifada chizilardi — brauzer ming qatorlik DOM ni qurib, aylantirish
   * sekinlashardi, kerakli yozuvni topish esa faqat qidiruv orqali edi.
   *
   * DIQQAT: jami summalar (`shown`) SAHIFADAN emas, butun filtrdan
   * hisoblanadi — pastdagi "Kirim/Chiqim/Sof" qatori sahifa almashganda
   * o'zgarmasligi kerak, aks holda u hisobot emas, tasodifiy bo'lak bo'lardi.
   */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("journal");
  const paged = useMemo(() => pageSlice(visible, page, pageSize), [visible, page]);

  // Filtr yoki qidiruv ro'yxatni qisqartirsa, joriy sahifa mavjud bo'lmay
  // qolishi mumkin — o'shanda boshiga qaytamiz, bo'sh ekran ko'rsatmaymiz.
  useEffect(() => { setPage(1); }, [preset, customFrom, customTo, kind, channelId, search]);

  // Ekrandagi jami HAR DOIM ko'rinayotgan qatorlardan (pending/rejected jamga
  // kirmaydi — manba bilan bir xil qoida).
  const shown = useMemo(() => {
    let kirim = 0;
    let chiqim = 0;
    for (const r of visible) {
      if (r.status === "rejected" || r.status === "pending") continue;
      if (r.kind === "kirim") kirim += r.amount;
      else chiqim += r.amount;
    }
    return { kirim, chiqim, netto: kirim - chiqim };
  }, [visible]);
  const displayTotals = search.trim() ? shown : totals;

  const saveNew = async () => {
    const amt = Number(ungroupDigits(amount));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Summani kiriting"); return; }
    if (!saveChannelId) { toast.error("Kassani tanlang — pul qayerdan chiqdi/kirdi"); return; }
    if (!cat) { toast.error("Toifani tanlang"); return; }
    setSaving(true);
    try {
      await createKassaEntry({
        type: addKind === "kirim" ? "income" : "expense",
        category: cat,
        amount: amt,
        description: desc.trim() || undefined,
        date: new Date(date),
        channelId: saveChannelId,
      });
      toast.success(addKind === "kirim" ? "Kirim yozildi" : "Chiqim yozildi");
      // Exceldagidek: summa va izoh bo'shaydi, tur/kassa/sana/toifa QOLADI —
      // ketma-ket kiritishda har safar hammasini qayta tanlamaysiz.
      setAmount("");
      setDesc("");
      load();
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (row: JournalRow) => {
    try { await approveExpense(row.id); load(); router.refresh(); }
    catch (e) { toast.error(friendlyError(e)); }
  };

  const onReject = async (row: JournalRow) => {
    const reason = await prompt({
      title: "Xarajat rad etilsinmi?",
      reasonLabel: "Rad etish sababi",
      confirmLabel: "Rad etish",
      tone: "danger",
    });
    if (!reason) return;
    try { await rejectExpense(row.id, reason); load(); router.refresh(); }
    catch (e) { toast.error(friendlyError(e)); }
  };

  const onDelete = async (row: JournalRow) => {
    // Sabab majburiy — `rejectExpense` bilan bir xil audit standarti:
    // moliyaviy yozuv o'chirilganda "nega" har doim yozilib qolishi kerak.
    const reason = await prompt({
      title: "Yozuv o'chirilsinmi?",
      description: `${formatUzDate(row.date)} · ${formatNum(row.amount)} so'm. Jurnal izi teskari yozuv bilan nolga tushadi.`,
      reasonLabel: "O'chirish sababi",
      confirmLabel: "O'chirish",
      tone: "danger",
    });
    if (!reason) return;
    try { await deleteKassaEntry(row.id, reason); load(); router.refresh(); }
    catch (e) { toast.error(friendlyError(e)); }
  };

  const exportColumns: ExportColumn<JournalRow>[] = [
    { key: "date", header: "Sana", exportValue: (r) => (r.date ? formatUzDate(r.date) : "") },
    { key: "kind", header: "Turi", exportValue: (r) => (r.kind === "kirim" ? "Kirim" : "Chiqim") },
    { key: "source", header: "Manba", exportValue: (r) => r.sourceLabel },
    { key: "channel", header: "Kassa", exportValue: (r) => r.channelLabel ?? "" },
    { key: "who", header: "Kim", exportValue: (r) => r.who ?? "" },
    { key: "category", header: "Toifa", exportValue: (r) => r.category ?? "" },
    { key: "description", header: "Izoh", exportValue: (r) => r.description ?? "" },
    { key: "status", header: "Holat", exportValue: (r) => r.status === "pending" ? "Kutilmoqda" : r.status === "rejected" ? "Rad etildi" : "" },
    { key: "amount", header: "Summa", exportValue: (r) => r.amount },
  ];

  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" } as const;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      {/* Sarlavha */}
      <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center gap-2">
          <NotebookPen size={15} style={{ color: "var(--text-muted)" }} />
          <div>
            <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
              Operatsiyalar jurnali
            </h2>
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Barcha pul harakati bitta jadvalda · Excel dagidek filtr va eksport
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--accent-green)" }}>
            +{formatNum(displayTotals.kirim)}
          </span>
          <span className="text-meta tabular-nums font-semibold" style={{ color: "var(--accent-red)" }}>
            −{formatNum(displayTotals.chiqim)}
          </span>
          <span className="text-meta tabular-nums font-bold" style={{ color: displayTotals.netto >= 0 ? "var(--text)" : "var(--danger)" }}>
            Sof: {formatNum(displayTotals.netto)} so&apos;m
          </span>
        </div>
      </div>

      {/* Filtrlar */}
      <div className="px-3 py-2 space-y-2" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="px-2.5 py-1 rounded-lg text-micro font-semibold transition-colors"
              style={preset === p
                ? { background: "var(--accent-blue)", color: "#fff" }
                : inputStyle}
            >
              {RANGE_LABELS[p]}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <DateField className="w-auto" inputClassName="px-2 py-1 rounded-lg text-micro outline-none" inputStyle={inputStyle} value={customFrom} onChange={setCustomFrom} />
              <span className="text-micro" style={{ color: "var(--text-muted)" }}>—</span>
              <DateField className="w-auto" inputClassName="px-2 py-1 rounded-lg text-micro outline-none" inputStyle={inputStyle} value={customTo} onChange={setCustomTo} />
            </>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <Button variant="primary" size="sm" onClick={() => setAddOpen((v) => !v)}>
              <Plus size={13} /> Yozuv qo&apos;shish
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => exportRowsToExcel(visible, exportColumns, `jurnal-${preset}`, "Jurnal")}
            >
              <Download size={13} /> Excel
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {([["all", "Hammasi"], ["kirim", "Kirim"], ["chiqim", "Chiqim"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="px-3 py-1.5 text-micro font-semibold"
                style={kind === k
                  ? { background: "var(--accent-blue)", color: "#fff" }
                  : { background: "var(--input-bg)", color: "var(--text-secondary)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-56">
            <FundingSourceSelect value={channelId} onChange={setChannelId} allowEmpty className="w-full px-2 py-1.5 rounded-lg text-micro outline-none" />
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kim, toifa yoki izoh…"
              className="pl-8 pr-3 py-1.5 rounded-lg text-meta w-56 outline-none"
              style={inputStyle}
            />
          </div>
          <span className="text-micro ml-auto" style={{ color: "var(--text-muted)" }}>
            {pending ? "Yuklanmoqda…" : `${visible.length} qator`}
          </span>
        </div>
      </div>

      {/* Xato */}
      {error && (
        <div className="mx-3 mt-2 p-2 rounded-lg text-micro" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", color: "var(--text-secondary)" }}>
          {error}
        </div>
      )}

      {/* TEZ KIRITISH — saqlangandan keyin ochiq qoladi */}
      {addOpen && (
        // TEZ KIRITISH ENDI FORMA.
        //
        // Ilgari bu `<div>` edi va Enter FAQAT "Izoh" maydonida ishlardi
        // (`onKeyDown` o'sha bitta inputga qo'lda osilgan edi). Summani yozib
        // Enter bosgan odam hech narsa olmasdi — sichqonchaga qo'l uzatishi
        // kerak edi. Alisher kunda o'nlab chiqim yozadi, ya'ni bu har safar
        // takrorlanadigan ishqalanish edi.
        //
        // `<form onSubmit>` bilan Enter HAR QANDAY maydonda saqlaydi —
        // `/kassa/kirim` dagi qo'lda kirim formasi bilan bir xil xulq.
        <form
          onSubmit={(e) => { e.preventDefault(); void saveNew(); }}
          className="m-3 p-3 rounded-xl space-y-2"
          style={{ border: "1px solid var(--accent-blue)", background: "var(--accent-blue-light)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
              {([["chiqim", "Chiqim"], ["kirim", "Kirim"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAddKind(k)}
                  className="px-3 py-1.5 text-micro font-semibold inline-flex items-center gap-1"
                  style={addKind === k
                    ? { background: k === "kirim" ? "var(--accent-green)" : "var(--accent-red)", color: "#fff" }
                    : { background: "var(--input-bg)", color: "var(--text-secondary)" }}
                >
                  {k === "kirim" ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                  {label}
                </button>
              ))}
            </div>
            <input
              inputMode="numeric"
              placeholder="Summa"
              value={amount}
              onChange={(e) => setAmount(groupDigits(e.target.value))}
              className="px-3 py-1.5 rounded-lg text-meta text-right tabular-nums w-36 outline-none"
              style={inputStyle}
            />
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-meta outline-none max-w-[220px]"
              style={inputStyle}
            >
              {categoryOptions.length === 0 && <option value="">Toifa yo&apos;q</option>}
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="w-52">
              <FundingSourceSelect value={saveChannelId} onChange={setSaveChannelId} className="w-full px-2 py-1.5 rounded-lg text-meta outline-none" />
            </div>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {saving ? "Yozilmoqda…" : "Saqlash"}
            </Button>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-micro font-semibold underline"
              style={{ color: "var(--text-muted)" }}
            >
              {showAdvanced ? "Sana/izohni yashirish" : "Sana yoki izoh qo'shish"}
            </button>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>Yopish</Button>
          </div>

          {showAdvanced && (
            <div className="flex items-center gap-2 flex-wrap">
              <DateField
                className="w-auto"
                value={date}
                onChange={setDate}
                inputClassName="px-2 py-1.5 rounded-lg text-meta outline-none"
                inputStyle={inputStyle}
              />
              <input
                placeholder="Izoh (ixtiyoriy)"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-meta flex-1 min-w-[220px] outline-none"
                style={inputStyle}
              />
            </div>
          )}

          {salaryHidden && (
            <p className="text-micro" style={{ color: "var(--text-muted)" }}>
              Oylik toifasi bu yerda yo&apos;q — u{" "}
              <a href="/payroll" className="underline" style={{ color: "var(--accent-blue)" }}>Oylik</a>{" "}
              bo&apos;limi orqali beriladi (aks holda bir pul ikki marta hisoblanadi).
            </p>
          )}

          <p className="text-micro" style={{ color: "var(--text-muted)" }}>
            Sana standart — bugun. Saqlashdan keyin forma ochiq qoladi: summa bo&apos;shaydi, kassa/toifa qoladi — ketma-ket kiritish uchun.
            Mijozning shartnoma to&apos;lovini qo&apos;shish{" "}
            <a href="/kassa/kirim" className="underline" style={{ color: "var(--accent-blue)" }}>/kassa/kirim</a>{" "}
            da — u qarzni kamaytiradi.
          </p>
        </form>
      )}

      {/* JADVAL */}
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="table-sticky-head w-full text-meta">
          <thead>
            <tr style={{ background: "var(--table-header-bg)" }}>
              {["Sana", "Turi", "Manba", "Kim / Toifa", "Izoh", "Holat", "Summa"].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${i >= 6 ? "text-right" : i === 1 || i === 2 ? "" : "text-left"}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-right text-micro font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Amal</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  {pending ? "Yuklanmoqda…" : "Tanlangan davrda harakat yo'q."}
                </td>
              </tr>
            ) : (
              paged.map((r) => {
                const isPending = r.status === "pending";
                const isRejected = r.status === "rejected";
                const canApr = isPending && r.editable && canApproveExpense(userRole, r.amount);
                return (
                  <tr
                    key={`${r.sourceType}-${r.id}`}
                    className={`transition-colors hover:bg-[var(--input-bg)] ${isRejected ? "opacity-50 line-through decoration-[var(--danger)]" : ""}`}
                    style={{
                      borderTop: "1px solid var(--card-border)",
                      background: isPending ? "var(--warning-bg)" : undefined,
                    }}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {r.date ? formatUzDate(r.date) : "—"}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1 text-micro font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          background: r.kind === "kirim" ? "var(--accent-green-light)" : "var(--accent-red-light)",
                          color: r.kind === "kirim" ? "var(--accent-green)" : "var(--accent-red)",
                        }}
                      >
                        {r.kind === "kirim" ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
                        {r.kind === "kirim" ? "Kirim" : "Chiqim"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span
                        className="text-micro font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: SOURCE_BADGE[r.sourceType].bg, color: SOURCE_BADGE[r.sourceType].fg }}
                      >
                        {r.sourceLabel}
                      </span>
                      {!r.editable && (
                        <span className="ml-1 text-micro" style={{ color: "var(--text-muted)" }} title="Bu yozuv manba hisobidan kelgan — bu yerda tahrirlanmaydi">🔒</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 max-w-[260px]">
                      <div className="font-semibold truncate" style={{ color: "var(--text)" }}>{r.who ?? "—"}</div>
                      <div className="text-micro truncate" style={{ color: "var(--text-muted)" }}>
                        {[r.channelLabel, r.category].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 max-w-[240px] truncate" title={r.rejectedReason ?? undefined} style={{ color: "var(--text-secondary)" }}>
                      {isRejected && r.rejectedReason ? `Rad etildi: ${r.rejectedReason}` : r.description ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {isPending && (
                        <span className="inline-flex items-center gap-1 text-micro font-semibold" style={{ color: "var(--warning)" }}>
                          <Clock size={11} /> Tasdiq kutmoqda — jamiga kirmagan
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-micro font-semibold" style={{ color: "var(--danger)" }}>
                          <AlertTriangle size={11} /> Rad etildi
                        </span>
                      )}
                      {r.status === "approved" && null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">
                      <Money
                        value={r.kind === "kirim" ? r.amount : -r.amount}
                        tone={r.kind === "kirim" ? "in" : "out"}
                        showSign
                        bold={!isPending && !isRejected}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                        {canApr && (
                          <>
                            <button onClick={() => void onApprove(r)} className="icon-btn-sm rounded-lg" style={{ color: "var(--success)" }} aria-label="Tasdiqlash"><CheckCircle2 size={14} /></button>
                            <button onClick={() => void onReject(r)} className="icon-btn-sm rounded-lg" style={{ color: "var(--danger)" }} aria-label="Rad etish"><XCircle size={14} /></button>
                          </>
                        )}
                        {r.editable && ["super_admin", "admin"].includes(userRole) && (
                          <button onClick={() => void onDelete(r)} className="icon-btn-sm rounded-lg opacity-40 hover:opacity-100 transition-opacity" style={{ color: "var(--danger)" }} aria-label="O'chirish"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-micro" style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
        <span>
          Kirim <b className="tabular-nums" style={{ color: "var(--accent-green)" }}>+{formatNum(displayTotals.kirim)}</b>
          {" · "}Chiqim <b className="tabular-nums" style={{ color: "var(--accent-red)" }}>−{formatNum(displayTotals.chiqim)}</b>
          {" · "}Sof <b className="tabular-nums" style={{ color: "var(--text)" }}>{formatNum(displayTotals.netto)}</b> so&apos;m
          {" · "}tasdiq kutayotgan va rad etilganlar jamga kirmaydi
        </span>
        {truncated !== 0 && (
          <span style={{ color: "var(--warning)" }}>Jurnal katta — davrni qisqartiring</span>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={visible.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        unit="yozuv"
      />
    </div>
  );
}
