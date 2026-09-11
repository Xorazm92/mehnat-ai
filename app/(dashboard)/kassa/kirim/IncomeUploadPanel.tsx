"use client";

// =====================================================
// VIPISKA YUKLASH — fayl → oldindan ko'rish → tasdiq
// =====================================================
//
// Ikki qadam ATAYIN ajratilgan: `previewStatement` faylni faqat O'QIYDI,
// `commitStatementUpload` esa tasdiqdan keyin yozadi. Kassir nima
// kelayotganini ko'rmasdan yuzlab qatorni bazaga qo'yib yubormasligi kerak.
//
// NEGA HOOK, KOMPONENT EMAS. Yuklash uchligi ekranning IKKI JOYIDA turadi:
// "Vipiska yuklash" tugmasi sahifa sarlavhasida (`PageHeader actions`),
// xato va oldindan ko'rish panellari esa sahifa tanasida. Bitta komponent
// ularni birga chizsa, tugma sarlavhadan tushib ketardi — ya'ni ko'rinish
// o'zgarardi. Hook esa holatni va mantiqni bir joyda saqlab, chizishni
// chaqiruvchiga qoldiradi: DOM aynan avvalgidek qoladi.

import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { DataTable, Money, type DataColumn } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { previewStatement, commitStatementUpload } from "@/server/bank/upload";
import type { StatementPreview } from "@/lib/bank/types";

/** Oldindan ko'rish paneli kartochka ko'rinishida. */
const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

/**
 * Vipiska namunasi. Qatorlarning o'z id'si yo'q (ular hali bazaga yozilmagan),
 * shuning uchun oldindan ko'rish uchun tartib raqami qo'shiladi.
 */
type PreviewRow = StatementPreview["sample"][number] & { _i: number };

/**
 * Namuna ustunlari — SARALANMAYDI (`sortValue` berilmagan): bu vipiskaning
 * o'z tartibi va uni o'zgartirish faylni tekshirishni qiyinlashtiradi.
 */
const PREVIEW_COLUMNS: DataColumn<PreviewRow>[] = [
  { key: "date", header: "Sana", cell: (t) => formatUzDate(t.valueDate), width: "110px", mobile: "meta" },
  { key: "doc", header: "Hujjat", cell: (t) => t.docNumber ?? "—" },
  { key: "party", header: "Kontragent", cell: (t) => t.counterpartyName ?? "—", sticky: true, mobile: "title" },
  { key: "inn", header: "STIR", cell: (t) => t.counterpartyInn ?? "—" },
  { key: "contract", header: "Shartnoma", cell: (t) => t.contractHint ?? "—" },
  {
    key: "amount",
    header: "Summa",
    cell: (t) => <Money value={t.amount} tone={t.direction === "income" ? "in" : "out"} showSign bold />,
    numeric: true,
    align: "right",
  },
];



export interface StatementUploadHandle {
  /** Fayl tanlash oynasini ochadi. */
  open: () => void;
  /** Yuklash yoki tasdiqlash ketmoqda — tugmalar bloklanadi. */
  busy: boolean;
  /** Yashirin `<input type="file">` — tugma yonida chizilishi shart. */
  fileInput: React.ReactNode;
  /** Xato va oldindan ko'rish panellari — sahifa tanasida chiziladi. */
  panels: React.ReactNode;
}

export function useStatementUpload({ onImported }: { onImported: () => void }): StatementUploadHandle {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  /** Serverdan kelgan tushunarli xato — prod'da toast matni umumiy bo'lib qoladi. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
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
          (d.posted > 0
            ? ` · ${d.posted} ta hisobga olindi (${formatNum(d.postedAmount)} so'm)`
            : d.matched > 0
              ? " · moslashtirildi"
              : "") +
          (d.stillUnmatched > 0 ? ` · ${d.stillUnmatched} tasi qo'lda hal qilinadi` : "")
      );
      if (d.postErrors.length > 0) {
        toast.warning(`${d.postErrors.length} ta qator hisobga olinmadi`, {
          description: d.postErrors.join("\n"),
        });
      }
      reset();
      onImported();
    } catch (e) {
      setUploadError(friendlyError(e) || "Yuklashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return {
    open: () => fileInput.current?.click(),
    busy,
    fileInput: (
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
    ),
    panels: (
      <>

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
            /* IKKI XIL MUAMMO, ikki xil xabar. Ilgari ikkalasi ham "hisob
               bazada yo'q" derdi va foydalanuvchi mavjud hisobni qayta
               qo'shishga urinardi, holbuki muammo faylni o'qishda edi. */
            <div className="space-y-1">
              {preview.accountNumber ? (
                <>
                  <p className="text-body" style={{ color: "var(--danger)" }}>
                    Hisob raqami {preview.accountNumber} bazada ro&apos;yxatdan o&apos;tmagan.
                  </p>
                  <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
                    Yuklash uchun avval shu hisobni o&apos;z firmalar ro&apos;yxatiga qo&apos;shing.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-body" style={{ color: "var(--danger)" }}>
                    Hisob raqami FAYLDAN o&apos;qib bo&apos;lmadi — muammo bazada emas, vipiska
                    sarlavhasida.
                  </p>
                  <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
                    Sarlavhada &quot;Cчет: &lt;20 raqam&gt;&quot; qatori bormi, tekshiring. Faylni
                    o&apos;zgartirmasdan yuboring — parser shu ko&apos;rinishga moslanadi.
                  </p>
                </>
              )}
            </div>
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

              <DataTable
                rows={preview.sample.map((t, i) => ({ ...t, _i: i }))}
                columns={PREVIEW_COLUMNS}
                rowKey={(t) => String(t._i)}
                caption="Vipiskadan namuna qatorlar"
                maxBodyHeight={null}
                density="compact"
              />

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
      </>
    ),
  };
}
