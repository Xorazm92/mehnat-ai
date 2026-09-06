"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Bot, User as UserIcon, Loader2 } from "lucide-react";
import { askFinanceAssistant } from "@/server/assistant";
import type { AiClaim } from "@/lib/ai/claim";
import type { CreatedRecommendation } from "@/lib/ai/tools";
import RecommendationList from "@/components/assistant/RecommendationList";
import { formatNum } from "@/lib/platform/format";
import { DrawerLayer } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
  /**
   * Javobdagi raqamlarning pasporti (M5.1/M5.2).
   *
   * Matn ostida ALOHIDA ko'rsatiladi, matn ichidan qidirilmaydi: Modda 7
   * bo'yicha raqam manbasi bilan birga turishi kerak, va model matnni
   * har safar boshqacha yozadi — ro'yxat esa barqaror.
   */
  claims?: AiClaim[];
  /**
   * Shu javob davomida YARATILGAN tavsiyalar (M5.3).
   *
   * Da'vodan farqi: da'vo — o'qilgan raqam, tavsiya esa navbatga qo'yilgan
   * qaror. Ikkalasi bir ro'yxatga qo'shilsa "18 500 000 so'm" bilan
   * "mas'ulni almashtirish" bir xil og'irlikda ko'rinardi.
   */
  recommendations?: CreatedRecommendation[];
}

/** Da'vo raqami — birlikka qarab. `formatNum` faqat pulda ma'noli. */
function claimValue(c: AiClaim): string {
  if (c.unit === "so'm") return `${formatNum(Math.round(c.value))} so'm`;
  if (c.unit === "foiz") return `${c.value}%`;
  return `${formatNum(c.value)} ${c.unit}`;
}

/**
 * Da'vo darajasi — vakolat (`confidence`) bo'yicha rang.
 *
 * `severity` da'voning O'ZIDA yo'q (u ko'rsatkich xossasi), shuning uchun
 * bu yerda rang XAVFNI emas, ISHONCHNI bildiradi: operator kiritgan
 * qiymat (0.4) sariq, tizim hisobi (0.7) va vakolatli manba (1.0) neytral.
 * Xavf darajasi matnda — modelning o'z gapida.
 */
function claimTone(c: AiClaim): { bg: string; fg: string } {
  return c.confidence < 0.7
    ? { bg: "var(--warning-bg)", fg: "var(--warning)" }
    : { bg: "var(--input-bg)", fg: "var(--text-secondary)" };
}

const WELCOME =
  "Assalomu alaykum! Men ASRO moliyachi yordamchisiman. Soliqlar, oylik, KPI, hisobotlar va moliyaviy savollaringizga yordam beraman. Nima bilan boshlaymiz?";

const SUGGESTIONS = [
  "Bu oy oylik fondi qancha?",
  "QQS qanday hisoblanadi?",
  "Muddati o'tgan hisobotlar",
  "Aylanmadan soliq stavkasi",
];

export default function FinanceAssistant() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Yon panel — fokus tuzog'i, Escape va yopilganda fokusni tugmaga qaytarish.
  // Ilgari panel ekranni to'sardi, lekin Tab bosilsa ortidagi ko'rinmaydigan
  // sahifaga o'tib ketardi.
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    // Prior turns (before this question) become the model's conversation context.
    const history = messages.slice(-8);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setTyping(true);
    try {
      const res = await askFinanceAssistant(q, history);
      // Raqamlar matndan AJRATIB keladi (`claims`) va shundayligicha
      // saqlanadi — pastda manbasi bilan chiziladi.
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.text, claims: res.claims, recommendations: res.recommendations },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Kechirasiz, xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring." },
      ]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      {/* Trigger button (topbar) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-white text-body font-semibold transition-all shadow-sm shrink-0"
        style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--brand))" }}
        title="AI moliyachi yordamchi"
      >
        <Sparkles size={15} />
        <span className="hidden lg:inline">AI yordamchi</span>
      </button>

      {/*
        Qatlam `DrawerLayer` da. Ilgari fon `z-[110]` (= `--z-panel`), panel
        esa `z-[200]` (= `--z-popover`) edi — ya'ni yordamchi paneli toast va
        popoverlar bilan bir qavatda turardi va ular ustidan chizilardi.
      */}
      {mounted && (
        <DrawerLayer
          open={open}
          onClose={() => setOpen(false)}
          label="Moliya yordamchisi"
          widthClass="max-w-[420px]"
          className="shadow-2xl"
          style={{ background: "var(--card-bg)", borderLeft: "1px solid var(--card-border)" }}
        >
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--card-border)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 12%, transparent), color-mix(in srgb, var(--brand) 12%, transparent))" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--brand))" }}>
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Moliyachi AI</h3>
                  <p className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Moliyaviy yordamchi · beta</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="icon-btn-sm transition-colors icon-btn-danger" style={{ color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: m.role === "user" ? "var(--accent-blue)" : "linear-gradient(135deg, var(--accent-purple), var(--brand))" }}>
                    {m.role === "user" ? <UserIcon size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className="max-w-[78%] px-3.5 py-2.5 rounded-xl text-body leading-relaxed whitespace-pre-wrap"
                    style={m.role === "user"
                      ? { background: "var(--accent-blue)", color: "#fff", borderTopRightRadius: 4 }
                      : { background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--card-border)", borderTopLeftRadius: 4 }}
                  >
                    {m.content}

                    {/* MANBALI RAQAMLAR. Bo'sh `claims` — raqamsiz javob
                        (bilim bazasidan tushuntirish); u holda hech narsa
                        chizilmaydi, "0 ta manba" degan qator ham yo'q. */}
                    {m.role === "assistant" && m.claims && m.claims.length > 0 && (
                      <div className="mt-2.5 pt-2 space-y-1" style={{ borderTop: "1px solid var(--card-border)" }}>
                        {m.claims.map((c, ci) => {
                          const tone = claimTone(c);
                          return (
                            <div
                              key={ci}
                              className="flex items-baseline gap-2 px-2 py-1 rounded-lg"
                              style={{ background: tone.bg }}
                              title={`${c.sourceQuery} · ${c.asOf}`}
                            >
                              <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                                {claimValue(c)}
                              </span>
                              <span className="text-micro truncate" style={{ color: tone.fg }}>
                                {c.label} · {c.sourceTool}
                                {c.conditions?.length ? ` · ${c.conditions.join(", ")}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {m.role === "assistant" && m.recommendations && (
                      <RecommendationList items={m.recommendations} />
                    )}
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--brand))" }}><Bot size={14} /></div>
                  <div className="px-3.5 py-2.5 rounded-xl flex items-center gap-1.5" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", borderTopLeftRadius: 4 }}>
                    <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>yozmoqda…</span>
                  </div>
                </div>
              )}

              {/* Taklif qilingan savollar (faqat boshda) */}
              {messages.length === 1 && !typing && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-meta font-semibold px-3 py-1.5 rounded-full transition-colors icon-btn-accent" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--card-border)" }}>
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Savolingizni yozing…"
                  className="flex-1 px-4 py-2.5 rounded-xl text-body outline-none transition-all"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--input-focus-border)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--input-border)"; }}
                />
                <button type="submit" disabled={!input.trim() || typing} className="w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0 transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent-purple), var(--brand))" }}>
                  <Send size={17} />
                </button>
              </form>
              <p className="text-micro text-center mt-2" style={{ color: "var(--text-muted)" }}>Moliyachi AI xatolarga yo&apos;l qo&apos;yishi mumkin · beta</p>
            </div>
          </>
        </DrawerLayer>
      )}
    </>
  );
}
