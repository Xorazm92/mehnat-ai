"use client";

// =====================================================
// TEMPLATE ISTISNOLARI — xavfsizlik klapani
// =====================================================
// Rollout paytida savol shu shaklda tug'iladi: "template'ni yoqdim — kimga
// tegmasligi kerak?". Shuning uchun ro'yxat firmadan emas, TEMPLATE'dan
// boshlanadi va shu panel template qatorining ichida ochiladi.
//
// Sabab MAJBURIY: tugma sabab yozilmaguncha faol bo'lmaydi. Server ham
// tekshiradi — bu faqat qulaylik qatlami.
import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Ban, RotateCcw, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getTemplateOverrides, setObligationOverride, removeObligationOverride } from "@/server/obligationOverrides";

interface Row {
  id: string;
  name: string;
  inn: string;
  override: { id: string; action: string; reason: string } | null;
}

export function TemplateOverridesPanel({
  templateId,
  templateName,
  open,
  onClose,
}: {
  templateId: string;
  templateName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const load = () => {
    getTemplateOverrides(templateId)
      .then((r) => setRows(r.rows as unknown as Row[]))
      .catch((e) => toast.error((e as Error).message));
  };

  useEffect(() => {
    if (open) {
      setRows(null);
      setQ("");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId]);

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setReasonFor(null);
        setReason("");
        load();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const visible = (rows ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.inn.includes(q),
  );
  const disabledCount = (rows ?? []).filter((r) => r.override?.action === "disable").length;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Istisnolar — ${templateName}`}
      description="O'chirilgan firmalar uchun bu majburiyat KELAJAKDA yaratilmaydi. O'tgan davrlar tegilmaydi.">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input
              aria-label="Firma qidirish"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Firma nomi yoki INN"
              className="erp-input pl-8 text-xs"
            />
          </div>
          <span className="text-meta whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {disabledCount} o&apos;chirilgan
          </span>
        </div>

        {rows === null ? (
          <div className="py-8 text-center text-meta" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-meta" style={{ color: "var(--text-muted)" }}>Firma topilmadi</div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg" style={{ border: "1px solid var(--rule)" }}>
            {visible.map((r) => {
              const off = r.override?.action === "disable";
              return (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--rule)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                    <div className="font-mono text-micro" style={{ color: "var(--text-muted)" }}>
                      {r.inn}
                      {off && r.override?.reason ? ` · ${r.override.reason}` : ""}
                    </div>
                  </div>
                  {off ? (
                    <button
                      disabled={pending}
                      onClick={() => run(() => removeObligationOverride(r.override!.id), "Istisno olib tashlandi")}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50 flex items-center gap-1"
                      style={{ background: "var(--success-bg)", color: "var(--success)" }}
                    >
                      <RotateCcw size={12} /> Qaytarish
                    </button>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => { setReasonFor(r.id); setReason(""); }}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg disabled:opacity-50 flex items-center gap-1"
                      style={{ background: "var(--danger-bg)", color: "var(--danger-dark)" }}
                    >
                      <Ban size={12} /> O&apos;chirish
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {reasonFor && (
          <div className="rounded-lg p-3" style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}>
            <label htmlFor="ovr-reason" className="block text-meta font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
              Nega bu firmaga tegishli emas?
            </label>
            <textarea
              id="ovr-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Masalan: firma bu soliq turini to'lamaydi"
              className="erp-input min-h-[64px] resize-none text-xs"
            />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="secondary" size="sm" onClick={() => setReasonFor(null)}>Bekor</Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!reason.trim() || pending}
                onClick={() =>
                  run(
                    () => setObligationOverride({ companyId: reasonFor, templateId, action: "disable", reason }),
                    "Istisno qo'shildi",
                  )
                }
              >
                O&apos;chirish
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
