"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Send, AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { friendlyError } from "@/lib/actionError";
import { previewBulkRecipients, sendBulkAssignment, type BulkAudience, type BulkRecipient } from "@/server/bulkAssign";
import type { CompanyRelation } from "@/lib/permissions";
import type { TaskPriority } from "@prisma/client";
import { DateField } from "./ui/DateField";

/**
 * OMMAVIY TOPSHIRIQ OYNASI.
 *
 * Rahbar bir xil ishni o'nlab odamga bittalab yozib chiqardi. Bu yerda
 * oluvchilar TA'RIF bilan tanlanadi ("portfelimdagi buxgalterlar"), ro'yxat
 * esa serverda hisoblanadi va yuborishdan OLDIN ko'rsatiladi — kimga
 * ketayotganini ko'rmasdan yuborib bo'lmaydi.
 */

const RELATION_LABELS: { value: CompanyRelation | "all"; label: string }[] = [
  { value: "all", label: "Hammasi" },
  { value: "accountant", label: "Buxgalterlar" },
  { value: "supervisor", label: "Nazoratchilar" },
  { value: "chief_accountant", label: "Bosh buxgalterlar" },
  { value: "bank_manager", label: "Bank-klientlar" },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Past" },
  { value: "normal", label: "O'rta" },
  { value: "high", label: "Yuqori" },
  { value: "urgent", label: "Shoshilinch" },
];

