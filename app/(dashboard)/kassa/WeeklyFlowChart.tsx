// KIRIM/CHIQIM DINAMIKASI — oxirgi N haftalik taqqoslash.
//
// Haqiqiy ma'lumot (`lib/balance.ts#getWeeklyMovement`), soxta emas. Ikkita
// seriya (kirim/chiqim) — mustaqil kategorik ranglar emas, balki butun
// ilovada allaqachon o'rnatilgan semantik juftlik (`Money` komponenti bilan
// bir xil: kirim = yashil, chiqim = qizil), shuning uchun yangi palitra
// tanlash shart emas.
import { formatNum, formatUzDayShort } from "@/lib/platform/format";

interface WeekPoint {
  weekStart: string;
  income: number;
  outflow: number;
}

export default function WeeklyFlowChart({ weeks }: { weeks: WeekPoint[] }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.income, w.outflow]));

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--input-bg)", borderBottom: "1px solid var(--card-border)" }}
      >
        <div>
          <h2 className="text-meta font-semibold" style={{ color: "var(--text)" }}>
            Kirim / chiqim dinamikasi
          </h2>
          <p className="text-micro" style={{ color: "var(--text-muted)" }}>
            Oxirgi {weeks.length} hafta
          </p>
        </div>
        {/* Legenda — 2 seriya, rang identifikatorsiz emas: nuqta + matn birga. */}
        <div className="flex items-center gap-3 text-micro" style={{ color: "var(--text-secondary)" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--accent-green)" }} />
            Kirim
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--accent-red)" }} />
            Chiqim
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div className="flex items-end gap-3 h-40">
          {weeks.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex items-end justify-center gap-1 h-32">
                <div
                  className="flex-1 max-w-[18px] rounded-t transition-opacity hover:opacity-80"
                  style={{
                    height: `${Math.max(2, (w.income / max) * 100)}%`,
                    background: "var(--accent-green)",
                  }}
                  title={`Kirim: ${formatNum(w.income)} so'm`}
                />
                <div
                  className="flex-1 max-w-[18px] rounded-t transition-opacity hover:opacity-80"
                  style={{
                    height: `${Math.max(2, (w.outflow / max) * 100)}%`,
                    background: "var(--accent-red)",
                  }}
                  title={`Chiqim: ${formatNum(w.outflow)} so'm`}
                />
              </div>
              <span className="text-micro whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {formatUzDayShort(w.weekStart)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
