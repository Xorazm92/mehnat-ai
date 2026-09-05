"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react";
import type { BalanceBreakdown } from "@/types";
import type { MonthlyMovement } from "@/components/BalanceOverview";
import { formatNum } from "@/lib/platform/format";

/**
 * TREASURY PANEL — kassa ekranining bosh bloki.
 *
 * `BalanceOverview` nima uchun bu yerda ishlatilmaydi. U TO'G'RI komponent va
 * Boshqaruv paneli hamda Xarajatlar ekranida qoladi — lekin u UMUMIY blok:
 * bitta katta raqam, ikkita rangli quti va ikkita ro'yxat. Kassa moduli esa
 * o'zining BOSH ekrani — bu yerda kerak bo'lgan narsa xulosa emas, balki
 * pozitsiya: pul QANCHA, QAYERDA turibdi, BUGUN va SHU OY qanday harakat
 * qildi, va holat normalmi.
 *
 * Panel uchta qatlamdan iborat va aynan shu tartibda o'qiladi:
 *   1. POZITSIYA  — qoldiq + uning naqd/tranzit taqsimoti (o'lchagich bilan)
 *   2. HARAKAT    — bugun va shu oy: kirim, chiqim, sof oqim
 *   3. MANBALAR   — o'sha harakat qaysi kanallardan yig'ilgan
 *
 * Ogohlantirishlar (manfiy balans, manfiy naqd qoldiq, moliyaviy yordam)
 * `BalanceOverview` dan KO'CHIRILDI — ular biznes qoidasini ko'rsatadi
 * (`lib/balance.ts`, `lib/cashGate.ts`) va yo'qolishi mumkin emas.
 */

const som = (v: number) => formatNum(Math.round(v));

interface Props {
  balance: BalanceBreakdown;
  monthly?: MonthlyMovement;
  /** Bugungi harakat — `getDayMovement`. */
  today?: { income: number; outflow: number };
  /** "2026 Avgust" — oylik raqamlar qaysi oyga tegishli. */
  periodLabel?: string;
}

/** Bitta harakat ko'rsatkichi — yorliq, strelka, raqam. */
function Flow({
  label,
  value,
  dir,
  strong = false,
}: {
  label: string;
  value: number;
  dir: "in" | "out" | "net";
  strong?: boolean;
}) {
  // Nol harakat RANGSIZ va ISHORASIZ: "−0" mantiqan yo'q raqam va ekranda
  // "kichik chiqim bo'lgan" degan yolg'on taassurot beradi. Harakat bo'lmagan
  // kun ko'p uchraydi (oy boshi, dam olish kuni) — u tinch ko'rinishi kerak.
  const zero = value === 0;
  const color = zero
    ? "var(--text-muted)"
    : dir === "in"
      ? "var(--success)"
      : dir === "out"
        ? "var(--danger)"
        : value > 0
          ? "var(--success)"
          : "var(--danger)";
  const sign = zero ? "" : dir === "in" ? "+" : dir === "out" ? "−" : value > 0 ? "+" : "−";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 min-w-0">
        {dir === "in" && <ArrowDownRight size={11} style={{ color }} className="flex-shrink-0" />}
        {dir === "out" && <ArrowUpRight size={11} style={{ color }} className="flex-shrink-0" />}
        {/* `truncate` YO'Q: uch ustunli qatorda 390px da "Bugun kirim"
            "B…" ga aylanib, yorliq ma'nosini butunlay yo'qotardi. O'ralgan
            ikki qatorli yorliq balandlikni oshiradi, lekin o'qiladi. */}
        <span className="stat-label">{label}</span>
      </div>
      <div
        className={`font-mono font-semibold tabular-nums leading-none mt-1 truncate ${
          strong ? "text-lg" : "text-body"
        }`}
        style={{ color, letterSpacing: "-0.02em" }}
      >
        {sign}
        {som(Math.abs(value))}
      </div>
    </div>
  );
}

