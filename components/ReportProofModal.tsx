"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { X, Upload, Clipboard, Check, Ban, Loader2, ImageIcon, Clock, ZoomIn, ExternalLink } from "lucide-react";
import { compressImageFile } from "@/lib/imageCompress";
import { saveReportProof, getReportProof, reviewReportProof } from "@/server/proofs";
import { formatUzDateNumeric, formatUzTime } from "@/lib/platform/format";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { Button } from "@/components/ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

interface ProofFull {
  id: string;
  companyId: string;
  period: string;
  colKey: string;
  /** Hisobotning o'zi — ixtiyoriy, skrinshotga qo'shimcha. */
  fileName: string | null;
  fileType: string | null;
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

/**
 * Fayl chegaralari — MODUL darajasida.
 *
 * Ilgari ular komponent TANASIDA e'lon qilinardi, ya'ni har renderda yangi
 * massiv/son yaratilardi va `useCallback` ularni bog'liqlik sifatida ko'ra
 * olmasdi (eslint aynan shuni ko'rsatib turardi). Qiymatlar o'zgarmas —
 * joyi shu yerda. Chegara serverda ham majburlanadi (`server/proofs.ts`).
 */
const FILE_MAX = 2 * 1024 * 1024;
const FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const ReportProofModal: React.FC<Props> = ({ state, period, canReview, onClose, onSubmitted, onReviewed }) => {
  const [imgPreview, setImgPreview] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [proof, setProof] = useState<ProofFull | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState(false); // to'liq ekran skrinshot ko'rinishi
  const [uploadZoom, setUploadZoom] = useState(false); // yuklanayotgan skrinshot zoomi
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
    setLightbox(false);

    if (mode === "review" && state) {
      setLoadingProof(true);
      getReportProof(state.companyId, period, state.colKey)
        .then((p) => setProof(p as ProofFull | null))
        .catch(() => toast.error("Dalilni yuklab bo'lmadi"))
        .finally(() => setLoadingProof(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, state?.companyId, state?.colKey, period]);

  // Lightbox ochiq bo'lsa Esc bilan yopish
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // HISOBOT FAYLI — ixtiyoriy, skrinshotga qo'shimcha. Nazoratchi skrinshotdan
  // o'qiy olmasa asl hujjatni ochadi.
  const [docFile, setDocFile] = useState<{ data: string; name: string; type: string } | null>(null);

  const handleDoc = useCallback(async (file: File | null | undefined) => {
    if (!file) { setDocFile(null); return; }
    if (!FILE_TYPES.includes(file.type)) {
      toast.error("Faqat PDF, Excel yoki rasm biriktirish mumkin");
      return;
    }
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("o'qib bo'lmadi"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!data) { toast.error("Faylni o'qib bo'lmadi"); return; }
    // Chegara base64 UZUNLIGI bo'yicha — bazada aynan shuncha joy egallaydi.
    if (data.length > FILE_MAX) {
      toast.error(`Fayl juda katta (${(data.length / 1024 / 1024).toFixed(1)} MB). Chegara — 2 MB.`);
      return;
    }
    setDocFile({ data, name: file.name, type: file.type });
  }, []);

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
        fileData: docFile?.data,
        fileName: docFile?.name,
        fileType: docFile?.type,
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
    if (s === "approved") return <span className="text-micro font-bold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>Tasdiqlangan</span>;
    if (s === "rejected") return <span className="text-micro font-bold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>Rad etilgan</span>;
    return <span className="text-micro font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "color-mix(in srgb, var(--info) 15%, transparent)", color: "var(--info)" }}><Clock size={11} /> Kutilmoqda</span>;
  };

  return (
    <>
    <ModalLayer open onClose={onClose} label="Hisobot dalili">
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--card-border)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {mode === "upload" ? "Hisobotni topshirish" : "Topshirilgan hisobot"}
            </h3>
            <p className="text-meta font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
              {state.companyName} · <span style={{ color: "var(--primary)" }}>{state.colLabel}</span> · {period}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn-sm hover:opacity-70" style={{ color: "var(--text-3)" }}>
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
                <div className="relative group rounded-lg overflow-hidden border cursor-zoom-in" style={{ borderColor: "var(--card-border)", background: "var(--surface-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgPreview}
                    alt="Skrinshot"
                    onClick={() => setUploadZoom(true)}
                    className="w-full rounded-lg"
                    style={{ maxHeight: "40vh", objectFit: "contain" }}
                  />
                  <div
                    onClick={() => setUploadZoom(true)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                  >
                    <span className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur text-white text-xs font-bold border border-white/20 flex items-center gap-1.5">
                      <ZoomIn size={15} /> Kattalashtirish
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-2 right-2 text-micro font-bold px-2.5 py-1 rounded-lg shadow-md z-10 hover:scale-105 transition-all"
                    style={{ background: "var(--card-bg)", color: "var(--text)", border: "1px solid var(--card-border)" }}
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
                  <span className="text-micro flex items-center gap-1"><Clipboard size={11} /> yoki Ctrl+V bilan yopishtiring</span>
                </button>
              )}

              {/* HISOBOT FAYLI — ixtiyoriy. Skrinshot tez ko'z yugurtirish
                  uchun, fayl esa nazoratchi hujjatning o'zini ochishi uchun. */}
              <label className="block text-meta font-bold uppercase tracking-widest mt-4 mb-1.5" style={{ color: "var(--text-3)" }}>
                Hisobot fayli (ixtiyoriy) · PDF, Excel yoki rasm · maks 2 MB
              </label>
              {docFile ? (
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                >
                  <span className="text-xs truncate" style={{ color: "var(--text)" }}>
                    {docFile.name} · {(docFile.data.length / 1024).toFixed(0)} kB
                  </span>
                  <button
                    onClick={() => setDocFile(null)}
                    className="text-xs font-bold shrink-0"
                    style={{ color: "var(--danger)" }}
                  >
                    O&apos;chirish
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,image/jpeg,image/png"
                  onChange={(e) => handleDoc(e.target.files?.[0])}
                  className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                />
              )}

              <label className="block text-meta font-bold uppercase tracking-widest mt-4 mb-1.5" style={{ color: "var(--text-3)" }}>
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
                <Button variant="primary" size="md" onClick={handleSubmit} disabled={busy || !imgPreview} className="flex-1">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  Topshirish
                </Button>
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
                    <div className="text-meta font-bold" style={{ color: "var(--text-2)" }}>
                      {proof.submittedByName} topshirdi
                      <span className="font-normal" style={{ color: "var(--text-3)" }}> · {fmtDate(proof.submittedAt)}</span>
                    </div>
                    {statusBadge(proof.status)}
                  </div>

                  {/* HISOBOT FAYLI — skrinshotdan o'qib bo'lmaganda asl hujjat. */}
                  {proof.fileName && (
                    <a
                      href={`/api/proofs/${proof.id}/file`}
                      className="flex items-center justify-between gap-2 px-3 py-2 mb-3 rounded-lg hover:opacity-80 transition-opacity"
                      style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                    >
                      <span className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                        📎 {proof.fileName}
                      </span>
                      <span className="text-micro font-bold uppercase tracking-widest shrink-0" style={{ color: "var(--primary)" }}>
                        Yuklab olish
                      </span>
                    </a>
                  )}

                  {/* Skrinshot preview: ustiga bosilsa to'liq zoom rejimida ochiladi */}
                  <div className="relative group rounded-lg overflow-hidden border cursor-zoom-in" style={{ borderColor: "var(--card-border)", background: "var(--surface-2)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/proofs/${proof.id}/image`}
                      alt="Skrinshot"
                      onClick={() => setLightbox(true)}
                      className="w-full rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
                      style={{ maxHeight: "42vh", objectFit: "contain" }}
                    />
                    <div
                      onClick={() => setLightbox(true)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-bold pointer-events-auto"
                    >
                      <span className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-lg">
                        <ZoomIn size={15} /> Kattalashtirish
                      </span>
                      <a
                        href={`/reports/proof/${proof.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-lg text-white"
                        title="Alohida to'liq sahifada ochish"
                      >
                        <ExternalLink size={14} /> Yangi oynada
                      </a>
                    </div>
                  </div>

                  {proof.note && (
                    <div className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
                      <span className="font-bold">Izoh: </span>{proof.note}
                    </div>
                  )}

                  {proof.status === "rejected" && proof.rejectReason && (
                    <div className="mt-2 text-xs rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
                      <span className="font-bold">Rad etish sababi: </span>{proof.rejectReason}
                    </div>
                  )}

                  {proof.status !== "pending" && proof.reviewedByName && (
                    <p className="mt-2 text-micro font-bold" style={{ color: "var(--text-3)" }}>
                      {proof.status === "approved" ? "Tasdiqladi" : "Rad etdi"}: {proof.reviewedByName} · {fmtDate(proof.reviewedAt)}
                    </p>
                  )}

                  {/* Nazoratchi harakatlari — faqat pending holatda */}
                  {canReview && proof.status === "pending" && (
                    showReject ? (
                      // ── Rad etish rejimi: faqat sabab + rad etishni tasdiqlash ──
                      <div className="mt-4">
                        <label className="block text-meta font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--danger)" }}>
                          Rad etish sababi
                        </label>
                        <textarea
                          autoFocus
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="Nima uchun rad etilyapti? (ixtiyoriy)"
                          className="w-full text-xs rounded-lg px-3 py-2 outline-none resize-none"
                          style={{ background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", color: "var(--text)" }}
                        />
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { setShowReject(false); setRejectReason(""); }} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--card-border)" }}>
                            Orqaga
                          </button>
                          <Button variant="danger" size="md" onClick={() => handleReview("rejected")} disabled={busy} className="flex-1">
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
                            Rad etishni tasdiqlash
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // ── Asosiy: Rad etish / Tasdiqlash ──
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => setShowReject(true)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
                          <Ban size={15} />
                          Rad etish
                        </button>
                        <Button variant="success" size="md" onClick={() => handleReview("approved")} disabled={busy} className="flex-1">
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          Tasdiqlash
                        </Button>
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
    </ModalLayer>

    {/* ── Interaktiv to'liq ekran kattalashtirish (Zoom, Pan, Rotate, New Tab) ── */}
    {lightbox && proof && (
      <ImageZoomModal
        src={`/api/proofs/${proof.id}/image`}
        title={`${state?.companyName || ""} · ${state?.colLabel || proof.colKey}`}
        subtitle={`${period} davri uchun topshirilgan skrinshot`}
        proofId={proof.id}
        onClose={() => setLightbox(false)}
      />
    )}

    {uploadZoom && imgPreview && (
      <ImageZoomModal
        src={imgPreview}
        title={`${state?.companyName || ""} · ${state?.colLabel || ""}`}
        subtitle="Yuklanayotgan skrinshot preview"
        onClose={() => setUploadZoom(false)}
      />
    )}
    </>
  );
};

export default ReportProofModal;
