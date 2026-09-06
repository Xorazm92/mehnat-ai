"use client";
import { friendlyError } from "@/lib/actionError";

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
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Clock, Users, ShieldCheck, ArrowRight, RefreshCw, Check, UserCog } from "lucide-react";
import { persistRiskLevels } from "@/server/twin";
import {
  approveExpenseFromCockpit,
  reassignObligationFromCockpit,
  getReassignCandidates,
} from "@/server/directorCockpit";
import { recordCockpitVisit } from "@/server/analytics";
import { Button } from "@/components/ui/Button";
import { Badge, IdentityCell, Modal, Select, type BadgeTone } from "@/components/ui";
import { formatUzDayShort, formatNum } from "@/lib/platform/format";
import type { TimelineBucket, TimelineItem } from "@/server/timeline";
import type { CompanyTwin, StaffCapacity } from "@/lib/domains/accounting/twinCompute";
import type { ConcernLevel, Score } from "@/lib/engines/analytics/twin";
import type { DirectorCockpitFinance } from "@/lib/domains/accounting/directorCockpitFinance";

const LEVEL_TONE: Record<ConcernLevel, BadgeTone> = {
  unknown: "neutral",
  low: "success",
  medium: "warning",
  high: "danger",
};

/**
 * Ball nishoni.
 *
 * Rang — YAGONA belgi emas: qiymat matn sifatida turadi va `ariaLabel` uni
 * nomi bilan aytadi ("Xavf 42 foiz"). Aks holda ekran o'quvchi "42" deb
 * o'qirdi — nimaning 42 ekani rangda qolib ketardi.
 *
 * `—` ekran o'quvchida "tire" bo'lib chiqadi, shuning uchun `ariaLabel`
 * o'rniga "o'lchanmagan" o'qiladi.
 */
function ScoreChip({ label, score, suffix = "%" }: { label: string; score: Score | null; suffix?: string }) {
  const level: ConcernLevel = score?.level ?? "unknown";
  const unmeasured = score?.value == null;
  return (
    <Badge
      tone={LEVEL_TONE[level]}
      // Nishon ichida raqam turadi — harf oralig'ini kengaytirish uni o'qishga
      // qiyin qiladi, shuning uchun `tracking-widest` bekor qilinadi.
      className="tabular-nums tracking-normal"
      ariaLabel={unmeasured ? `${label}: o'lchanmagan` : `${label} ${formatNum(score!.value!)}${suffix}`}
    >
      {unmeasured ? "—" : `${formatNum(score!.value!)}${suffix}`}
    </Badge>
  );
}

function Block({ title, icon, hint, children }: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}>
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

/**
 * Moliyaviy ko'rsatkich — raqam va uning MANBASI.
 *
 * `href` majburiy: 7-modda bo'yicha raqam manbasiz turmaydi, va direktorning
 * keyingi savoli har doim "qayerdan?" bo'ladi. Havola yangi yorliqda ochiladi,
 * chunki kokpit — kuzatuv ekrani: undan chiqib ketish kontekstni yo'qotadi.
 */
function Metric({ label, value, hint, href, tone }: {
  label: string;
  value: string;
  hint?: string;
  href: string;
  tone?: "danger" | "success";
}) {
  const color =
    tone === "danger" ? "var(--danger-dark)" : tone === "success" ? "var(--success)" : "var(--text-primary)";
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xl px-3 py-2.5 block hover:opacity-80 transition"
      style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
    >
      <div className="text-micro" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight mt-0.5" style={{ color }}>{value}</div>
      {hint && <div className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </Link>
  );
}