export default function TreasuryPanel({ balance: b, monthly, today, periodLabel }: Props) {
  const negative = b.balance < 0;
  const transit = b.transitBalance ?? 0;
  const cashOnHand = b.balance - transit;
  const cashNegative = cashOnHand < 0;

  // O'lchagich ulushlari — manfiy qism shkalada ma'noga ega emas, shuning
  // uchun 0 ga qisiladi va holat ogohlantirish orqali aytiladi.
  const total = Math.max(1, Math.max(0, cashOnHand) + Math.max(0, transit));
  const cashPct = (Math.max(0, cashOnHand) / total) * 100;

  const flow = monthly ?? b;
  const flowNote = monthly ? (periodLabel ?? "shu oy") : "boshidan beri";
  const monthNet = flow.income - flow.outflow;
  const todayNet = today ? today.income - today.outflow : 0;

  const status = negative
    ? { text: "Manfiy balans", tone: "var(--danger)", bg: "var(--danger-bg)", bd: "var(--danger-border)", Icon: AlertTriangle }
    : cashNegative
      ? { text: "Tranzit nomutanosib", tone: "var(--warning)", bg: "var(--warning-bg)", bd: "var(--warning-border)", Icon: AlertTriangle }
      : { text: "Holat normal", tone: "var(--success)", bg: "var(--success-bg)", bd: "var(--success-border)", Icon: CheckCircle2 };

  const heroColor = negative ? "var(--danger)" : "var(--text-primary)";

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--card-shadow)",
      }}
      aria-label="Kassa pozitsiyasi"
    >
      {/* ---------- 1. POZITSIYA + HARAKAT ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Qoldiq — panelning yagona urg'usi, shuning uchun boshqa hech qaysi
            raqam bu o'lchamda terilmaydi. */}
        <div
          className="lg:col-span-2 p-5"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--brand-ghost)", color: "var(--brand)" }}
            >
              <Wallet size={18} />
            </div>
            <div className="min-w-0">
              <span className="stat-label">Mavjud kassa balansi</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span
                  className="font-mono font-semibold tabular-nums leading-none"
                  // Qat'iy 2.375rem da "-1,089,862,571" 390px ekranda
                  // kesilardi — kesilgan summa moliyaviy ekranda yolg'on
                  // raqam. `clamp` uni ekran kengligiga bog'laydi.
                  style={{
                    fontSize: "clamp(1.5rem, 6.5vw, 2.375rem)",
                    letterSpacing: "-0.035em",
                    color: heroColor,
                  }}
                >
                  {som(b.balance)}
                </span>
                <span className="text-body font-semibold" style={{ color: "var(--text-muted)" }}>
                  so&apos;m
                </span>
              </div>
            </div>
          </div>

          {/* Taqsimot o'lchagichi — ikkita raqamni yonma-yon yozishdan farqi:
              NISBAT ko'rinadi. "Pul bor" bilan "pul kartalarda muzlab turibdi"
              bir xil balans bergani uchun bu farq muhim. */}
          {transit > 0 && (
            <div className="mt-4">
              {/* Naqd qism manfiy bo'lsa NISBAT chizilmaydi: shkalada manfiy
                  ulush yo'q, va uni 0 ga qisish "hamma pul kartalarda" degan
                  YOLG'ON manzarani beradi. Bunday holatda o'lchagich o'rniga
                  ogohlantirish rangidagi to'liq chiziq turadi — pastdagi ikki
                  raqam va ogohlantirish satri haqiqatni aytadi. */}
              <div className="alloc-meter" role="presentation">
                {cashNegative ? (
                  <span style={{ width: "100%", background: "var(--warning)", opacity: 0.5 }} />
                ) : (
                  <>
                    <span style={{ width: `${cashPct}%`, background: "var(--brand)" }} />
                    <span style={{ width: `${100 - cashPct}%`, background: "var(--accent-purple)" }} />
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                <span className="inline-flex items-center gap-1.5 text-micro" style={{ color: "var(--text-secondary)" }}>
                  <Landmark size={11} style={{ color: cashNegative ? "var(--warning)" : "var(--brand)" }} />
                  Kassada
                  <b className="font-mono tabular-nums" style={{ color: cashNegative ? "var(--warning)" : "var(--text-primary)" }}>
                    {som(cashOnHand)}
                  </b>
                </span>
                <span className="inline-flex items-center gap-1.5 text-micro" style={{ color: "var(--text-secondary)" }}>
                  <CreditCard size={11} style={{ color: "var(--accent-purple)" }} />
                  Kartalarda (tranzit)
                  <b className="font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {som(transit)}
                  </b>
                </span>
              </div>
            </div>
          )}

          <div
            className="inline-flex items-center gap-1.5 mt-4 px-2.5 py-1 rounded-lg text-micro font-semibold"
            style={{ background: status.bg, border: `1px solid ${status.bd}`, color: status.tone }}
          >
            <status.Icon size={12} />
            {status.text}
          </div>
        </div>

        {/* Harakat — bugun va shu oy. Ikki davr YONMA-YON turadi: buxgalter
            "bugun nima bo'ldi" va "oy qanday ketyapti" savollarini birga
            so'raydi, ikki ekranga bo'lish esa taqqoslashni yo'qotadi. */}
        <div
          className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="p-5 sm:col-span-3" style={{ borderLeft: "1px solid var(--rule)" }}>
            <div className="grid grid-cols-3 gap-4">
              <Flow label="Bugun kirim" value={today?.income ?? 0} dir="in" />
              <Flow label="Bugun chiqim" value={today?.outflow ?? 0} dir="out" />
              <Flow label="Bugun sof oqim" value={todayNet} dir="net" strong />
            </div>
            <div className="mt-4 pt-4 grid grid-cols-3 gap-4" style={{ borderTop: "1px solid var(--rule)" }}>
              <Flow label={`Kirim · ${flowNote}`} value={flow.income} dir="in" />
              <Flow label={`Chiqim · ${flowNote}`} value={flow.outflow} dir="out" />
              <Flow label={`Sof oqim · ${flowNote}`} value={monthNet} dir="net" strong />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- OGOHLANTIRISHLAR ---------- */}
      {(negative || cashNegative || (b.loanCashMovement !== undefined && b.loanCashMovement !== 0)) && (
        <div className="px-5 py-3 space-y-2" style={{ borderBottom: "1px solid var(--rule)" }}>
          {negative && (
            <p className="flex items-start gap-2 text-micro font-semibold" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
              Balans manfiy — chiqim kirimdan oshgan. Yangi chiqimlar faqat Admin ruxsati bilan o&apos;tadi.
            </p>
          )}
          {cashNegative && (
            <p className="flex items-start gap-2 text-micro font-semibold" style={{ color: "var(--warning)" }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
              Naqd qoldiq manfiy bo&apos;lishi mumkin emas — tranzit o&apos;tkazmalarini{" "}
              <Link href="/kassa/sverka" className="underline" style={{ color: "var(--warning)" }}>
                sverkada solishtiring
              </Link>
              .
            </p>
          )}
          {/* Moliyaviy yordam (qarz) — `getAvailableBalance` uni jurnaldan
              qo'shadi, ya'ni u Kirim/Chiqim manbalari ro'yxatida ko'rinmaydi.
              Bu qator bo'lmasa balansdagi raqam qayerdan kelgani tushunarsiz
              qolardi. */}
          {b.loanCashMovement !== undefined && b.loanCashMovement !== 0 && (
            <p className="flex items-start gap-2 text-micro" style={{ color: "var(--text-secondary)" }}>
              <Landmark size={13} className="flex-shrink-0 mt-px" style={{ color: "var(--accent-blue)" }} />
              Moliyaviy yordam (qarz) — bank orqali, kassa/shartnoma harakati emas:{" "}
              <b className="font-mono tabular-nums" style={{ color: "var(--accent-blue)" }}>
                {b.loanCashMovement > 0 ? "+" : ""}
                {som(b.loanCashMovement)} so&apos;m
              </b>
            </p>
          )}
        </div>
      )}

      {/* ---------- 3. MANBALAR ---------- */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ background: "var(--bg-sunken)" }}>
        <span className="stat-label" style={{ opacity: 0.85 }}>
          Manbalar · {flowNote}
        </span>
        {[
          { label: "Shartnoma to'lovlari", value: flow.incomePayments, tone: "var(--success)" },
          { label: "Kassa kirimlari", value: flow.incomeKassa, tone: "var(--success)" },
          { label: "Kassa chiqimlari", value: flow.outflowKassa, tone: "var(--danger)" },
          { label: "Oyliklar", value: flow.outflowPayroll, tone: "var(--danger)" },
        ].map((s) => (
          <span key={s.label} className="text-micro" style={{ color: "var(--text-secondary)" }}>
            {s.label}{" "}
            <b className="font-mono tabular-nums" style={{ color: s.tone }}>
              {som(s.value)}
            </b>
          </span>
        ))}
        {monthly && (
          <span className="text-micro ml-auto" style={{ color: "var(--text-muted)" }}>
            Boshidan beri: kirim{" "}
            <b className="font-mono tabular-nums">{som(b.income)}</b> · chiqim{" "}
            <b className="font-mono tabular-nums">{som(b.outflow)}</b>
          </span>
        )}
      </div>
    </section>
  );
}
