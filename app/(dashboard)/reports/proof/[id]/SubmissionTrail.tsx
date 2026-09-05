import { Clock, CheckCircle2, XCircle, Send } from "lucide-react";
import { formatUzDateTime } from "@/lib/platform/format";

/**
 * TOPSHIRISH TARIXI — `ObligationSubmission` + `SubmissionEvidence`.
 *
 * NEGA BU BOR. `server/proofs.ts` har topshirishda ikki joyga yozadi: eski
 * `ReportProof` (katak bo'yicha UPSERT — ya'ni faqat OXIRGI holat qoladi) va
 * yangi `ObligationSubmission` (har urinish uchun alohida qator). Ikkinchisiga
 * shu paytgacha KODDA BIRORTA HAM o'quvchi yo'q edi: yozilardi, lekin hech
 * qayerda ko'rinmasdi.
 *
 * Aynan shu bo'shliq tufayli rad etilgandan keyingi qayta topshirish tarixi
 * foydalanuvchiga ko'rinmasdi — `ReportProof` da faqat oxirgi urinish turadi.
 *
 * Bo'sh bo'lsa ATAYLAB sabab yoziladi: "tarix yo'q" bilan "yozuv tushmagan"
 * bir xil ko'rinmasligi kerak (`npm run audit:evidence` shu holatni sanaydi).
 */
export interface TrailAttempt {
  id: string;
  attemptNo: number;
  status: string;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  sourceSystem: string | null;
}

const LABEL: Record<string, string> = {
  sent: "Yuborildi",
  accepted: "Qabul qilindi",
  rejected: "Rad etildi",
};

const TONE: Record<string, { color: string; bg: string; Icon: typeof Send }> = {
  sent: { color: "var(--info)", bg: "var(--info-bg)", Icon: Send },
  accepted: { color: "var(--success)", bg: "var(--success-bg)", Icon: CheckCircle2 },
  rejected: { color: "var(--danger)", bg: "var(--danger-bg)", Icon: XCircle },
};

export function SubmissionTrail({ attempts }: { attempts: TrailAttempt[] }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} style={{ color: "var(--accent-blue)" }} />
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          Topshirish tarixi
        </h2>
        {attempts.length > 0 && (
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {attempts.length} ta urinish
          </span>
        )}
      </div>

      {attempts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Bu dalil uchun topshirish urinishi yozilmagan. Bu dalil majburiyat
          yozuvi joriy etilishidan oldin topshirilgan bo'lishi mumkin —
          skrinshotning o'zi yuqorida turibdi va yo&apos;qolmagan.
        </p>
      ) : (
        <div className="space-y-3">
          {attempts.map((a) => {
            const tone = TONE[a.status] ?? TONE.sent;
            const at = a.rejectedAt ?? a.acceptedAt ?? a.sentAt;
            return (
              <div key={a.id} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  <tone.Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    #{a.attemptNo} · {LABEL[a.status] ?? a.status}
                  </p>
                  <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                    {at ? formatUzDateTime(at) : "sana yo'q"}
                    {/* Backfill qatori odam topshirgan paytda emas, keyin
                        yozilgan — buni yashirmaymiz. */}
                    {a.sourceSystem && a.sourceSystem !== "asro" ? ` · manba: ${a.sourceSystem}` : ""}
                  </p>
                  {a.rejectionNote && (
                    <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                      {a.rejectionNote}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
