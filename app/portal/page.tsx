"use client";

import React, { useState } from "react";
import { formatNum } from "@/lib/platform/format";

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
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--card-border)",
                background: "var(--input-bg)",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "12px",
                background: "var(--brand)",
                color: "var(--on-brand)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Kirish
            </button>
            {error && <p style={{ color: "var(--danger)", fontSize: "14px" }}>{error}</p>}
          </form>
        ) : (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "24px" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>{data.name}</h2>
            <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>Balans:</p>
            {/* `toLocaleString()` server va brauzerda turlicha teradi (SSR mos
                kelmasligi) va ajratgichi brauzer tiliga bog'liq bo'lardi —
                loyihada raqam har doim `formatNum` orqali chiqadi. */}
            <p style={{ fontSize: "32px", fontWeight: "bold", color: data.balance < 0 ? "var(--danger)" : "var(--success)" }}>
              {formatNum(data.balance)} so&apos;m
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
