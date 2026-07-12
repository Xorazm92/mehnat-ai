"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Bot, User as UserIcon, Loader2 } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

const WELCOME =
  "Assalomu alaykum! Men ASRO moliyachi yordamchisiman. Soliqlar, oylik, KPI, hisobotlar va moliyaviy savollaringizga yordam beraman. Nima bilan boshlaymiz?";

const SUGGESTIONS = [
  "Bu oy oylik fondi qancha?",
  "QQS qanday hisoblanadi?",
  "Muddati o'tgan hisobotlar",
  "Aylanmadan soliq stavkasi",
];

// ⚠️ UI SHELL — javoblar hozircha namunaviy.
// Real AI'ni ulash uchun shu funksiyani `/api/assistant` (Claude) ga POST qiladigan
// qilib almashtiring. Boshqa hech narsani o'zgartirish shart emas.
async function fetchAssistantReply(userText: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 650)); // "yozmoqda" taassuroti
  const t = userText.toLowerCase();
  let body: string;
  if (t.includes("qqs") || t.includes("nds")) {
    body = "QQS (NDS) — qo'shilgan qiymat solig'i, standart stavka 12%. Masalan 50 000 000 so'm aylanmada QQS ≈ 6 000 000 so'm.";
  } else if (t.includes("aylanma")) {
    body = "Aylanmadan soliq (soddalashtirilgan) odatda 4% stavkada hisoblanadi (faoliyat turiga qarab farq qilishi mumkin).";
  } else if (t.includes("oylik") || t.includes("maosh") || t.includes("fond")) {
    body = "Oylik fondi = firmalar bo'yicha rol ulushlari (buxgalter/bosh buxgalter/nazoratchi/bank) yig'indisi. Aniq raqamni Oylik bo'limidagi 'Jami to'lov' ko'rsatadi.";
  } else if (t.includes("kpi")) {
    body = "KPI ballari nazoratchi/bosh buxgalter tasdig'iga qarab bonus yoki jarimaga aylanadi. Har bir xodim ballarini KPI bo'limida ko'rish mumkin.";
  } else if (t.includes("hisobot") || t.includes("muddat")) {
    body = "Muddati o'tgan hisobotlarni Hisobotlar bo'limidagi 'Amallar matritsasi'dan ko'rasiz — qizil (−) belgilar bajarilmagan hisobotlar.";
  } else {
    body = "Savolingizni tushundim. To'liq javob uchun real AI hali ulanmagan.";
  }
  return body + "\n\n🔌 Eslatma: bu namunaviy javob — haqiqiy Claude AI keyinroq ulanadi.";
}

export default function FinanceAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setTyping(true);
    try {
      const reply = await fetchAssistantReply(q);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      {/* Trigger button (topbar) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-white text-[13px] font-semibold transition-all shadow-sm shrink-0"
        style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
        title="AI moliyachi yordamchi"
      >
        <Sparkles size={15} />
        <span className="hidden lg:inline">AI yordamchi</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="fixed right-0 top-0 h-full w-full max-w-[420px] z-[200] flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
            style={{ background: "var(--card-bg)", borderLeft: "1px solid var(--card-border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--card-border)", background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(37,99,235,0.12))" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}>
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="text-[14px] font-black" style={{ color: "var(--text-primary)" }}>Moliyachi AI</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Moliyaviy yordamchi · beta</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors" style={{ color: "var(--text-muted)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--text-muted)"; }}>
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: m.role === "user" ? "var(--accent-blue)" : "linear-gradient(135deg, #7C3AED, #2563EB)" }}>
                    {m.role === "user" ? <UserIcon size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className="max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap"
                    style={m.role === "user"
                      ? { background: "var(--accent-blue)", color: "#fff", borderTopRightRadius: 4 }
                      : { background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--card-border)", borderTopLeftRadius: 4 }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}><Bot size={14} /></div>
                  <div className="px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", borderTopLeftRadius: 4 }}>
                    <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>yozmoqda…</span>
                  </div>
                </div>
              )}

              {/* Taklif qilingan savollar (faqat boshda) */}
              {messages.length === 1 && !typing && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; e.currentTarget.style.color = "var(--accent-blue)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
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
                  className="flex-1 px-4 py-2.5 rounded-xl text-[13px] outline-none transition-all"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--input-focus-border)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--input-border)"; }}
                />
                <button type="submit" disabled={!input.trim() || typing} className="w-11 h-11 flex items-center justify-center rounded-xl text-white shrink-0 transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}>
                  <Send size={17} />
                </button>
              </form>
              <p className="text-[9px] text-center mt-2" style={{ color: "var(--text-muted)" }}>Moliyachi AI xatolarga yo&apos;l qo&apos;yishi mumkin · beta</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
