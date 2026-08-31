import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AlertTriangle, Building2, Clock, Wallet } from "lucide-react";
import { Card, EmptyState, KpiCard, Money, PageHeader } from "@/components/ui";
import { formatNum, formatUzDayShort } from "@/lib/platform/format";

export const metadata: Metadata = {
  title: "Direktor ko'rigi",
};

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

  const monthIncome = Number(payrollFundResult._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Direktor ko'rigi"
        description="Kechikkan majburiyatlar, yaqin muddatlar va oxirgi tushumlar"
        icon={<Building2 size={20} />}
      />

      {/*
        Plitkalar BOSILADIGAN: ilgari direktor "7 ta kechikkan" ni ko'rardi-yu,
        qaysi firmalar ekanini bilish uchun "Ishlar" ekraniga o'tib filtrni
        qo'lda qayta terardi. Endi plitka filtri qo'yilgan ro'yxatga olib boradi
        — 3 ta harakat (o'tish + filtr + tanlash) o'rniga 1 ta bosish.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Kechikkan majburiyatlar"
          value={formatNum(overdueCount)}
          tone={overdueCount > 0 ? "danger" : "success"}
          emphasize
          icon={<AlertTriangle size={14} />}
          href="/deadlines?tab=overdue"
          hint={overdueCount > 0 ? "Darhol ko'rib chiqilsin" : "Kechikkani yo'q"}
        />
        <KpiCard
          label="24 soat ichida muddat"
          value={formatNum(dueSoonCount)}
          tone={dueSoonCount > 0 ? "warning" : "neutral"}
          emphasize={dueSoonCount > 0}
          icon={<Clock size={14} />}
          // "Ishlar" ekranida 24 soatlik yorliq YO'Q (`lib/workTabs.ts`:
          // all | mine | overdue | tasks). Shuning uchun havola umumiy
          // ro'yxatga boradi — mavjud bo'lmagan `?status=` parametri bilan
          // "filtrlangan" ko'rinish va'da qilish yolg'on bo'lardi.
          href="/deadlines"
        />
        <KpiCard
          label="Faol firmalar"
          value={formatNum(activeCompanies)}
          icon={<Building2 size={14} />}
          href="/organizations"
        />
        <KpiCard
          label="Bu oy tushumlari"
          value={<Money value={monthIncome} tone="in" />}
          tone="success"
          icon={<Wallet size={14} />}
          href="/kassa/kirim"
        />
      </div>

      {/*
        Ikki ustun FAQAT keng ekranda. Ilgari `1fr 1fr` qotirilgan edi va
        telefonda ikkala jadval ham 50% kenglikka siqilib, firma nomlari
        o'qilmasdi.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/*
          So'rovda QUYI chegara yo'q (`dueAt: { lte: in3d }`) — ya'ni ro'yxatga
          kechikkanlar ham tushadi va ular birinchi turadi (`orderBy: dueAt asc`).
          Bu ATAYLAB: direktorga eng shoshilinchi ish yuqorida kerak. Lekin
          sarlavhada "Keyingi 3 kun" deb yozish YOLG'ON edi — brauzerda
          ko'rilganda ro'yxat 26 kun oldin muddati o'tgan qatorlar bilan
          boshlanardi. So'rov o'zgartirilmadi (bu biznes xulqi), matn rostlandi.
        */}
        <Card title="Shoshilinch majburiyatlar" subtitle="Kechikkanlar va keyingi 3 kun" flush>
          {recentObligations.length === 0 ? (
            <EmptyState
              title="Hammasi joyida"
              description="Keyingi uch kunda muddati kelayotgan majburiyat yo'q."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <caption className="sr-only">Muddati yaqin majburiyatlar</caption>
                <thead>
                  <tr>
                    <th scope="col">Firma</th>
                    <th scope="col">Majburiyat</th>
                    <th scope="col">Muddat</th>
                  </tr>
                </thead>
                <tbody>
                  {recentObligations.map((o) => {
                    const isOverdue = o.dueAt < now;
                    const isUrgent = o.dueAt < in24h;
                    return (
                      <tr key={o.id}>
                        <td>{o.company.name}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{o.template.name}</td>
                        <td
                          className="tabular-nums whitespace-nowrap font-bold"
                          style={{
                            color: isOverdue
                              ? "var(--danger)"
                              : isUrgent
                                ? "var(--warning)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {formatUzDayShort(o.dueAt)}
                          {isOverdue && <span className="sr-only"> (kechikkan)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Oxirgi to'lovlar" subtitle="So'nggi 7 kun" flush>
          {recentPayments.length === 0 ? (
            <EmptyState
              title="To'lovlar yo'q"
              description="So'nggi yetti kunda tushum qayd etilmagan."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <caption className="sr-only">Oxirgi to'lovlar</caption>
                <thead>
                  <tr>
                    <th scope="col">Firma</th>
                    <th scope="col" className="col-numeric">Summa</th>
                    <th scope="col">Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.company.name}</td>
                      <td className="col-numeric">
                        <Money value={Number(p.amount)} tone="in" showSign />
                      </td>
                      <td className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {p.paymentDate ? formatUzDayShort(p.paymentDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
