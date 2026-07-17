"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Upload, Clipboard, Check, Ban, Loader2, ImageIcon, Clock } from "lucide-react";
import { compressImageFile, compressDataUrl } from "@/lib/imageCompress";
import { saveReportProof, getReportProof, reviewReportProof } from "@/server/proofs";
import { formatUzDateNumeric, formatUzTime } from "@/lib/format";

interface ProofFull {
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
}

export interface ProofModalState {
  mode: "upload" | "review";
  companyId: string;
  companyName: string;
  colKey: string;
  colLabel: string;
}

interface Props {
  state: ProofModalState | null;
  period: string;
  canReview: boolean;
  onClose: () => void;
  onSubmitted: (companyId: string, colKey: string) => void;
  onReviewed: (companyId: string, colKey: string, cellValue: string) => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return `${formatUzDateNumeric(iso)}, ${formatUzTime(iso)}`;
  } catch {
    return iso;
  }
};

const ReportProofModal: React.FC<Props> = ({ state, period, canReview, onClose, onSubmitted, onReviewed }) => {
  const [imgPreview, setImgPreview] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [proof, setProof] = useState<ProofFull | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const open = !!state;
  const mode = state?.mode;

  // Oyna ochilganda holatni tiklash
  useEffect(() => {
    if (!open) return;
    setImgPreview("");
    setNote("");
    setProof(null);
    setShowReject(false);
    setRejectReason("");

    if (mode === "review" && state) {
      setLoadingProof(true);
      getReportProof(state.companyId, period, state.colKey)
        .then((p) => setProof(p as ProofFull | null))
        .catch(() => toast.error("Dalilni yuklab bo'lmadi"))
        .finally(() => setLoadingProof(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, state?.companyId, state?.colKey, period]);

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm (skrinshot) yuklang");
      return;
    }
    try {
      const compressed = await compressImageFile(file);
      setImgPreview(compressed);
    } catch {
      toast.error("Rasmni qayta ishlashda xatolik");
    }
  }, []);

  // Clipboard'dan (Ctrl+V) skrinshot yopishtirish
  useEffect(() => {
    if (!open || mode !== "upload") return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            await handleFile(file);
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, mode, handleFile]);

  const handleSubmit = async () => {
    if (!state) return;
    if (!imgPreview) {
      toast.error("Skrinshot majburiy — iltimos rasm yuklang");
      return;
    }
    setBusy(true);
    try {
      await saveReportProof({
        companyId: state.companyId,
        period,
        colKey: state.colKey,
        colLabel: state.colLabel,
        imageData: imgPreview,
        note: note.trim() || undefined,
      });
      toast.success("Hisobot topshirildi — nazoratchiga xabar yuborildi");
      onSubmitted(state.companyId, state.colKey);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Saqlashda xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (decision: "approved" | "rejected") => {
    if (!state) return;
    setBusy(true);
    try {
      const res = await reviewReportProof({
        companyId: state.companyId,
        period,
        colKey: state.colKey,
        colLabel: state.colLabel,
        decision,
        rejectReason: decision === "rejected" ? rejectReason.trim() || undefined : undefined,
      });
      toast.success(decision === "approved" ? "Tasdiqlandi ✅" : "Rad etildi ❌");
      onReviewed(state.companyId, state.colKey, res.cellValue);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Amalni bajarishda xatolik");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !state) return null;

  const statusBadge = (s: string) => {
    if (s === "approved") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(52,208,88,0.15)", color: "#34d058" }}>Tasdiqlangan</span>;
    if (s === "rejected") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,107,107,0.15)", color: "#ff6b6b" }}>Rad etilgan</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "rgba(77,163,255,0.15)", color: "#4da3ff" }}><Clock size={11} /> Kutilmoqda</span>;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--card-border)" }}>
          <div>
            <h3 className="text-sm font-black" style={{ color: "var(--text)" }}>
              {mode === "upload" ? "Hisobotni topshirish" : "Topshirilgan hisobot"}
            </h3>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
              {state.companyName} · <span style={{ color: "var(--primary)" }}>{state.colLabel}</span> · {period}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70" style={{ color: "var(--text-3)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {mode === "upload" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {imgPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgPreview} alt="Skrinshot" className="w-full rounded-lg border" style={{ borderColor: "var(--card-border)", maxHeight: "40vh", objectFit: "contain", background: "var(--surface-2)" }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-2 right-2 text-[10px] font-bold px-2.5 py-1 rounded-lg shadow"
                    style={{ background: "var(--card-bg)", color: "var(--text-2)", border: "1px solid var(--card-border)" }}
                  >
                    O'zgartirish
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors hover:border-[var(--primary)]"
                  style={{ borderColor: "var(--card-border)", color: "var(--text-3)" }}
                >
                  <Upload size={26} />
                  <span className="text-xs font-bold" style={{ color: "var(--text-2)" }}>Skrinshot yuklash</span>
                  <span className="text-[10px] flex items-center gap-1"><Clipboard size={11} /> yoki Ctrl+V bilan yopishtiring</span>
                </button>
              )}

              <label className="block text-[11px] font-bold uppercase tracking-widest mt-4 mb-1.5" style={{ color: "var(--text-3)" }}>
                Izoh (ixtiyoriy)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Masalan: hisobot yuborildi, kvitansiya ilova qilindi..."
                className="w-full text-xs rounded-lg px-3 py-2 outline-none resize-none"
                style={{ background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--text)" }}
              />

              <div className="flex gap-2 mt-5">
                <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--card-border)" }}>
                  Bekor
                </button>
                <button onClick={handleSubmit} disabled={busy || !imgPreview} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark))" }}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Topshirish
                </button>
              </div>
            </>
          ) : (
            <>
              {loadingProof ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={26} className="animate-spin" style={{ color: "var(--primary)" }} />
                </div>
              ) : !proof ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "var(--text-3)" }}>
                  <ImageIcon size={30} />
                  <span className="text-xs font-bold">Bu katak uchun dalil topilmadi</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-bold" style={{ color: "var(--text-2)" }}>
                      {proof.submittedByName} topshirdi
                      <span className="font-normal" style={{ color: "var(--text-3)" }}> · {fmtDate(proof.submittedAt)}</span>
                    </div>
                    {statusBadge(proof.status)}
                  </div>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={proof.imageData} target="_blank" rel="noopener noreferrer" title="To'liq ochish">
                    <img src={proof.imageData} alt="Skrinshot" className="w-full rounded-lg border cursor-zoom-in" style={{ borderColor: "var(--card-border)", maxHeight: "45vh", objectFit: "contain", background: "var(--surface-2)" }} />
                  </a>

                  {proof.note && (
                    <div className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
                      <span className="font-bold">Izoh: </span>{proof.note}
                    </div>
                  )}

                  {proof.status === "rejected" && proof.rejectReason && (
                    <div className="mt-2 text-xs rounded-lg px-3 py-2" style={{ background: "rgba(255,107,107,0.1)", color: "#ff6b6b" }}>
                      <span className="font-bold">Rad etish sababi: </span>{proof.rejectReason}
                    </div>
                  )}

                  {proof.status !== "pending" && proof.reviewedByName && (
                    <p className="mt-2 text-[10px] font-bold" style={{ color: "var(--text-3)" }}>
                      {proof.status === "approved" ? "Tasdiqladi" : "Rad etdi"}: {proof.reviewedByName} · {fmtDate(proof.reviewedAt)}
                    </p>
                  )}

                  {/* Nazoratchi harakatlari — faqat pending holatda */}
                  {canReview && proof.status === "pending" && (
                    showReject ? (
                      // ── Rad etish rejimi: faqat sabab + rad etishni tasdiqlash ──
                      <div className="mt-4">
                        <label className="block text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#ff6b6b" }}>
                          Rad etish sababi
                        </label>
                        <textarea
                          autoFocus
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="Nima uchun rad etilyapti? (ixtiyoriy)"
                          className="w-full text-xs rounded-lg px-3 py-2 outline-none resize-none"
                          style={{ background: "var(--surface)", border: "1px solid rgba(255,107,107,0.4)", color: "var(--text)" }}
                        />
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { setShowReject(false); setRejectReason(""); }} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--card-border)" }}>
                            Orqaga
                          </button>
                          <button onClick={() => handleReview("rejected")} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}>
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                            Rad etishni tasdiqlash
                          </button>
                        </div>
                      </div>
                    ) : (
                      // ── Asosiy: Rad etish / Tasdiqlash ──
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowReject(true)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "rgba(255,107,107,0.12)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,0.3)" }}>
                          <Ban size={15} />
                          Rad etish
                        </button>
                        <button onClick={() => handleReview("approved")} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #28a745, #1e7e34)" }}>
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          Tasdiqlash
                        </button>
                      </div>
                    )
                  )}

                  {(!canReview || proof.status !== "pending") && (
                    <button onClick={onClose} className="w-full mt-5 py-2.5 rounded-xl text-xs font-bold" style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--card-border)" }}>
                      Yopish
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReportProofModal;
