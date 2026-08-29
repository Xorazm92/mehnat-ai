import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function DirectorPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [
    overdueCount,
    dueSoonCount,
    activeCompanies,
    payrollFundResult,
    recentObligations,
    recentPayments,
  ] = await Promise.all([
    prisma.obligation.count({
      where: {
        status: { notIn: ["accepted", "cancelled", "rejected"] },
        dueAt: { lt: now },
      },
    }),
    prisma.obligation.count({
      where: {
        status: { notIn: ["accepted", "cancelled", "rejected"] },
        dueAt: { gte: now, lte: in24h },
      },
    }),
    prisma.company.count({ where: {} }),
    prisma.payment.aggregate({
      where: {
        deletedAt: null,
        status: { in: ["paid", "partial"] },
        paymentDate: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
          lte: now,
        },
      },
      _sum: { amount: true },
    }),
    prisma.obligation.findMany({
      where: {
        status: { notIn: ["accepted", "cancelled", "rejected"] },
        dueAt: { lte: in3d },
      },
      select: {
        id: true,
        dueAt: true,
        periodKey: true,
        company: { select: { name: true } },
        template: { select: { code: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.payment.findMany({
      where: {
        deletedAt: null,
        status: { in: ["paid", "partial"] },
        paymentDate: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        company: { select: { name: true } },
      },
      orderBy: { paymentDate: "desc" },
      take: 10,
    }),
  ]);

  const payrollFund = Number(payrollFundResult._sum.amount ?? 0);

  const fmtMln = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mln`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)} ming`;
    return `${v} so'm`;
  };

  const fmtUzDate = (d: Date) =>
    d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "short" });

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "24px" }}>
        Direktor ko&apos;rikdona
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: "var(--text-muted, #888)", fontSize: "13px", marginBottom: "8px" }}>
            Kechikkan majburiyatlar
          </div>
          <div style={{ fontSize: "36px", fontWeight: "bold", color: overdueCount > 0 ? "var(--danger, #ef4444)" : "var(--success, #22c55e)" }}>
            {overdueCount}
          </div>
        </div>

        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: "var(--text-muted, #888)", fontSize: "13px", marginBottom: "8px" }}>
            24 soat ichida muddat
          </div>
          <div style={{ fontSize: "36px", fontWeight: "bold", color: dueSoonCount > 0 ? "var(--warning, #f59e0b)" : "inherit" }}>
            {dueSoonCount}
          </div>
        </div>

        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: "var(--text-muted, #888)", fontSize: "13px", marginBottom: "8px" }}>
            Faol firmalar
          </div>
          <div style={{ fontSize: "36px", fontWeight: "bold" }}>{activeCompanies}</div>
        </div>

        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ color: "var(--text-muted, #888)", fontSize: "13px", marginBottom: "8px" }}>
            Bu oy tushumlari
          </div>
          <div style={{ fontSize: "28px", fontWeight: "bold", color: "var(--success, #22c55e)" }}>
            {fmtMln(payrollFund)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>Muddati yaqin majburiyatlar</h2>
          {recentObligations.length === 0 ? (
            <p style={{ color: "var(--text-muted, #888)" }}>Hammasi joyida</p>
          ) : (
            <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted, #888)", borderBottom: "1px solid var(--border, #333)" }}>
                  <th style={{ padding: "0 0 8px 0" }}>Firma</th>
                  <th style={{ padding: "0 0 8px 0" }}>Majburiyat</th>
                  <th style={{ padding: "0 0 8px 0" }}>Muddat</th>
                </tr>
              </thead>
              <tbody>
                {recentObligations.map((o) => {
                  const isOverdue = o.dueAt < now;
                  const isUrgent = o.dueAt < in24h;
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid var(--border, #333)" }}>
                      <td style={{ padding: "8px 0" }}>{o.company.name}</td>
                      <td style={{ padding: "8px 0" }}>{o.template.name}</td>
                      <td style={{
                        padding: "8px 0",
                        color: isOverdue ? "var(--danger, #ef4444)" : isUrgent ? "var(--warning, #f59e0b)" : "var(--text, #fff)",
                      }}>
                        {fmtUzDate(o.dueAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: "var(--card-bg, #1a1a2e)", borderRadius: "12px", padding: "20px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>Oxirgi to&apos;lovlar</h2>
          {recentPayments.length === 0 ? (
            <p style={{ color: "var(--text-muted, #888)" }}>To&apos;lovlar yo&apos;q</p>
          ) : (
            <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted, #888)", borderBottom: "1px solid var(--border, #333)" }}>
                  <th style={{ padding: "0 0 8px 0" }}>Firma</th>
                  <th style={{ padding: "0 0 8px 0" }}>Summa</th>
                  <th style={{ padding: "0 0 8px 0" }}>Sana</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border, #333)" }}>
                    <td style={{ padding: "8px 0" }}>{p.company.name}</td>
                    <td style={{ padding: "8px 0", color: "var(--success, #22c55e)" }}>
                      +{Number(p.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 0", color: "var(--text-muted, #888)" }}>
                      {p.paymentDate ? fmtUzDate(p.paymentDate) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
