"use client";

import { useState, useEffect } from "react";
import { listLeads, createLead, updateLeadStatus, assignLead } from "@/server/leads";

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

const STATUS_COLORS: Record<string, string> = {
  new: "#888",
  contacted: "#3b82f6",
  qualified: "#22c55e",
  proposal: "#f59e0b",
  negotiation: "#8b5cf6",
  won: "#10b981",
  lost: "#ef4444",
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
            background: "var(--accent, #3b82f6)",
            color: "#fff",
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
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "var(--card-bg, #1a1a2e)", padding: "20px", borderRadius: "12px", marginBottom: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <input
            placeholder="Mijoz nomi *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          />
          <input
            placeholder="Telefon"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          />
          <input
            placeholder="STIR (INN)"
            value={form.inn}
            onChange={(e) => setForm({ ...form, inn: e.target.value })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          />
          <select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value ?? "" })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          >
            <option value="">Manba</option>
            <option value="telegram">Telegram</option>
            <option value="phone">Telefon</option>
            <option value="website">Veb-sayt</option>
            <option value="referal">Tavsiya</option>
            <option value="other">Boshqa</option>
          </select>
          <textarea
            placeholder="Izoh"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            style={{ gridColumn: "1/-1", padding: "8px", borderRadius: "6px", border: "1px solid #333", background: "#111", color: "#fff" }}
          />
          <button
            type="submit"
            style={{ gridColumn: "1/-1", background: "var(--success, #22c55e)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", cursor: "pointer" }}
          >
            Saqlash
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "#888" }}>Yuklanmoqda...</p>
      ) : leads.length === 0 ? (
        <p style={{ color: "#888" }}>Lead lar yo'q</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {leads.map((lead) => (
            <div key={lead.id} style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong>{lead.name}</strong>
                <select
                  value={lead.status}
                  onChange={(e) => handleStatus(lead.id, e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: STATUS_COLORS[lead.status] ?? "#888",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k} style={{ background: "#1a1a2e", color: STATUS_COLORS[k] }}>{v}</option>
                  ))}
                </select>
              </div>
              {lead.phone && <div style={{ fontSize: "13px", color: "#888" }}>📞 {lead.phone}</div>}
              {lead.email && <div style={{ fontSize: "13px", color: "#888" }}>✉ {lead.email}</div>}
              {lead.inn && <div style={{ fontSize: "13px", color: "#888" }}>STIR: {lead.inn}</div>}
              {lead.source && <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>#{lead.source}</div>}
              {lead.assignedTo && (
                <div style={{ fontSize: "12px", color: "#22c55e", marginTop: "4px" }}>
                  👤 {lead.assignedTo.fullName}
                </div>
              )}
              <div style={{ fontSize: "11px", color: "#555", marginTop: "8px" }}>
                {new Date(lead.createdAt).toLocaleDateString("uz-UZ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
