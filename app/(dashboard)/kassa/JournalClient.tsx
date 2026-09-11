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
import { usePageSize } from "@/hooks/usePageSize";
import { useTableState } from "@/hooks/useTableState";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownRight, ArrowUpRight, Download, Plus, Search, Trash2,
  CheckCircle2, XCircle, Clock, NotebookPen, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import {
  Badge, DataTable, Money, StatStrip,
  type BadgeTone, type DataColumn, type StatItem } from "@/components/ui";
import { MoneyField } from "@/components/ui/MoneyField";
import { Select } from "@/components/ui/Select";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { usePrompt } from "@/components/ui/ConfirmDialog";
import { todayKey, formatUzDate, formatNum } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { canApproveExpense } from "@/lib/expenseApproval";
import { RANGE_LABELS, type RangePreset } from "@/lib/dateRange";
import { exportRowsToExcel, type ExportColumn } from "@/lib/exportTable";
import type { JournalRow } from "@/server/kassaJournal";
import { getKassaJournal } from "@/server/kassaJournal";
import {
  createKassaEntry, deleteKassaEntry, approveExpense, rejectExpense } from "@/server/kassa";
import { DateField } from "@/components/ui/DateField";
import { isSalaryCategory } from "@/lib/salaryCategory";

const PRESETS: RangePreset[] = ["month_to_date", "last_month", "today", "yesterday", "this_week", "year_to_date", "custom"];

/** Manba nishoni — `Badge` ning umumiy `TONE_COLORS` xaritasidan. */
const SOURCE_TONE: Record<string, BadgeTone> = {
  kassa: "neutral",
  shartnoma: "info",
  oylik: "warning" };

interface Props {
  userRole: string;
  /** Korxona lug'ati — tez kiritish formasi uchun. */
  incomeCategories: string[];
  expenseCategories: string[];
}

