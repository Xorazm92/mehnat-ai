"use client";

// =====================================================
// DIRECTOR COCKPIT — bitta ekran, beshta blok
// =====================================================
// Qoida: har blok SAVOLGA javob beradi, ma'lumot ko'rsatmaydi.
//   "Bugun nima yonyapti?" · "Qaysi mijoz xavf ostida va NEGA?" ·
//   "Kim ko'milgan?" · "Kim muddatni bajarmayapti?"
//
// Har raqamning yonida uning sababi turadi (Konstitutsiya, 7-modda). Ball
// `null` bo'lsa "—" ko'rsatiladi, 0 EMAS: o'lchanmagan narsani "a'lo" deb
// ko'rsatish — aynan e'tibor kerak bo'lgan firmani yashirish.
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Users, ShieldCheck, ArrowRight } from "lucide-react";
import { formatUzDayShort, formatNum } from "@/lib/format";
import type { TimelineBucket, TimelineItem } from "@/server/timeline";
import type { CompanyTwin, StaffCapacity } from "@/server/twin";
import type { ConcernLevel, Score } from "@/lib/engines/analytics/twin";

const TONE: Record<ConcernLevel, { fg: string; bg: string }> = {
  unknown: { fg: "var(--text-muted)", bg: "var(--surface-2)" },
  low: { fg: "var(--success)", bg: "var(--success-bg)" },
  medium: { fg: "var(--warning-dark)", bg: "var(--warning-bg)" },
  high: { fg: "var(--danger-dark)", bg: "var(--danger-bg)" },
};

function ScoreChip({ score, suffix = "%" }: { score: Score | null; suffix?: string }) {
  const level: ConcernLevel = score?.level ?? "unknown";
  const tone = TONE[level];
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: tone.bg, color: tone.fg }}
      title={score?.reasons.map((r) => r.detail).join(" · ") || "o'lchanmagan"}
    >
      {score?.value == null ? "—" : `${formatNum(score.value)}${suffix}`}
    </span>
  );
}

function Block({ title, icon, hint, children }: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--rule)" }}>
      <header className="flex items-center gap-2 mb-3">
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {hint && <span className="text-micro ml-auto" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </header>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-6 text-center text-meta" style={{ color: "var(--text-muted)" }}>{children}</p>
);

