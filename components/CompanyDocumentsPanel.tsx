"use client";

// Firma hujjatlari arxivi.
//
// Fayl BAZADA base64 holida yotadi, lekin bu ro'yxatga hech qachon kelmaydi
// (`server/documents.ts` izohiga qarang) — yuklab olish alohida havola
// orqali, `/api/documents/[id]/file`.

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Download, Trash2, FileText, AlertTriangle } from "lucide-react";
import { formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { listDocuments, uploadDocument, deleteDocument } from "@/server/documents";

interface DocRow {
  id: string;
  docType: string;
  title: string;
  note: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  issuedAt: string | null;
  expiresAt: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  shartnoma: "Shartnoma",
  akt: "Akt",
  litsenziya: "Litsenziya",
  guvohnoma: "Guvohnoma",
  pasport: "Pasport nusxasi",
  boshqa: "Boshqa",
};

const inputCls = "px-3 py-2 rounded-lg text-body outline-none w-full";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text-primary)",
} as const;

const humanSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Muddat holati: o'tgan / yaqinlashgan / normal. */
const expiryState = (expiresAt: string | null): "expired" | "soon" | null => {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return null;
};

export default function CompanyDocumentsPanel({
  companyId,
  canEdit = true,
}: {
  companyId: string;
  canEdit?: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ docType: "shartnoma", title: "", note: "", issuedAt: "", expiresAt: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setDocs((await listDocuments(companyId)) as unknown as DocRow[]);
    } catch (e) {
      toast.error(friendlyError(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Fayl tanlang");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Hujjat nomini yozing");
      return;
    }

    setBusy(true);
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
        reader.readAsDataURL(file);
      });

      await uploadDocument({
        companyId,
        docType: form.docType,
        title: form.title,
        note: form.note || null,
        fileData,
        fileName: file.name,
        fileType: file.type,
        issuedAt: form.issuedAt || null,
        expiresAt: form.expiresAt || null,
      });

      toast.success("Hujjat yuklandi");
      setForm({ docType: "shartnoma", title: "", note: "", issuedAt: "", expiresAt: "" });
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: DocRow) => {
    setBusy(true);
    try {
      await deleteDocument(d.id);
      toast.success(`"${d.title}" o'chirildi`);
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in px-2">
      {canEdit && (
        <div className="dashboard-card p-5 !shadow-sm">
          <div className="mb-4 pb-3 border-b" style={{ borderColor: "var(--card-border)" }}>
            <h4 className="text-meta font-semibold uppercase tracking-widest" style={{ color: "var(--text)" }}>
              Yangi hujjat
            </h4>
            <p className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
              PDF, Word, Excel yoki rasm · 5 MB gacha
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Turi</span>
              <select
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={form.docType}
                onChange={(e) => setForm({ ...form, docType: e.target.value })}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Nomi</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="2026-yilgi xizmat shartnomasi"
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Hujjat sanasi</span>
              <input
                type="date"
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={form.issuedAt}
                onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>
                Amal qilish muddati
              </span>
              <input
                type="date"
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Izoh</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Fayl</span>
              <input
                ref={fileRef}
                type="file"
                className={inputCls + " mt-1"}
                style={inputStyle}
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              />
            </label>
          </div>

          <button
            onClick={upload}
            disabled={busy}
            className="mt-4 px-4 py-2 text-micro font-semibold rounded-lg uppercase tracking-widest flex items-center gap-2"
            style={{
              color: "var(--success)",
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)",
            }}
          >
            <Upload size={14} /> Yuklash
          </button>
        </div>
      )}

      <div className="dashboard-card p-5 !shadow-sm">
        <h4 className="text-meta font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text)" }}>
          Arxiv
        </h4>

        {loading ? (
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</p>
        ) : docs.length === 0 ? (
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            Bu firmada hali hujjat yo&apos;q.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const exp = expiryState(d.expiresAt);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                >
                  <FileText size={18} style={{ color: "var(--text-muted)" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium" style={{ color: "var(--text)" }}>{d.title}</span>
                      <span
                        className="text-micro px-2 py-0.5 rounded-md uppercase tracking-wide"
                        style={{ background: "var(--card-bg)", color: "var(--text-muted)" }}
                      >
                        {TYPE_LABELS[d.docType] ?? d.docType}
                      </span>
                      {exp && (
                        <span
                          className="text-micro px-2 py-0.5 rounded-md flex items-center gap-1"
                          style={{
                            color: exp === "expired" ? "var(--danger)" : "var(--warning)",
                            background:
                              exp === "expired"
                                ? "color-mix(in srgb, var(--danger) 12%, transparent)"
                                : "color-mix(in srgb, var(--warning) 12%, transparent)",
                          }}
                        >
                          <AlertTriangle size={11} />
                          {exp === "expired" ? "Muddati o'tgan" : "Muddati yaqin"}
                        </span>
                      )}
                    </div>
                    <div className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {d.fileName} · {humanSize(d.fileSize)}
                      {d.issuedAt && ` · ${formatUzDate(d.issuedAt)}`}
                      {d.expiresAt && ` → ${formatUzDate(d.expiresAt)}`}
                      {d.uploadedByName && ` · ${d.uploadedByName}`}
                    </div>
                    {d.note && (
                      <div className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>{d.note}</div>
                    )}
                  </div>
                  <a
                    href={`/api/documents/${d.id}/file`}
                    className="p-2 rounded-lg"
                    title="Yuklab olish"
                    style={{ color: "var(--accent-blue)" }}
                  >
                    <Download size={16} />
                  </a>
                  {canEdit && (
                    <button onClick={() => remove(d)} disabled={busy} title="O'chirish" className="p-2">
                      <Trash2 size={16} style={{ color: "var(--danger)" }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