export default function BulkAssignModal({ open, onClose, onSent }: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [mode, setMode] = useState<"task" | "message">("task");
  const [pickMode, setPickMode] = useState<"portfolio" | "manual">("portfolio");
  const [relation, setRelation] = useState<CompanyRelation | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [telegram, setTelegram] = useState(false);

  const [pool, setPool] = useState<BulkRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Portfeldagi barcha odamlar — qo'lda tanlash ham shu ro'yxatdan boradi.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    previewBulkRecipients({ kind: "portfolio", relation })
      .then((list) => { if (!cancelled) setPool(list); })
      .catch((e) => { if (!cancelled) toast.error(friendlyError(e, "Ro'yxatni olib bo'lmadi")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, relation]);

  // Rol filtri o'zgarsa, ro'yxatdan chiqib ketganlarning belgisi ham ketsin.
  useEffect(() => {
    setPicked((prev) => new Set([...prev].filter((id) => pool.some((p) => p.id === id))));
  }, [pool]);

  const audience: BulkAudience =
    pickMode === "manual" ? { kind: "manual", userIds: [...picked] } : { kind: "portfolio", relation };
  const targets = pickMode === "manual" ? pool.filter((p) => picked.has(p.id)) : pool;

  const reset = () => {
    setTitle(""); setDescription(""); setDueAt(""); setPriority("normal");
    setTelegram(false); setPicked(new Set()); setPickMode("portfolio"); setRelation("all");
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Sarlavha majburiy");
    if (targets.length === 0) return toast.error("Kamida bitta oluvchi tanlang");
    setBusy(true);
    try {
      const res = await sendBulkAssignment({
        audience, mode, title, description,
        dueAt: mode === "task" && dueAt ? dueAt : undefined,
        priority: mode === "task" ? priority : undefined,
        telegram,
      });
      toast.success(
        mode === "task"
          ? `${res.tasksCreated} ta vazifa yaratildi · ${res.notified} kishiga xabar${res.telegramQueued ? " + Telegram" : ""}`
          : `${res.notified} kishiga xabar yuborildi${res.telegramQueued ? " + Telegram" : ""}`
      );
      reset(); onSent?.(); onClose();
    } catch (e) {
      toast.error(friendlyError(e, "Yuborib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2 rounded-lg border text-sm";
  const inputStyle = { borderColor: "var(--rule)", background: "var(--input-bg)", color: "var(--text-primary)" };
  const label = "text-micro font-bold uppercase tracking-widest block mb-1.5";
  const labelStyle = { color: "var(--text-muted)" };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      dismissable={!busy}
      size="lg"
      title="Ommaviy topshiriq"
      description="Bir vaqtda bir necha kishiga vazifa yoki xabar"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-meta" style={{ color: "var(--text-muted)" }}>
            {loading ? "Hisoblanmoqda…" : `${targets.length} kishiga ketadi`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>Bekor</Button>
            <Button variant="primary" size="md" onClick={submit} disabled={busy || loading || !targets.length}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {mode === "task" ? "Vazifa berish" : "Xabar yuborish"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs
          variant="segment"
          size="sm"
          items={[
            { id: "task" as const, label: "Vazifa", hint: "Kuzatiladi — Ishlar ro'yxatida ko'rinadi" },
            { id: "message" as const, label: "Xabar", hint: "Faqat bildirishnoma, kuzatilmaydi" },
          ]}
          value={mode}
          onChange={setMode}
          idBase="bulk-mode"
          ariaLabel="Yuborish turi"
        />

        {/* ── Kimga ── */}
        <div>
          <span className={label} style={labelStyle}>Kimga</span>
          <div className="flex flex-wrap gap-2 mb-2">
            {RELATION_LABELS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRelation(r.value)}
                className="px-3 py-1.5 rounded-lg text-meta font-semibold transition-colors"
                style={relation === r.value
                  ? { background: "var(--brand)", color: "#fff" }
                  : { background: "var(--bg-sunken)", color: "var(--text-secondary)", border: "1px solid var(--rule)" }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-body cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={pickMode === "manual"}
              onChange={(e) => setPickMode(e.target.checked ? "manual" : "portfolio")}
            />
            Ro&apos;yxatdan qo&apos;lda belgilash
          </label>
        </div>

        {/* ── Oluvchilar ro'yxati ── */}
        <div className="rounded-xl border max-h-52 overflow-y-auto" style={{ borderColor: "var(--rule)" }}>
          {loading ? (
            <div className="p-4 text-center text-meta" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</div>
          ) : pool.length === 0 ? (
            <div className="p-4 text-center text-meta" style={{ color: "var(--text-muted)" }}>
              Portfelingizda bu tanlovga mos xodim yo&apos;q.
            </div>
          ) : (
            pool.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                style={{ borderBottom: "1px solid var(--rule)" }}
              >
                <input
                  type="checkbox"
                  checked={pickMode === "manual" ? picked.has(p.id) : true}
                  disabled={pickMode !== "manual"}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(p.id); else next.delete(p.id);
                    setPicked(next);
                  }}
                />
                <span className="flex-1 text-body" style={{ color: "var(--text-primary)" }}>{p.fullName}</span>
                <span className="text-micro" style={{ color: "var(--text-muted)" }}>{p.companies} ta firma</span>
              </label>
            ))
          )}
        </div>

        {/* ── Mazmuni ── */}
        <div className="space-y-3">
          <div>
            <span className={label} style={labelStyle}>Sarlavha *</span>
            <input className={input} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={mode === "task" ? "Masalan: Avgust hisobotini yopish" : "Masalan: Ertaga yig'ilish 10:00"} />
          </div>
          <div>
            <span className={label} style={labelStyle}>Izoh</span>
            <textarea className={input} style={inputStyle} rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          {mode === "task" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label} style={labelStyle}>Muddat</span>
                <DateField inputClassName={input} inputStyle={inputStyle} value={dueAt} onChange={setDueAt} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Muhimlik</span>
                <select className={input} style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Telegram — ataylab belgilanadi ── */}
        <label
          className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
        >
          <input type="checkbox" className="mt-0.5" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
          <span className="text-body" style={{ color: "var(--text-primary)" }}>
            Telegramga ham yuborilsin
            <span className="block text-meta mt-0.5" style={{ color: "var(--text-secondary)" }}>
              <AlertTriangle size={12} className="inline mr-1" style={{ color: "var(--warning)" }} />
              {targets.length} kishining telefoniga xabar boradi. Sayt ichidagi bildirishnoma bunisiz ham yoziladi.
            </span>
          </span>
        </label>

        <p className="text-meta flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <Users size={13} />
          Ro&apos;yxat faqat sizning portfelingizdagi firmalardan tuziladi.
        </p>
      </div>
    </Modal>
  );
}
