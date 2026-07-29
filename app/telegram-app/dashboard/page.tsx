import Link from "next/link";
import { getMiniAppDashboard } from "@/server/telegramApp";

export const metadata = { title: "ASRO — dashboard" };

/**
 * Director view inside Telegram: the numbers that decide what to chase today.
 *
 * A plain RSC page — the session cookie was set by the handshake, so `auth()`
 * and the ordinary server actions work here exactly as they do on the web.
 */
export default async function TelegramDashboardPage() {
  const d = await getMiniAppDashboard();

  return (
    <>
      <h1 className="tg-h1">Boshqaruv paneli</h1>
      <p className="tg-hint">Sizning ko&apos;rish doirangiz bo&apos;yicha</p>

      <div className="tg-grid">
        <div className={`tg-stat${d.overdue > 0 ? " tg-stat--alert" : ""}`}>
          <div className="tg-stat__value">{d.overdue}</div>
          <div className="tg-stat__label">Muddati o&apos;tgan</div>
        </div>
        <div className="tg-stat">
          <div className="tg-stat__value">{d.dueToday}</div>
          <div className="tg-stat__label">Bugun tugaydi</div>
        </div>
        <div className="tg-stat">
          <div className="tg-stat__value">{d.openObligations}</div>
          <div className="tg-stat__label">Ochiq majburiyat</div>
        </div>
        <div className="tg-stat">
          <div className="tg-stat__value">{d.openQuestions}</div>
          <div className="tg-stat__label">Javobsiz savol</div>
        </div>
        {d.isSenior && (
          <>
            <div className="tg-stat">
              <div className="tg-stat__value">{d.pendingKpi}</div>
              <div className="tg-stat__label">KPI tasdiq kutmoqda</div>
            </div>
            <div className="tg-stat">
              <div className="tg-stat__value">{d.unpaidCompanies}</div>
              <div className="tg-stat__label">To&apos;lovsiz mijoz</div>
            </div>
          </>
        )}
        <div className="tg-stat tg-stat--wide">
          <div className="tg-stat__value">{d.myOpen}</div>
          <div className="tg-stat__label">Menga biriktirilgan ochiq majburiyat</div>
        </div>
      </div>

      {d.isSenior && d.behind.length > 0 && (
        <>
          <h2 className="tg-h1">Kim orqada</h2>
          <div className="tg-list">
            {d.behind.map((p) => (
              <div key={p.name} className="tg-list__row">
                <span>{p.name}</span>
                <span className="tg-list__num">{p.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Link href="/telegram-app/proof" className="tg-btn" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
        📄 Dalil yuklash
      </Link>
    </>
  );
}
