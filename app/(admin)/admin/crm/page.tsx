"use client";

import React, { useState, useEffect } from "react";
import { listLeads, createLead, updateLeadStatus } from "@/server/leads";
import { Badge, type BadgeTone, Select } from "@/components/ui";
import { formatUzDateNumeric } from "@/lib/platform/format";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  source: string | null;
  status: string;
  note: string | null;
  assignedTo: { id: string; fullName: string } | null;
  createdAt: Date;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Yangi",
  contacted: "Bog'langan",
  qualified: "Malakali",
  proposal: "Taklif",
  negotiation: "Muzokara",
  won: "Yutildi",
  lost: "Yo'qotildi",
};

// Yettita bosqich uchun yettita rang bor edi (ko'k/yashil/sariq/binafsha/
// qizil...) — ya'ni rang bosqichni emas, shunchaki "boshqacha" ekanini
// bildirardi. Endi rang faqat NATIJANI aytadi: yutildi yashil, yo'qotildi
// qizil, muzokara davom etmoqda sariq, qolgani neytral.
/** Maydon uslubi — beshta inputda bir xil, shuning uchun bir marta. */
const FIELD: React.CSSProperties = {
  padding: "8px",
  borderRadius: "6px",
  border: "1px solid var(--card-border)",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  new: "neutral",
  contacted: "neutral",
  qualified: "info",
  proposal: "info",
  negotiation: "warning",
  won: "success",
  lost: "danger",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", inn: "", source: "", note: "" });

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    const r = await listLeads();
    if ("error" in r) { setError(r.error ?? "Xatolik"); }
    else setLeads(r.leads as Lead[]);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await createLead(form);
    if ("error" in r) { setError(r.error ?? "Xatolik"); return; }
    setShowForm(false);
    setForm({ name: "", phone: "", email: "", inn: "", source: "", note: "" });
    loadLeads();
  }

  async function handleStatus(id: string, status: string) {
    const r = await updateLeadStatus(id, status);
    if (!("error" in r)) loadLeads();
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>CRM — Lead lar</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: "var(--accent-blue)",
            color: "var(--on-brand)",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {showForm ? "Bekor" : "+ Lead qo'shish"}
        </button>
      </div>

      {error && (
        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "var(--card-bg)", padding: "20px", borderRadius: "12px", marginBottom: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <input
            placeholder="Mijoz nomi *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            style={FIELD}
          />
          <input
            placeholder="Telefon"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={FIELD}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={FIELD}
          />
          <input
            placeholder="STIR (INN)"
            value={form.inn}
            onChange={(e) => setForm({ ...form, inn: e.target.value })}
            style={FIELD}
          />
          <Select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value ?? "" })}
          >
            <option value="">Manba</option>
            <option value="telegram">Telegram</option>
            <option value="phone">Telefon</option>
            <option value="website">Veb-sayt</option>
            <option value="referal">Tavsiya</option>
            <option value="other">Boshqa</option>
          </Select>
          <textarea
            placeholder="Izoh"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            style={{ ...FIELD, gridColumn: "1/-1" }}
          />
          <button
            type="submit"
            style={{ gridColumn: "1/-1", background: "var(--success)", color: "var(--on-success)", border: "none", borderRadius: "8px", padding: "10px", cursor: "pointer" }}
          >
            Saqlash
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Yuklanmoqda...</p>
      ) : leads.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Lead lar yo'q</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {leads.map((lead) => (
            <div key={lead.id} style={{ background: "var(--card-bg)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong>{lead.name}</strong>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Badge tone={STATUS_TONE[lead.status] ?? "neutral"} dot>
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </Badge>
                  {/* Nishon holatni KO'RSATADI, tanlagich uni O'ZGARTIRADI.
                      Ilgari bitta rangli <select> ikkalasini ham qilardi va
                      `<option>` foni `#1a1a2e` ga qotirilgani uchun yorug'
                      temada qora ro'yxat ochilardi. */}
                  <Select
                    size="sm"
                    fullWidth={false}
                    value={lead.status}
                    onChange={(e) => handleStatus(lead.id, e.target.value)}
                    aria-label={`${lead.name} — holatni o'zgartirish`}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>
                </span>
              </div>
              {lead.phone && <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>📞 {lead.phone}</div>}
              {lead.email && <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>✉ {lead.email}</div>}
              {lead.inn && <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>STIR: {lead.inn}</div>}
              {lead.source && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>#{lead.source}</div>}
              {lead.assignedTo && (
                <div style={{ fontSize: "12px", color: "var(--success)", marginTop: "4px" }}>
                  👤 {lead.assignedTo.fullName}
                </div>
              )}
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
                {formatUzDateNumeric(lead.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