export default function JournalClient({ userRole, incomeCategories, expenseCategories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [amount, setAmount] = useState<number | null>(null);
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
        channelId: channelId || null })
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
  // Saralash/sahifa/zichlik — `DataTable` shu holatni kutadi. Qidiruv va
  // davr filtrlari yuqorida, o'z holatida qoladi.
  const table = useTableState({ ns: "jr", defaultSortKey: "date", defaultSortDir: "desc" });
  const [pageSize, setPageSize] = usePageSize("journal");

  // Filtr yoki qidiruv ro'yxatni qisqartirsa, joriy sahifa mavjud bo'lmay
  // qolishi mumkin — o'shanda boshiga qaytamiz, bo'sh ekran ko'rsatmaymiz.
  const { setPage } = table;
  useEffect(() => { setPage(1); }, [preset, customFrom, customTo, kind, channelId, search, setPage]);

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
    const amt = amount ?? 0;
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
        channelId: saveChannelId });
      toast.success(addKind === "kirim" ? "Kirim yozildi" : "Chiqim yozildi");
      // Exceldagidek: summa va izoh bo'shaydi, tur/kassa/sana/toifa QOLADI —
      // ketma-ket kiritishda har safar hammasini qayta tanlamaysiz.
      setAmount(null);
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
      tone: "danger" });
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
      tone: "danger" });
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

  const journalTotals: StatItem[] = [
    { label: "Kirim", value: displayTotals.kirim, tone: "in" },
    { label: "Chiqim", value: displayTotals.chiqim, tone: "out" },
    {
      label: "Sof",
      value: displayTotals.netto,
      tone: "auto",
      emphasis: true,
      hint: "Tasdiq kutayotgan va rad etilgan yozuvlar hisobga olinmaydi" },
  ];

  /**
   * USTUNLAR — jadval, mobil kartochka va Excel uchun bitta manba.
   * Qator holati (`pending` / `rejected`) endi ALOHIDA ustunda nishon bilan
   * ko'rsatiladi: ilgari u qatorning fon rangi va chizib tashlashida edi,
   * ya'ni faqat rangdan bilinardi.
   */
  const journalColumns: DataColumn<JournalRow>[] = [
    {
      key: "date",
      header: "Sana",
      cell: (r) => (r.date ? formatUzDate(r.date) : "—"),
      sortValue: (r) => r.date ?? "",
      exportValue: (r) => (r.date ? formatUzDate(r.date) : ""),
      width: "110px",
      mobile: "meta" },
    {
      key: "kind",
      header: "Turi",
      cell: (r) => (
        <Badge
          tone={r.kind === "kirim" ? "success" : "danger"}
          icon={r.kind === "kirim" ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
        >
          {r.kind === "kirim" ? "Kirim" : "Chiqim"}
        </Badge>
      ),
      sortValue: (r) => r.kind },
    {
      key: "source",
      header: "Manba",
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          <Badge tone={SOURCE_TONE[r.sourceType] ?? "neutral"}>{r.sourceLabel}</Badge>
          {!r.editable && (
            <span
              className="text-micro"
              style={{ color: "var(--text-muted)" }}
              title="Bu yozuv manba hisobidan kelgan — bu yerda tahrirlanmaydi"
            >
              🔒
            </span>
          )}
        </span>
      ),
      sortValue: (r) => r.sourceLabel },
    {
      key: "who",
      header: "Kim / Toifa",
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: "var(--text)" }}>{r.who ?? "—"}</div>
          <div className="text-micro truncate" style={{ color: "var(--text-muted)" }}>
            {[r.channelLabel, r.category].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
      sortValue: (r) => r.who ?? "",
      sticky: true,
      mobile: "title" },
    {
      key: "description",
      header: "Izoh",
      cell: (r) =>
        r.status === "rejected" && r.rejectedReason
          ? `Rad etildi: ${r.rejectedReason}`
          : r.description ?? "—",
      sortValue: (r) => r.description ?? "" },
    {
      key: "status",
      header: "Holat",
      cell: (r) => {
        if (r.status === "pending") {
          return <Badge tone="warning" icon={<Clock size={11} />}>Tasdiq kutmoqda</Badge>;
        }
        if (r.status === "rejected") {
          return <Badge tone="danger" icon={<AlertTriangle size={11} />}>Rad etildi</Badge>;
        }
        return <Badge tone="success" dot>Hisobda</Badge>;
      },
      sortValue: (r) => r.status ?? "",
      mobile: "status" },
    {
      key: "amount",
      header: "Summa",
      cell: (r) => (
        <Money
          value={r.kind === "kirim" ? r.amount : -r.amount}
          tone={r.kind === "kirim" ? "in" : "out"}
          showSign
          bold={r.status !== "pending" && r.status !== "rejected"}
        />
      ),
      sortValue: (r) => (r.kind === "kirim" ? r.amount : -r.amount),
      exportValue: (r) => r.amount,
      numeric: true,
      align: "right" },
    {
      key: "actions",
      header: "Amal",
      align: "right",
      cell: (r) => {
        const canApr = r.status === "pending" && r.editable && canApproveExpense(userRole, r.amount);
        const canDel = r.editable && ["super_admin", "admin"].includes(userRole);
        if (!canApr && !canDel) return null;
        return (
          <div className="flex items-center justify-end gap-1">
            {canApr && (
              <>
                <button onClick={() => void onApprove(r)} className="icon-btn-sm rounded-lg" style={{ color: "var(--success)" }} aria-label="Tasdiqlash"><CheckCircle2 size={14} /></button>
                <button onClick={() => void onReject(r)} className="icon-btn-sm rounded-lg" style={{ color: "var(--danger)" }} aria-label="Rad etish"><XCircle size={14} /></button>
              </>
            )}
            {canDel && (
              <button onClick={() => void onDelete(r)} className="icon-btn-sm rounded-lg opacity-40 hover:opacity-100 transition-opacity" style={{ color: "var(--danger)" }} aria-label="O'chirish"><Trash2 size={14} /></button>
            )}
          </div>
        );
      },
      mobile: "actions" },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--card-shadow)" }}
    >
      {/* Ichki sarlavha OLIB TASHLANDI: sahifada endi `SectionHeader`
          ("03 · OPERATSIYALAR · Kassa jurnali") turadi va u aynan shu matnni
          aytardi. Ikkita sarlavha ketma-ket kelganda ko'z qaysi biri
          jadvalga tegishli ekanini ajrata olmasdi. */}

      {/* Davr yakuni — `StatStrip`: sarlavhaga tiqilgan uchta raqam
          o'qilmasdi va sahifa boshqa joylaridagi ko'rsatkichlardan boshqacha
          ko'rinardi. Jami tasdiq kutayotgan va rad etilganlarni HISOBGA
          OLMAYDI — manba bilan bir xil qoida. */}
      <StatStrip items={journalTotals} minWidth={140} />

      {/* Filtrlar */}
      <div className="px-3 py-2 space-y-2" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <Chip key={p} selected={preset === p} onClick={() => setPreset(p)}>
              {RANGE_LABELS[p]}
            </Chip>
          ))}
          {preset === "custom" && (
            <>
              <DateField className="w-auto" value={customFrom} onChange={setCustomFrom} aria-label="Boshlanish sanasi" />
              <span className="text-micro" style={{ color: "var(--text-muted)" }}>—</span>
              <DateField className="w-auto" value={customTo} onChange={setCustomTo} aria-label="Tugash sanasi" />
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
              <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
                {label}
              </Chip>
            ))}
          </div>
          <div className="w-56">
            <FundingSourceSelect value={channelId} onChange={setChannelId} allowEmpty />
          </div>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kim, toifa yoki izoh…"
              aria-label="Jurnal ichidan qidirish"
              className="erp-input w-56 pl-8"
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
                <Chip
                  key={k}
                  selected={addKind === k}
                  onClick={() => setAddKind(k)}
                  tone={k === "kirim" ? "var(--accent-green)" : "var(--accent-red)"}
                  icon={k === "kirim" ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <MoneyField
              className="w-40"
              value={amount}
              onChange={setAmount}
              placeholder="Summa"
              suffix={null}
              aria-required
            />
            <Select
              size="sm"
              fullWidth={false}
              className="max-w-[220px]"
              aria-label="Toifa"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              {categoryOptions.length === 0 && <option value="">Toifa yo&apos;q</option>}
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <div className="w-52">
              <FundingSourceSelect value={saveChannelId} onChange={setSaveChannelId} />
            </div>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {saving ? "Yozilmoqda…" : "Saqlash"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Sana/izohni yashirish" : "Sana yoki izoh qo'shish"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>Yopish</Button>
          </div>

          {showAdvanced && (
            <div className="flex items-center gap-2 flex-wrap">
              <DateField className="w-auto" value={date} onChange={setDate} aria-label="Sana" />
              <input
                placeholder="Izoh (ixtiyoriy)"
                aria-label="Izoh"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="erp-input flex-1 min-w-[220px]"
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
      <DataTable
        rows={visible}
        columns={journalColumns}
        rowKey={(r) => `${r.sourceType}-${r.id}`}
        caption="Operatsiyalar jurnali — tanlangan davrdagi barcha pul harakati"
        sortKey={table.sortKey}
        sortDir={table.sortDir}
        onToggleSort={table.toggleSort}
        density={table.density}
        page={table.page}
        pageSize={pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={setPageSize}
        loading={pending && visible.length === 0}
        emptyIcon={<NotebookPen size={28} />}
        emptyTitle="Tanlangan davrda harakat yo'q"
        emptyDescription="Davrni kengaytiring yoki filtrni tozalang."
      />

      {/* Footer */}
      <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-micro" style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
        <span>Tasdiq kutayotgan va rad etilgan yozuvlar yuqoridagi jamga kirmaydi</span>
        {truncated !== 0 && (
          <span style={{ color: "var(--warning)" }}>Jurnal katta — davrni qisqartiring</span>
        )}
      </div>
    </div>
  );
}
