"use client";

/**
 * KREDENSIAL KARTASI — bitta xizmatning login/paroli, joyida tahrirlanadi.
 *
 * Nega ajratildi: "Loginlar" yorlig'ida Soliq.uz va Bank-Klient bloklari
 * ~90 qatordan IKKI MARTA, deyarli bir xil yozilgan edi. Ular bilan birga
 * olti dona holat (`isEditingMainLogin`, `tempLogin`, `tempPassword` va
 * ularning bank nusxalari) ota-komponentda yashardi. Endi holat kartaning
 * O'ZIDA — panel ularni umuman bilmaydi.
 *
 * Takrorlanish shunchaki uzunlik masalasi emas edi: ikki blok VAQT O'TIB
 * AJRALGAN — Soliq.uz login maydoni `uppercase`, bankniki esa yo'q; farq
 * ataylabmi yoki nusxa ko'chirish qoldig'imi — kodni o'qib bilib bo'lmasdi.
 * Endi u aniq `uppercaseLogin` bayrog'i.
 *
 * DIQQAT — kredensial ASRO paroli emas, mijozning TASHQI xizmat (soliq.uz,
 * bank) hisobidir. Shu sababli ko'rsatish/yashirish har karta uchun alohida
 * va sukut bo'yicha yopiq.
 */
import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { friendlyError } from "@/lib/actionError";

export interface CredentialCardProps {
  title: string;
  icon: React.ReactNode;
  login: string;
  password: string;
  /**
   * Saqlash. XATO BERSA — `throw` qilsin: karta tahrir rejimida QOLADI va
   * xatoni ko'rsatadi. Ilgari xato faqat `console.warn` ga tushardi va panel
   * saqlangandek yopilardi — xodim parolni yozdim deb o'ylab ketardi.
   */
  onSave: (login: string, password: string) => Promise<void>;
  /** Soliq.uz login'i katta harfda yoziladi; bankniki — yo'q. */
  uppercaseLogin?: boolean;
}

const FIELD_CLASS =
  "w-full bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] font-mono text-meta outline-none focus:border-[var(--accent-blue)] transition-colors";

export function CredentialCard({
  title,
  icon,
  login,
  password,
  onSave,
  uppercaseLogin = false,
}: CredentialCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [draftLogin, setDraftLogin] = useState(login);
  const [draftPassword, setDraftPassword] = useState(password);

  const loginId = `cred-login-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const passId = `cred-pass-${title.replace(/\W+/g, "-").toLowerCase()}`;

  const startEdit = () => {
    setDraftLogin(login);
    setDraftPassword(password);
    setEditing(true);
  };

  const cancel = () => {
    setDraftLogin(login);
    setDraftPassword(password);
    setEditing(false);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draftLogin, draftPassword);
      setEditing(false);
    } catch (e) {
      toast.error(friendlyError(e) || `${title}: saqlab bo'lmadi`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-[var(--card-bg)] p-4 rounded-lg border border-[var(--card-border)] shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[var(--text-muted)] shrink-0">{icon}</span>
          <h3 className="text-micro font-bold text-[var(--text)] uppercase tracking-widest truncate">
            {title}
          </h3>
        </div>
        {editing ? (
          <div className="flex gap-1.5 shrink-0">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              Bekor qilish
            </Button>
            <Button variant="success" size="sm" onClick={submit} loading={saving}>
              Saqlash
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={startEdit} className="shrink-0">
            Tahrirlash
          </Button>
        )}
      </div>

      {/* Telefonda ikki ustun 160px gacha siqilardi va mono shriftdagi login
          kesilib ketardi; endi tor ekranda ustma-ust. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={editing ? loginId : undefined}
            className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest"
          >
            Login
          </label>
          {editing ? (
            <input
              id={loginId}
              type="text"
              className={`${FIELD_CLASS} ${uppercaseLogin ? "uppercase" : ""}`}
              value={draftLogin}
              onChange={(e) => setDraftLogin(e.target.value)}
            />
          ) : (
            <p
              className={`text-meta font-mono font-bold text-[var(--text)] bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] transition-colors break-all ${uppercaseLogin ? "uppercase" : ""}`}
            >
              {login || "—"}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={editing ? passId : undefined}
            className="text-micro font-bold text-[var(--text-muted)] uppercase tracking-widest"
          >
            Parol
          </label>
          {editing ? (
            <input
              id={passId}
              type="text"
              className={FIELD_CLASS}
              value={draftPassword}
              onChange={(e) => setDraftPassword(e.target.value)}
            />
          ) : (
            <div className="flex items-center justify-between gap-2 bg-[var(--input-bg)] p-1.5 rounded-lg border border-[var(--card-border)] transition-colors">
              <p className="text-meta font-mono font-bold text-[var(--text)] tracking-widest leading-none break-all">
                {reveal ? password || "—" : "••••••••"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReveal((v) => !v)}
                aria-pressed={reveal}
                aria-label={reveal ? `${title} parolini yashirish` : `${title} parolini ko'rsatish`}
                icon={reveal ? <EyeOff size={12} /> : <Eye size={12} />}
                className="!px-2 !py-1 shrink-0"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default CredentialCard;
