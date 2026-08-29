"use client";

import { useState } from "react";

export default function PortalPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<null | { name: string; balance: number }>(null);
  const [error, setError] = useState("");

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    const r = await fetch(`/api/portal/${encodeURIComponent(token.trim())}`);
    if (!r.ok) { setError("Havola noto'g'ri yoki muddati o'tgan"); setData(null); return; }
    const d = await r.json();
    setData(d);
    setError("");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "24px", textAlign: "center" }}>Mijoz portali</h1>
        {!data ? (
          <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Havola yoki kod"
              style={{ padding: "12px", borderRadius: "8px", border: "1px solid #333", background: "#111", color: "#fff" }}
            />
            <button type="submit" style={{ padding: "12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
              Kirish
            </button>
            {error && <p style={{ color: "#ef4444", fontSize: "14px" }}>{error}</p>}
          </form>
        ) : (
          <div style={{ background: "#1a1a2e", borderRadius: "12px", padding: "24px" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>{data.name}</h2>
            <p style={{ fontSize: "14px", color: "#888" }}>Balans:</p>
            <p style={{ fontSize: "32px", fontWeight: "bold", color: data.balance < 0 ? "#ef4444" : "#22c55e" }}>
              {data.balance.toLocaleString()} so'm
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