function ItemRow({ item, onReassign }: { item: TimelineItem; onReassign?: (item: TimelineItem) => void }) {
  return (
    <div className="flex items-center gap-2" style={{ borderBottom: "1px solid var(--rule)" }}>
    <Link
      href={`/deadlines?company=${item.companyId}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:opacity-80 flex-1 min-w-0"
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
    {/* Havola va harakat — IKKI alohida element. Qatorni bosish baribir
        batafsilga olib boradi; tugma esa ekrandan chiqmasdan ish ko'chiradi. */}
    {onReassign && (
      <Button variant="secondary" size="sm" onClick={() => onReassign(item)} title="Boshqa xodimga o'tkazish">
        <UserCog size={12} />
      </Button>
    )}
    </div>
  );
}

export default function CockpitPanel({ period, timeline, twins, capacity, finance, isDirector }: {
  period: string;
  timeline: TimelineBucket[];
  twins: CompanyTwin[];
  capacity: StaffCapacity[];
  /**
   * Moliyaviy blok. `null` ⇒ foydalanuvchi direktor EMAS (nazoratchi yoki
   * bosh buxgalter) va blok umuman chizilmaydi. Darvoza serverda
   * (`server/directorCockpit.ts`) — bu yerdagi shart faqat ko'rinish.
   */
  finance: DirectorCockpitFinance | null;
  /**
   * `canDirectorCockpit(role, views)` natijasi — SAHIFADA hisoblanadi.
   *
   * Komponent o'zi ruxsat tekshirmaydi: mijoz kodidagi shart hech qachon
   * darvoza emas, u faqat nimani chizishni hal qiladi. Haqiqiy to'siq har
   * bir server action ichida.
   */
  isDirector: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [horizon, setHorizon] = useState<string>("overdue");
  /** Tasdiqlash modali — qaysi xarajat. */
  const [approving, setApproving] = useState<DirectorCockpitFinance["pendingExpenses"][number] | null>(null);
  /** Qayta tayinlash modali — qaysi majburiyat. */
  const [reassigning, setReassigning] = useState<TimelineItem | null>(null);
  const [reason, setReason] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; fullName: string; role: string }[]>([]);

  /**
   * Hisoblangan xavfni `Company.riskLevel` ga yozadi.
   *
   * ATAYLAB tugma, avtomatik emas: bu yozuv 7 ta boshqa ekranda ko'rinadigan
   * qiymatni o'zgartiradi va audit iziga tushadi. Sahifa ochilganda jimgina
   * bajarilsa, firmalar ro'yxatidagi rang o'zgarishi kimning qarori ekani
   * hech qayerda qolmasdi.
   */
  const syncRisk = () =>
    start(async () => {
      try {
        const r = await persistRiskLevels(period);
        toast.success(
          r.updated > 0
            ? `${r.updated} firmaning xavf darajasi yangilandi`
            : "Xavf darajalari allaqachon dolzarb",
        );
        router.refresh();
      } catch (e) {
        toast.error(friendlyError(e) || "Xatolik");
      }
    });
  /**
   * TASHRIF O'LCHOVI — 2 soniyalik kechikish bilan.
   *
   * Kechikish ataylab: yorliqni adashib ochib darhol yopgan odam "tashrif"
   * bo'lib sanalmasin, aks holda "direktor haftada 5 kun kiradi" ko'rsatkichi
   * tasodifiy bosishlardan shishardi. Tozalash funksiyasi taymerni bekor
   * qiladi, ya'ni tez chiqib ketishda hech narsa yozilmaydi.
   *
   * Xato YUTILADI: o'lchov yozilmagani uchun ekran buzilmasligi kerak.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      void recordCockpitVisit(isDirector ? "director" : "kokpit").catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [isDirector]);

  /** Modal ochilganda maydonlar tozalanadi — oldingi sabab yangi qarorga o'tmasin. */
  const openApprove = (row: DirectorCockpitFinance["pendingExpenses"][number]) => {
    setReason("");
    setApproving(row);
  };

  const openReassign = (item: TimelineItem) => {
    setReason("");
    setToUserId("");
    setReassigning(item);
    // Nomzodlar faqat kerak bo'lganda yuklanadi — kokpit ochilishi
    // og'irlashmasin (u allaqachon uchta og'ir so'rov qiladi).
    if (candidates.length === 0) {
      getReassignCandidates()
        .then(setCandidates)
        .catch((e) => toast.error(friendlyError(e, "Xodimlar ro'yxatini olib bo'lmadi")));
    }
  };

  const runAction = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setApproving(null);
        setReassigning(null);
        router.refresh();
      } catch (e) {
        toast.error(friendlyError(e) || "Xatolik");
      }
    });

  const active = timeline.find((b) => b.key === horizon) ?? timeline[0];
  const overdueCount = timeline.find((b) => b.key === "overdue")?.count ?? 0;

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
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Kokpit</h1>
        <span className="text-meta" style={{ color: "var(--text-muted)" }}>{period} · {twins.length} firma</span>
        <span className="ml-auto">
          <Button variant="secondary" size="sm" disabled={pending} onClick={syncRisk}>
            <RefreshCw size={12} className="inline mr-1" />
            Xavf darajalarini yozish
          </Button>
        </span>
      </div>

      {/* 1 — UFQ: oynalar kesishmaydi, ya'ni sanoqlarni qo'shsa jami chiqadi.

          Yettala plitka BOSILADIGAN FILTR bo'lib qoladi — hech biri "batafsil"
          ostiga yashirilmaydi, aks holda ufqni almashtirish ikki bosishga
          aylanardi. Ierarxiya yashirish bilan emas, VAZN bilan beriladi:
          kechikkan ish bo'lsa o'sha plitka ikki barobar joy va qizil zamin
          oladi, qolgan oltitasi ikkinchi darajali bo'lib qoladi. Kechikkan
          nolga tushsa urg'u ham yo'qoladi — qator yana teng bo'ladi. */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${overdueCount > 0 ? "lg:grid-cols-8" : "lg:grid-cols-7"}`}>
        {timeline.map((b) => {
          const on = b.key === horizon;
          const lead = b.key === "overdue" && b.count > 0;
          return (
            <button
              key={b.key}
              onClick={() => setHorizon(b.key)}
              aria-pressed={on}
              className={`rounded-xl px-3 py-2.5 text-left transition ${lead ? "col-span-2" : ""}`}
              style={{
                background: lead ? "var(--danger-bg)" : on ? "var(--accent-blue-light)" : "var(--surface)",
                border: `1px solid ${on ? "var(--accent-blue)" : lead ? "var(--danger-border)" : "var(--rule)"}`,
              }}
            >
              <div className="text-micro" style={{ color: "var(--text-muted)" }}>{b.label}</div>
              <div
                className={`${lead ? "text-3xl" : "text-xl"} font-bold tabular-nums leading-none mt-0.5`}
                style={{ color: lead ? "var(--danger-dark)" : "var(--text-primary)" }}
              >
                {formatNum(b.count)}
              </div>
            </button>
          );
        })}
      </div>

      {/* 6 — MOLIYA. Faqat direktor (super_admin/admin) ko'radi: `cockpit`
          ko'rinishi to'rt rolga berilgan, moliyaviy manzara esa direktorniki.
          Raqamlar `lib/directorReport.ts` dan — ertalabki Telegram hisoboti
          bilan AYNAN bir manba, aks holda ikki kanal ajralib ketardi. */}
      {finance && (
        <section aria-label="Moliyaviy holat">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Metric
              label="Balans"
              value={`${formatNum(Math.round(finance.balance))} so'm`}
              href="/kassa"
              tone={finance.balance < 0 ? "danger" : undefined}
            />
            <Metric
              label="Kecha"
              value={`+${formatNum(Math.round(finance.yesterday.income))}`}
              hint={`−${formatNum(Math.round(finance.yesterday.outflow))} chiqim`}
              href="/kassa/kirim"
            />
            <Metric
              label="Qarzdorlik"
              value={`${formatNum(Math.round(finance.debt.total))} so'm`}
              hint={
                finance.debt.over30Share == null
                  ? "muddati o'tgani yo'q"
                  : `30+ kun: ${finance.debt.over30Share}%`
              }
              href="/kassa/qarzdorlik"
              tone={finance.debt.over30Share != null && finance.debt.over30Share > 50 ? "danger" : undefined}
            />
            <Metric
              label="Kutayotgan tasdiq"
              value={formatNum(finance.pending.expenses + finance.pending.proofs)}
              hint={`${finance.pending.expenses} xarajat · ${finance.pending.proofs} dalil`}
              href="/kassa/chiqim"
              tone={finance.pending.expenses + finance.pending.proofs > 0 ? "danger" : undefined}
            />
            <Metric
              label="Bank sverka"
              value={formatNum(finance.unmatchedBank.income + finance.unmatchedBank.expense)}
              hint={`${finance.unmatchedBank.income} kirim · ${finance.unmatchedBank.expense} chiqim`}
              href="/kassa/sverka"
            />
            <Metric
              label="Reja / fakt"
              value={finance.plan ? `${finance.plan.percent}%` : "—"}
              hint={finance.plan ? `${formatNum(Math.round(finance.plan.fact))} so'm` : "reja qo'yilmagan"}
              href="/reports"
              tone={finance.plan ? (finance.plan.percent >= 100 ? "success" : "danger") : undefined}
            />
          </div>

          {/* Kutayotgan xarajatlar — bir bosishda tasdiqlanadi. Ro'yxat shu
              yerda, chunki "4 ta kutmoqda" raqami o'zi harakat bermaydi. */}
          {finance.pendingExpenses.length > 0 && (
            <div className="mt-2 rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}>
              <h2 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-primary)" }}>
                Tasdiq kutayotgan xarajatlar
              </h2>
              {finance.pendingExpenses.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 px-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--rule)" }}
                >
                  <span className="text-xs font-bold tabular-nums w-32 flex-shrink-0" style={{ color: "var(--text-primary)" }}>
                    {formatNum(Math.round(e.amount))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs truncate" style={{ color: "var(--text-primary)" }}>{e.category}</span>
                    <span className="block text-micro truncate" style={{ color: "var(--text-muted)" }}>
                      {e.companyName ?? "Ofis"}{e.description ? ` · ${e.description}` : ""}
                    </span>
                  </span>
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => openApprove(e)}>
                    <Check size={12} className="inline mr-1" />
                    Tasdiqlash
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
              {active.items.map((it) => (
                <ItemRow key={it.id} item={it} onReassign={isDirector ? openReassign : undefined} />
              ))}
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
                  <ScoreChip label="Xavf" score={t.risk} />
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
                  <ScoreChip label="Yuklama" score={c.score} />
                  <IdentityCell
                    name={c.fullName}
                    secondary={`${c.score.reasons[0]?.detail ?? ""}${c.estimated ? " · taxminiy" : ""}`}
                    className="flex-1"
                  />
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
                  <ScoreChip label="Muvofiqlik" score={t.compliance} />
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
            style={{ color: "var(--accent-blue)" }}
          >
            Muddatlarga o&apos;tish <ArrowRight size={12} />
          </Link>
        </Block>
      </div>

      {/* SABAB MAJBURIY. Tugma bo'sh sababda o'chiq turadi, lekin hal
          qiluvchi tekshiruv serverda: direktorning bir bosishi ish oqimini
          chetlab o'tadi va "nega" audit izida qolishi shart. */}
      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        size="md"
        title="Xarajatni tasdiqlash"
      >
        {approving && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <strong>{formatNum(Math.round(approving.amount))} so&apos;m</strong> · {approving.category}
              {approving.companyName ? ` · ${approving.companyName}` : ""}
            </p>
            <label htmlFor="cockpit-approve-reason" className="block text-meta font-semibold" style={{ color: "var(--text-muted)" }}>
              Sabab (majburiy)
            </label>
            <textarea
              id="cockpit-approve-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="erp-input w-full"
              placeholder="Nega navbatdan tashqari tasdiqlanmoqda?"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setApproving(null)}>Bekor</Button>
              <Button
                variant="primary"
                size="md"
                disabled={!reason.trim() || pending}
                onClick={() => runAction(() => approveExpenseFromCockpit(approving.id, reason), "Xarajat tasdiqlandi")}
              >
                Tasdiqlash
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={reassigning !== null}
        onClose={() => setReassigning(null)}
        size="md"
        title="Majburiyatni qayta tayinlash"
      >
        {reassigning && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <strong>{reassigning.title}</strong> · {reassigning.companyName}
              {reassigning.responsibleName ? ` · hozir: ${reassigning.responsibleName}` : ""}
            </p>
            <label htmlFor="cockpit-reassign-to" className="block text-meta font-semibold" style={{ color: "var(--text-muted)" }}>
              Kimga
            </label>
            <Select
              id="cockpit-reassign-to"
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              placeholder="Xodimni tanlang"
            >
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </Select>
            <label htmlFor="cockpit-reassign-reason" className="block text-meta font-semibold" style={{ color: "var(--text-muted)" }}>
              Sabab (majburiy)
            </label>
            <textarea
              id="cockpit-reassign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="erp-input w-full"
              placeholder="Nega boshqa xodimga o'tkazilmoqda?"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setReassigning(null)}>Bekor</Button>
              <Button
                variant="primary"
                size="md"
                disabled={!reason.trim() || !toUserId || pending}
                onClick={() =>
                  runAction(
                    () => reassignObligationFromCockpit(reassigning.id, toUserId, reason),
                    "Majburiyat qayta tayinlandi",
                  )
                }
              >
                O&apos;tkazish
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
