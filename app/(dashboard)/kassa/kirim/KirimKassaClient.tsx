"use client";

import React, { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Link2, EyeOff, Banknote, CreditCard, Wallet, Search, AlertTriangle, Plus } from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatNum, formatUzDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import {
  previewStatement,
  commitStatementUpload,
  matchAndPostTransaction,
  ignoreTransaction,
} from "@/server/bankImport";
import type { StatementPreview } from "@/lib/bank/types";
import { createKassaEntry } from "@/server/kassa";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { friendlyError } from "@/lib/actionError";

interface AccountRow {
  id: string;
  accountNumber: string;
  label: string;
  inn: string;
  ownerCompany: { id: string; name: string } | null;
  monthIncome: number;
  monthCount: number;
  unmatchedCount: number;
  lastImportAt: string | null;
  lastImportFile: string | null;
  lastPeriodIncome: number;
  lastPeriodCount: number;
  lastPeriodTo: string | null;
}

interface UnmatchedRow {
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

interface NonBankRow {
  id: string;
  /** plastik | naqd */
  source: string;
  amount: string | number;
  receivedAt: string | null;
  externalRef: string | null;
  payment: { period: string; company: { name: string; inn: string } } | null;
  /** true ⇒ qo'lda kiritilgan (mijozga bog'lanmagan). */
  manual?: boolean;
}

interface CompanyOption {
  id: string;
  name: string;
  inn: string;
  contracts: { id: string; number: string }[];
}

interface Props {
  accounts: AccountRow[];
  unmatched: UnmatchedRow[];
  nonBank: NonBankRow[];
  companies: CompanyOption[];
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

export default function KirimKassaClient({ accounts, unmatched, nonBank, companies }: Props) {
  const router = useRouter();
  useAutoRefresh();

  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  /** Serverdan kelgan tushunarli xato — prod'da toast matni umumiy bo'lib qoladi. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Qo'lda kirim: naqd va plastik pul vipiskada ko'rinmaydi, uni odam
  // kiritadi. Backend (createKassaEntry) bor edi, ekran yo'q edi.
  const [manualType, setManualType] = useState<"naqd" | "plastik" | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Tushum QAYSI kassaga kirgani — naqd uchun ham, plastik uchun ham.
  //
  // Ilgari faqat plastikda so'ralardi. Natijada naqd tushum kanalsiz yozilar
  // va "qaysi seyfga tushdi?" degan savolga baza javob bera olmasdi — prodda
  // 691 kassa yozuvining HAMMASI shu sababdan kanalsiz.
  const [manualChannelId, setManualChannelId] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const submitManual = async () => {
    if (!manualType) return;
    const amount = Number(manualAmount.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError("Summa musbat son bo'lishi kerak");
      return;
    }
    // MANBA IKKALASIDA HAM MAJBURIY: pul qaysi kassaga tushganini bilmasak,
    // o'sha kassaning qoldig'i hech qachon to'g'ri chiqmaydi va kassalar
    // hisobotini qurib bo'lmaydi.
    if (!manualChannelId) {
      setManualError(
        manualType === "plastik"
          ? "Qaysi plastikka tushganini tanlang"
          : "Qaysi naqd kassaga tushganini tanlang"
      );
      return;
    }
    setManualBusy(true);
    setManualError(null);
    try {
      await createKassaEntry({
        type: "income",
        category: manualType === "naqd" ? "Naqd tushum" : "Plastik tushum",
        amount,
        description: manualNote.trim() || undefined,
        date: new Date(manualDate),
        channelId: manualChannelId || undefined,
      });
      setManualType(null);
      setManualAmount("");
      setManualNote("");
      setManualChannelId("");
      router.refresh();
    } catch (e) {
      setManualError(friendlyError(e) || "Yozib bo'lmadi");
    } finally {
      setManualBusy(false);
    }
  };
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // Bank / plastik / naqd — foydalanuvchi aynan shu uchtasini bir ekranda
  // ko'rishni so'ragan. Uchalasi ham Payment orqali o'tadi, shuning uchun
  // raqamlar qarzdorlik bilan bir manbadan.
  const plastik = nonBank.filter((m) => m.source === "plastik");
  const naqd = nonBank.filter((m) => m.source === "naqd");
  const sum = (rows: NonBankRow[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

  const totalBankIncome = accounts.reduce((s, a) => s + a.monthIncome, 0);
  const totalUnmatched = accounts.reduce((s, a) => s + a.unmatchedCount, 0);

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

  const reset = () => {
    setPreview(null);
    setPendingFile(null);
    setUploadError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onPick = async (file: File) => {
    setBusy(true);
    setPendingFile(file);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewStatement(fd);
      if (res.ok) {
        setPreview(res.data);
      } else {
        // Server action XATO OTSA, prod'da matn brauzerga yetmaydi (Next.js
        // uni yashiradi). Shuning uchun kutilgan xatolar natija sifatida
        // qaytariladi va aynan shu yerda ko'rsatiladi.
        setPreview(null);
        setUploadError(res.error);
      }
    } catch (e) {
      setPreview(null);
      setUploadError(
        friendlyError(e) || "Faylni o'qib bo'lmadi. Fayl turini tekshiring (.xlsx / .xls)."
      );
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await commitStatementUpload(fd);
      if (!res.ok) {
        setUploadError(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        `${d.account}: ${d.rowsInserted} ta yozildi` +
          (d.rowsDuplicate > 0 ? `, ${d.rowsDuplicate} ta dublikat tashlandi` : "") +
          ` · ${d.matched} ta moslashtirildi` +
          (d.stillUnmatched > 0 ? ` · ${d.stillUnmatched} tasi qo'lda hal qilinadi` : "")
      );
      reset();
      router.refresh();
    } catch (e) {
      setUploadError(friendlyError(e) || "Yuklashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            Kirim kassa
          </h1>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            Bank vipiskasi, plastik karta va naqd pul kirimlari
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
          <Button variant="primary" size="md" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> Vipiska yuklash
          </Button>
        </div>
      </div>

      {/* Umumiy raqamlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl" style={card}>
          <div className="flex items-center gap-2 text-meta" style={{ color: "var(--text-muted)" }}>
            <Banknote size={14} /> Bank kirimi (shu oy)
          </div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(totalBankIncome)} <span className="text-meta">so&apos;m</span>
          </div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="flex items-center gap-2 text-meta" style={{ color: "var(--text-muted)" }}>
            <CreditCard size={14} /> Plastik karta
            <button
              className="ml-auto icon-btn"
              title="Plastik tushum qo'shish"
              onClick={() => { setManualType("plastik"); setManualError(null); }}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(sum(plastik))} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>
            {plastik.length} ta tushum
          </div>
        </div>
        <div className="p-4 rounded-xl" style={card}>
          <div className="flex items-center gap-2 text-meta" style={{ color: "var(--text-muted)" }}>
            <Wallet size={14} /> Naqd pul
            <button
              className="ml-auto icon-btn"
              title="Naqd tushum qo'shish"
              onClick={() => { setManualType("naqd"); setManualError(null); }}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="text-xl font-semibold tabular-nums mt-1" style={{ color: "var(--text)" }}>
            {formatNum(sum(naqd))} <span className="text-meta">so&apos;m</span>
          </div>
          <div className="text-micro" style={{ color: "var(--text-muted)" }}>
            {naqd.length} ta tushum
          </div>
        </div>
      </div>

      {/* Qo'lda kirim formasi */}
      {manualType && (
        <div className="p-4 rounded-xl space-y-3" style={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              {manualType === "naqd" ? "Naqd tushum" : "Plastik tushum"} qo&apos;shish
            </h2>
            <Button variant="secondary" size="sm" onClick={() => setManualType(null)}>Yopish</Button>
          </div>
          {manualError && (
            <p className="text-meta" style={{ color: "var(--danger)" }}>{manualError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Sana</span>
              <input
                type="date"
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Summa (so&apos;m)</span>
              <input
                inputMode="numeric"
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta text-right tabular-nums outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="1000000"
              />
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Izoh</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="kimdan / nima uchun"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-meta" style={{ color: "var(--text-secondary)" }}>
              {manualType === "plastik" ? "Qaysi plastikka tushdi" : "Qaysi kassaga tushdi"}{" "}
              <span style={{ color: "var(--danger)" }}>*</span>
            </span>
            <FundingSourceSelect
              value={manualChannelId}
              onChange={setManualChannelId}
              className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
            />
          </label>
          <Button variant="primary" size="md" disabled={manualBusy} onClick={submitManual}>
            {manualBusy ? "Yozilmoqda…" : "Saqlash"}
          </Button>
        </div>
      )}

      {/* Xato paneli — toast emas, chunki matn uzun va o'qilishi kerak */}
      {uploadError && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold" style={{ color: "var(--danger)" }}>
              Faylni yuklab bo'lmadi
            </div>
            <p className="text-meta mt-1 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
              {uploadError}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={reset}>
            Yopish
          </Button>
        </div>
      )}

      {/* Oldindan ko'rish */}
      {preview && (
        <div className="p-5 rounded-xl space-y-3" style={{ ...card, borderColor: "var(--accent-blue)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              Oldindan ko&apos;rish — {preview.accountLabel ?? "noma'lum hisob"}
            </h2>
            <span className="text-meta" style={{ color: "var(--text-muted)" }}>
              format: {preview.format}
              {preview.periodFrom && preview.periodTo
                ? ` · ${formatUzDate(preview.periodFrom)} — ${formatUzDate(preview.periodTo)}`
                : ""}
            </span>
          </div>

          {preview.unknownAccount ? (
            <p className="text-body" style={{ color: "var(--danger)" }}>
              Bu hisob raqami ({preview.accountNumber ?? "o'qilmadi"}) bazada yo&apos;q. Yuklab
              bo&apos;lmaydi — avval hisobni o&apos;z firmalar ro&apos;yxatiga qo&apos;shing.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-meta">
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Kirim</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                    {preview.incomeCount} ta · {formatNum(preview.incomeSum)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Chiqim</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
                    {preview.expenseCount} ta · {formatNum(preview.expenseSum)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Dublikat</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                    {preview.duplicateCount} ta
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Yangi yoziladi</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                    {preview.incomeCount + preview.expenseCount - preview.duplicateCount} ta
                  </div>
                </div>
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <div
                  className="p-3 rounded-lg space-y-1"
                  style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}
                >
                  <div className="text-meta font-semibold" style={{ color: "var(--warning)" }}>
                    Tekshirish kerak
                  </div>
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-meta" style={{ color: "var(--text-secondary)" }}>{w}</p>
                  ))}
                </div>
              )}

              {preview.duplicateCount > 0 && (
                <p className="text-meta" style={{ color: "var(--warning)" }}>
                  Bu faylning {preview.duplicateCount} ta qatori allaqachon bazada bor — ular qayta
                  yozilmaydi.
                </p>
              )}

              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--card-border)" }}>
                <table className="w-full text-meta">
                  <thead>
                    <tr style={{ background: "var(--input-bg)" }}>
                      <th className="text-left p-2">Sana</th>
                      <th className="text-left p-2">Hujjat</th>
                      <th className="text-left p-2">Kontragent</th>
                      <th className="text-left p-2">STIR</th>
                      <th className="text-left p-2">Shartnoma</th>
                      <th className="text-right p-2">Summa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((t, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--card-border)" }}>
                        <td className="p-2 whitespace-nowrap">{formatUzDate(t.valueDate)}</td>
                        <td className="p-2">{t.docNumber ?? "—"}</td>
                        <td className="p-2 max-w-[240px] truncate">{t.counterpartyName ?? "—"}</td>
                        <td className="p-2">{t.counterpartyInn ?? "—"}</td>
                        <td className="p-2">{t.contractHint ?? "—"}</td>
                        <td
                          className="p-2 text-right tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: t.direction === "income" ? "var(--success)" : "var(--danger)" }}
                        >
                          {t.direction === "income" ? "+" : "−"}
                          {formatNum(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="primary" size="md" disabled={busy} onClick={onConfirm}>
                  Tasdiqlash va yuklash
                </Button>
                <Button variant="secondary" size="md" disabled={busy} onClick={reset}>
                  Bekor qilish
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* O'z firmalar hisoblari */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Firma hisoblari ({accounts.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="p-4 rounded-xl" style={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: "var(--text)" }}>
                    {a.label}
                  </div>
                  <div className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {a.accountNumber}
                  </div>
                </div>
                {a.unmatchedCount > 0 && (
                  <span
                    className="text-micro font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                  >
                    {a.unmatchedCount} ta
                  </span>
                )}
              </div>
              {a.monthCount > 0 || !a.lastPeriodTo ? (
                <>
                  <div className="mt-3 text-lg font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                    {formatNum(a.monthIncome)} <span className="text-meta">so&apos;m</span>
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    shu oyda {a.monthCount} ta kirim
                    {a.lastImportAt
                      ? ` · oxirgi vipiska ${formatUzDate(a.lastImportAt)}`
                      : " · vipiska yuklanmagan"}
                  </div>
                </>
              ) : (
                <>
                  {/* Joriy oyda hali vipiska yo'q — oxirgi davr raqamini
                      ko'rsatamiz, lekin QAYSI davr ekanini aniq yozib. */}
                  <div className="mt-3 text-lg font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {formatNum(a.lastPeriodIncome)} <span className="text-meta">so&apos;m</span>
                  </div>
                  <div className="text-micro" style={{ color: "var(--warning)" }}>
                    {formatUzDate(a.lastPeriodTo)} davri · {a.lastPeriodCount} ta kirim
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    shu oyda vipiska yuklanmagan
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Plastik va naqd tushumlari */}
      {nonBank.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
            Plastik va naqd tushumlari ({nonBank.length})
          </h2>
          <div className="overflow-x-auto rounded-xl" style={card}>
            <table className="w-full text-meta">
              <thead>
                <tr style={{ background: "var(--input-bg)" }}>
                  <th className="text-left p-2">Sana</th>
                  <th className="text-left p-2">Manba</th>
                  <th className="text-left p-2">Mijoz</th>
                  <th className="text-left p-2">Davr</th>
                  <th className="text-left p-2">Hujjat</th>
                  <th className="text-right p-2">Summa</th>
                </tr>
              </thead>
              <tbody>
                {nonBank.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td className="p-2 whitespace-nowrap">
                      {r.receivedAt ? formatUzDate(r.receivedAt) : "—"}
                    </td>
                    <td className="p-2">
                      <span
                        className="text-micro font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          background: r.source === "plastik" ? "var(--accent-blue-light)" : "var(--success-bg)",
                          color: r.source === "plastik" ? "var(--accent-blue)" : "var(--success)",
                        }}
                      >
                        {r.source === "plastik" ? "Plastik" : "Naqd"}
                      </span>
                    </td>
                    <td className="p-2 max-w-[280px] truncate">
                      {r.payment?.company.name ?? (
                        <span style={{ color: "var(--text-muted)" }}>
                          {r.manual ? "qo'lda kiritilgan" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.payment?.period ?? "—"}</td>
                    <td className="p-2">{r.externalRef ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: "var(--success)" }}>
                      +{formatNum(Number(r.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Moslashtirilmaganlar navbati */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
            Moslashtirilmagan kirimlar ({totalUnmatched})
          </h2>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, STIR yoki shartnoma"
              className="pl-8 pr-3 py-1.5 rounded-lg text-meta outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {filteredUnmatched.length === 0 ? (
          <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--text-muted)" }}>
            Moslashtirilmagan kirim yo&apos;q.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredUnmatched.map((tx) => (
              <UnmatchedCard
                key={tx.id}
                tx={tx}
                companies={companies}
                onDone={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </div>
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
            {tx.contractHint && (
              <span
                className="text-micro font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}
              >
                {tx.contractHint}
              </span>
            )}
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
        <div className="text-lg font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--success)" }}>
          +{formatNum(Number(tx.amount))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
        <div className="flex gap-2">
          <select
            className="flex-1 px-2 py-1.5 rounded-lg text-meta outline-none min-w-0"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setContractId("");
            }}
          >
            <option value="">Firmani tanlang…</option>
            {suggested.length > 0 && (
              <optgroup label="STIR bo'yicha taklif">
                {suggested.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Barcha firmalar">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.inn})
                </option>
              ))}
            </optgroup>
          </select>

          {selected && selected.contracts.length > 0 && (
            <select
              className="px-2 py-1.5 rounded-lg text-meta outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">Shartnomasiz</option>
              {selected.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}
                </option>
              ))}
            </select>
          )}
        </div>

        <Button variant="primary" size="sm" disabled={busy || !companyId} onClick={post}>
          <Link2 size={14} /> Hisobga olish
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={skip}>
          <EyeOff size={14} /> E&apos;tiborsiz
        </Button>
      </div>
    </div>
  );
}
