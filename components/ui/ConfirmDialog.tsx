"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * CONFIRM — `window.confirm` o'rnini bosuvchi dialog.
 *
 * Loyihada 15 ta `confirm(` bor va ULARNING HAMMASI eng qaytarib bo'lmaydigan
 * amallarni himoya qiladi: matritsadagi butun ustunni davr bo'yicha o'chirish,
 * davrni qulflash, firmani o'chirish. Brauzerning tizim oynasi — vebdagi eng
 * kuchsiz tasdiqlash vositasi: uslublab bo'lmaydi, Enter bilan tasdiqlanadi va
 * NIMA yo'q qilinayotganini (nechta katak, qaysi davr) ayta olmaydi.
 *
 * Bu yerda uchta qatlam bor:
 *   1. Aniq ko'lam — `description` orqali nima o'zgarishini yozish mumkin.
 *   2. `confirmText` — xavfli amallar uchun nomni qo'lda yozdirish
 *      (GitHub repo o'chirishdagi kabi).
 *   3. Amal `async` bo'lsa, tugma yuklanish holatini o'zi boshqaradi.
 *
 * Foydalanish:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "...", tone: "danger" })) doIt();
 */

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** Berilsa — foydalanuvchi tasdiqlash uchun shu matnni aynan yozishi kerak */
  confirmText?: string;
  /**
   * Berilsa — dialog sabab so'raydigan matn maydonini ko'rsatadi va
   * `usePrompt()` orqali kiritilgan matnni qaytaradi. Bu `window.prompt` ni
   * almashtiradi: loyihada rad etish sabablari — ya'ni AUDITGA tushadigan
   * biznes ma'lumoti — brauzerning tizim oynasi orqali olinardi, u yerda
   * validatsiya ham, uzunlik chegarasi ham, uslub ham yo'q.
   */
  reasonLabel?: string;
  reasonPlaceholder?: string;
}

interface ConfirmResult { ok: boolean; reason: string }
type Resolver = (value: ConfirmResult) => void;

interface ConfirmApi {
  /** Natija sababi bilan birga qaytadi — render paytida ref o'zgartirmaslik uchun. */
  request: (opts: ConfirmOptions) => Promise<ConfirmResult>;
}

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const resolverRef = useRef<Resolver | null>(null);

  const request = useCallback((next: ConfirmOptions) => {
    setTyped("");
    setReason("");
    setOpts(next);
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean, withReason: string) => {
    resolverRef.current?.({ ok, reason: withReason });
    resolverRef.current = null;
    setOpts(null);
    setTyped("");
    setReason("");
  }, []);

  const tone = opts?.tone ?? "default";
  const needsTyping = Boolean(opts?.confirmText);
  const needsReason = Boolean(opts?.reasonLabel);
  const canConfirm =
    (!needsTyping || typed.trim() === opts?.confirmText) &&
    (!needsReason || reason.trim().length > 0);

  const value = useMemo<ConfirmApi>(() => ({ request }), [request]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(opts)}
        onClose={() => settle(false, "")}
        size="sm"
        showClose={false}
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false, "")}>
              {opts?.cancelLabel ?? "Bekor qilish"}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={!canConfirm}
              onClick={() => settle(true, reason)}
            >
              {opts?.confirmLabel ?? "Tasdiqlash"}
            </Button>
          </>
        }
      >
        <div className="flex gap-4">
          {tone === "danger" && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
            >
              <AlertTriangle size={19} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-snug" style={{ color: "var(--text-primary)" }}>
              {opts?.title}
            </h2>
            {opts?.description && (
              <div className="text-body mt-2" style={{ color: "var(--text-secondary)" }}>
                {opts.description}
              </div>
            )}
            {needsReason && (
              <label className="block mt-4">
                <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {opts?.reasonLabel}
                </span>
                <textarea
                  className="erp-input mt-2 w-full resize-y"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={opts?.reasonPlaceholder}
                  maxLength={500}
                  autoFocus
                />
                <span className="text-micro block mt-1 text-right" style={{ color: "var(--text-muted)" }}>
                  {reason.length}/500
                </span>
              </label>
            )}
            {needsTyping && (
              <label className="block mt-4">
                <span className="text-meta font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Tasdiqlash uchun <code style={{ color: "var(--danger)" }}>{opts?.confirmText}</code> deb yozing
                </span>
                <input
                  className="erp-input mt-2"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
            )}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Provider topilmasa ataylab `window.confirm` ga qaytadi: migratsiya davomida
 * hali provider ostiga kirmagan daraxtlar ham ishlab tursin, jim sinmasin.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return useCallback(
    async (opts: ConfirmOptions): Promise<boolean> => {
      if (!ctx) return typeof window === "undefined" ? false : window.confirm(opts.title);
      return (await ctx.request(opts)).ok;
    },
    [ctx]
  );
}

/**
 * Sabab so'rovchi dialog — `window.prompt` o'rniga.
 * Bekor qilinsa `null`, aks holda kiritilgan matn qaytadi.
 */
export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  return useCallback(
    async (opts: ConfirmOptions & { reasonLabel: string }): Promise<string | null> => {
      if (!ctx) return typeof window === "undefined" ? null : window.prompt(opts.title);
      const { ok, reason } = await ctx.request(opts);
      return ok ? reason.trim() : null;
    },
    [ctx]
  );
}

export default ConfirmProvider;