function ItemRow({ item }: { item: TimelineItem }) {
  return (
    <Link
      href={`/deadlines?company=${item.companyId}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:opacity-80"
      style={{ borderBottom: "1px solid var(--rule)" }}
    >
      <span className="text-micro tabular-nums w-14 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {formatUzDayShort(item.dueAt)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {item.companyName}
        </span>
        <span className="block text-micro truncate" style={{ color: "var(--text-muted)" }}>
          {item.title}
          {item.responsibleName ? ` · ${item.responsibleName}` : ""}
        </span>
      </span>
    </Link>
  );
}

export default function CockpitClient({ period, timeline, twins, capacity }: {
  period: string;
  timeline: TimelineBucket[];
  twins: CompanyTwin[];
  capacity: StaffCapacity[];
}) {
  const [horizon, setHorizon] = useState<string>("overdue");
  const active = timeline.find((b) => b.key === horizon) ?? timeline[0];

  // Xavf bo'yicha saralash: o'lchanmaganlar (null) OXIRIDA emas, alohida —
  // ular "xavfsiz" degani emas, "hali ma'lum emas" degani.
  const ranked = [...twins].sort((a, b) => (b.risk.value ?? -1) - (a.risk.value ?? -1));
  const atRisk = ranked.filter((t) => t.risk.value != null && t.risk.level !== "low").slice(0, 8);
  const unmeasured = ranked.filter((t) => t.risk.value == null).length;
  const worstCompliance = [...twins]
    .filter((t) => t.compliance.value != null && t.compliance.level !== "low")
    .sort((a, b) => (a.compliance.value ?? 0) - (b.compliance.value ?? 0))
    .slice(0, 6);
  const overloaded = capacity.filter((c) => (c.score.value ?? 0) > 110);
  const idle = capacity.filter((c) => (c.score.value ?? 0) < 60);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Kabina</h1>
        <span className="text-meta" style={{ color: "var(--text-muted)" }}>{period} · {twins.length} firma</span>
      </div>

      {/* 1 — UFQ: oynalar kesishmaydi, ya'ni sanoqlarni qo'shsa jami chiqadi. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {timeline.map((b) => {
          const on = b.key === horizon;
          const danger = b.key === "overdue" && b.count > 0;
          return (
            <button
              key={b.key}
              onClick={() => setHorizon(b.key)}
              className="rounded-xl px-3 py-2.5 text-left transition"
              style={{
                background: on ? "var(--accent-bg)" : "var(--surface-1)",
                border: `1px solid ${on ? "var(--accent)" : "var(--rule)"}`,
              }}
            >
              <div className="text-micro" style={{ color: "var(--text-muted)" }}>{b.label}</div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: danger ? "var(--danger-dark)" : "var(--text-primary)" }}
              >
                {formatNum(b.count)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 2 — Tanlangan ufqning ro'yxati. */}
        <Block
          title={`${active.label} — ${formatNum(active.count)} ta`}
          icon={<Clock size={14} />}
          hint={active.items.length < active.count ? `birinchi ${active.items.length} tasi` : undefined}
        >
          {active.items.length === 0 ? (
            <Empty>
              {active.count > 0
                ? "Bu ufq uchun ro'yxat yuklanmaydi — faqat sanoq."
                : "Bu oynada ish yo'q."}
            </Empty>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {active.items.map((it) => <ItemRow key={it.id} item={it} />)}
            </div>
          )}
        </Block>

        {/* 3 — Xavf ostidagi mijozlar, SABABI bilan. */}
        <Block
          title="Xavf ostidagi mijozlar"
          icon={<AlertTriangle size={14} />}
          hint={unmeasured > 0 ? `${unmeasured} ta o'lchanmagan` : undefined}
        >
          {atRisk.length === 0 ? (
            <Empty>Xavf darajasi yuqori firma yo&apos;q.</Empty>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {atRisk.map((t) => (
                <Link
                  key={t.companyId}
                  href={`/organizations?company=${t.companyId}`}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:opacity-80"
                  style={{ borderBottom: "1px solid var(--rule)" }}
                >
                  <ScoreChip score={t.risk} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {t.name}
                    </span>
                    {/* Raqam yolg'iz turmaydi — nimadan kelib chiqqani shu yerda. */}
                    <span className="block text-micro" style={{ color: "var(--text-muted)" }}>
                      {t.risk.reasons.map((r) => r.detail).join(" · ")}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        {/* 4 — Kim ko'milgan, kim bo'sh. */}
        <Block
          title="Yuklama"
          icon={<Users size={14} />}
          hint={capacity.some((c) => c.estimated) ? "normativ taxminiy" : undefined}
        >
          {capacity.length === 0 ? (
            <Empty>Biriktirilgan ochiq ish yo&apos;q.</Empty>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {capacity.map((c) => (
                <div
                  key={c.userId}
                  className="flex items-center gap-3 px-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--rule)" }}
                >
                  <ScoreChip score={c.score} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {c.fullName}
                    </span>
                    <span className="block text-micro" style={{ color: "var(--text-muted)" }}>
                      {c.score.reasons[0]?.detail}
                      {c.estimated ? " · taxminiy" : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {(overloaded.length > 0 || idle.length > 0) && (
            <p className="mt-2 text-micro" style={{ color: "var(--text-muted)" }}>
              {overloaded.length} ta sig&apos;imdan oshgan · {idle.length} ta zaxirasi bor
            </p>
          )}
        </Block>

        {/* 5 — Muvofiqlik: kim muddatni bajarmayapti. */}
        <Block title="Muvofiqlik pastligi" icon={<ShieldCheck size={14} />}>
          {worstCompliance.length === 0 ? (
            <Empty>Muddat bo&apos;yicha muammoli firma yo&apos;q.</Empty>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {worstCompliance.map((t) => (
                <div
                  key={t.companyId}
                  className="flex items-center gap-3 px-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--rule)" }}
                >
                  <ScoreChip score={t.compliance} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {t.name}
                    </span>
                    <span className="block text-micro" style={{ color: "var(--text-muted)" }}>
                      {t.compliance.reasons.map((r) => r.detail).join(" · ")}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/deadlines"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Muddatlarga o&apos;tish <ArrowRight size={12} />
          </Link>
        </Block>
      </div>
    </div>
  );
}
