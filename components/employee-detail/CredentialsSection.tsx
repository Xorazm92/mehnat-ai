"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Staff } from "@/types";
import { KeyRound, Mail, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";

// Login va parol boshqaruvi — admin xodimga kirish ma'lumotini beradi
export function CredentialsSection({ person, onResetPassword }: { person: Staff; onResetPassword?: (id: string, pw: string) => Promise<void> }) {
  const [mode, setMode] = useState<"idle" | "editing" | "saved">("idle");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const genPw = () => {
    const base = (person.name.split(" ")[0] || "asro").replace(/[^a-zA-Z]/g, "") || "Asro";
    const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
    return `${cap}${Math.floor(1000 + Math.random() * 9000)}!`;
  };
  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const startReset = () => { setPw(genPw()); setMode("editing"); };
  const save = async () => {
    if (!onResetPassword) return;
    if (pw.length < 6) { toast.error("Parol kamida 6 ta belgidan iborat bo'lishi kerak"); return; }
    setSaving(true);
    try {
      await onResetPassword(person.id, pw);
      setMode("saved");
      toast.success("Parol o'rnatildi — xodimga bering");
    } catch (e) {
      toast.error(friendlyError(e, "Xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={15} style={{ color: "var(--accent-blue)" }} />
        <span className="text-meta font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>Login va parol</span>
        <span className="text-micro font-bold" style={{ color: "var(--text-muted)" }}>· xodim shu bilan kiradi</span>
        <div className="flex-1 h-px ml-1" style={{ background: "var(--card-border)" }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {/* Login (email) */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--card-border)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}><Mail size={15} /></div>
          <div className="text-micro font-bold uppercase tracking-widest w-24 shrink-0" style={{ color: "var(--text-muted)" }}>Login</div>
          <div className="text-body font-bold font-mono truncate flex-1" style={{ color: "var(--text)" }}>{person.email || "—"}</div>
          {person.email && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy(person.email!, "login")}
              title="Nusxa olish"
              aria-label="Loginni nusxalash"
              icon={copied === "login" ? <Check size={14} /> : <Copy size={14} />}
              className="shrink-0 !px-2"
            />
          )}
        </div>

        {/* Parol */}
        <div className="px-4 py-3">
          {mode === "idle" && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}><KeyRound size={15} /></div>
              <div className="text-micro font-bold uppercase tracking-widest flex-1" style={{ color: "var(--text-muted)" }}>Parol · ••••••••</div>
              {onResetPassword && (
                <Button variant="secondary" size="sm" onClick={startReset} className="shrink-0">
                  Parol o&apos;rnatish
                </Button>
              )}
            </div>
          )}

          {mode === "editing" && (
            <div className="space-y-2.5">
              <label className="text-micro font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Yangi parol</label>
              <div className="flex items-center gap-2">
                <input value={pw} onChange={(e) => setPw(e.target.value)} className="erp-input font-mono tracking-wider" placeholder="Kamida 6 ta belgi" />
                <Button
                  variant="secondary"
                  onClick={() => setPw(genPw())}
                  title="Yangi parol taklif qilish"
                  aria-label="Yangi parol taklif qilish"
                  icon={<RefreshCw size={15} />}
                  className="shrink-0"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setMode("idle")}>Bekor</Button>
                <Button variant="primary" size="md" onClick={save} loading={saving} icon={<Check size={14} />}>
                  Saqlash
                </Button>
              </div>
            </div>
          )}

          {mode === "saved" && (
            <div className="rounded-lg p-3" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
              <div className="text-micro font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--success)" }}>Parol o&apos;rnatildi — xodimga bering</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono font-bold px-3 py-2 rounded-lg" style={{ background: "var(--card-bg)", color: "var(--text)", border: "1px solid var(--card-border)" }}>{pw}</code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copy(pw, "pw")}
                  icon={copied === "pw" ? <Check size={13} /> : <Copy size={13} />}
                  className="shrink-0"
                >
                  {copied === "pw" ? "Olindi" : "Nusxa"}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMode("idle")} className="mt-2 !px-0">Yopish</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
