"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Ban,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  ZoomIn,
  Building2,
  Calendar,
  UserCheck,
  FileCheck,
} from "lucide-react";
import { reviewReportProof } from "@/server/proofs";
import { formatUzDateNumeric, formatUzTime } from "@/lib/format";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { Button } from "@/components/ui/Button";

interface ProofData {
  id: string;
  companyId: string;
  period: string;
  colKey: string;
  imageData: string;
  note: string | null;
  status: string;
  submittedById: string;
  submittedByName: string;
  submittedAt: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  company: {
    id: string;
    name: string;
    inn: string;
  };
}

interface Props {
  proof: ProofData;
  userRole: string;
  canReview: boolean;
}

export default function ProofViewClient({ proof: initialProof, canReview }: Props) {
  const router = useRouter();
  const [proof, setProof] = useState<ProofData>(initialProof);
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return `${formatUzDateNumeric(iso)}, ${formatUzTime(iso)}`;
    } catch {
      return iso;
    }
  };

  const handleReview = async (decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      await reviewReportProof({
        companyId: proof.companyId,
        period: proof.period,
        colKey: proof.colKey,
        decision,
        rejectReason: decision === "rejected" ? rejectReason.trim() || undefined : undefined,
      });
      toast.success(decision === "approved" ? "Tasdiqlandi ✅" : "Rad etildi ❌");
      setProof((prev) => ({
        ...prev,
        status: decision,
        rejectReason: decision === "rejected" ? rejectReason.trim() || null : null,
      }));
      setShowReject(false);
    } catch (e) {
      console.error(e);
      toast.error("Amalni bajarishda xatolik");
    } finally {
      setBusy(false);
    }
  };

  const imageUrl = `/api/proofs/${proof.id}/image`;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] p-4 md:p-6 overflow-y-auto space-y-6">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--card-border)] transition-all"
          >
            <ArrowLeft size={16} />
            <span>Matritsaga qaytish</span>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-wide text-[var(--text)]">
              {proof.company.name} · <span className="text-[var(--primary)]">{proof.colKey}</span>
            </h1>
            <p className="text-micro font-bold text-[var(--text-3)]">
              Davr: {proof.period} · INN: {proof.company.inn}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[var(--primary)] bg-[var(--surface)] border border-[var(--card-border)] hover:bg-[var(--surface-2)] transition-all"
          >
            <ExternalLink size={15} />
            <span className="hidden sm:inline">Rasm havolasi</span>
          </a>
          <Button variant="primary" size="md" onClick={() => setZoomOpen(true)}>
            <ZoomIn size={16} />
            <span>To'liq kattalashtirish</span>
          </Button>
        </div>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Interactive Image View */}
        <div className="lg:col-span-2 dashboard-card p-4 flex flex-col items-center justify-center relative min-h-[450px] group">
          <div className="w-full flex items-center justify-between mb-3 px-2">
            <span className="text-micro font-bold uppercase tracking-widest text-[var(--text-3)] flex items-center gap-1">
              <FileCheck size={14} /> Topshirilgan Skrinshot (bosing = kattalashadi)
            </span>
            <button
              onClick={() => setZoomOpen(true)}
              className="text-micro font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
            >
              <ZoomIn size={13} /> Zoom rejimiga o'tish
            </button>
          </div>

          <div
            onClick={() => setZoomOpen(true)}
            className="relative w-full flex items-center justify-center p-2 rounded-xl border border-[var(--card-border)] bg-[var(--surface-2)] cursor-zoom-in overflow-hidden transition-all hover:border-[var(--primary)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Skrinshot"
              className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-md"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-black/70 backdrop-blur border border-white/20 shadow-xl flex items-center gap-2">
                <ZoomIn size={16} /> kattalashtirish uchun bosing
              </span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Metadata & Approvals */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="dashboard-card p-5 space-y-4">
            <h3 className="text-xs font-semibold tracking-wider text-[var(--text)] border-b pb-3 border-[var(--card-border)]">
              Ma'lumotlar
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-3)] font-bold">Holat:</span>
                {proof.status === "approved" ? (
                  <span className="text-micro font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500">
                    Tasdiqlangan ✅
                  </span>
                ) : proof.status === "rejected" ? (
                  <span className="text-micro font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-500">
                    Rad etilgan ❌
                  </span>
                ) : (
                  <span className="text-micro font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 flex items-center gap-1">
                    <Clock size={12} /> Kutilmoqda
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[var(--text-3)] font-bold flex items-center gap-1">
                  <UserCheck size={14} /> Topshirdi:
                </span>
                <span className="font-bold text-[var(--text)]">{proof.submittedByName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[var(--text-3)] font-bold flex items-center gap-1">
                  <Calendar size={14} /> Vaqt:
                </span>
                <span className="font-mono text-[var(--text-2)]">{fmtDate(proof.submittedAt)}</span>
              </div>

              {proof.note && (
                <div className="p-3 rounded-lg bg-[var(--surface-2)] text-[var(--text-2)] space-y-1">
                  <span className="font-bold text-micro text-[var(--text-3)] uppercase tracking-wider block">
                    Izoh:
                  </span>
                  <p>{proof.note}</p>
                </div>
              )}

              {proof.status === "rejected" && proof.rejectReason && (
                <div className="p-3 rounded-lg bg-rose-500/10 text-rose-500 space-y-1">
                  <span className="font-bold text-micro uppercase tracking-wider block">
                    Rad etish sababi:
                  </span>
                  <p>{proof.rejectReason}</p>
                </div>
              )}

              {proof.reviewedByName && (
                <div className="pt-2 border-t border-[var(--card-border)] text-micro font-bold text-[var(--text-3)]">
                  {proof.status === "approved" ? "Tasdiqladi" : "Rad etdi"}: {proof.reviewedByName} ·{" "}
                  {fmtDate(proof.reviewedAt)}
                </div>
              )}
            </div>

            {/* Actions for Reviewers */}
            {canReview && (
              <div className="pt-4 border-t border-[var(--card-border)] space-y-3">
                {showReject ? (
                  <div className="space-y-3">
                    <textarea
                      autoFocus
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Rad etish sababi (ixtiyoriy)..."
                      className="w-full text-xs rounded-xl p-3 bg-[var(--surface-2)] border border-rose-500/40 text-[var(--text)] outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowReject(false)}
                        disabled={busy}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--card-border)]"
                      >
                        Orqaga
                      </button>
                      <button
                        onClick={() => handleReview("rejected")}
                        disabled={busy}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 flex items-center justify-center gap-1.5"
                      >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                        Rad etish
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowReject(true)}
                      disabled={busy}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 flex items-center justify-center gap-1.5"
                    >
                      <Ban size={15} />
                      Rad etish
                    </button>
                    <button
                      onClick={() => handleReview("approved")}
                      disabled={busy}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-1.5 shadow-md"
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Tasdiqlash
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Interactive Zoom Modal ── */}
      {zoomOpen && (
        <ImageZoomModal
          src={imageUrl}
          title={`${proof.company.name} · ${proof.colKey}`}
          subtitle={`${proof.period} davri uchun topshirilgan skrinshot`}
          proofId={proof.id}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}
