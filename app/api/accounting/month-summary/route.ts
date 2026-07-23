import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logServerError } from "@/lib/logger";
import { getMonthSummaryData } from "@/server/monthClosing";
import { formatNum } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/accounting/month-summary?year=2026&month=1[&format=html]
 *
 * Oy moliyaviy xulosasi: opening / income / expense / payroll / cash / closing /
 * profit / difference / ledger status. Auth va rol tekshiruvi
 * getMonthSummaryData ichida (senior rollar).
 *
 * format=html — chop etishga tayyor ko'rinish (brauzerning "Print → Save as
 * PDF" oqimi orqali Snapshot PDF sifatida yuklab olinadi).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  const format = req.nextUrl.searchParams.get("format");

  let summary: Awaited<ReturnType<typeof getMonthSummaryData>>;
  try {
    summary = await getMonthSummaryData(year, month);
  } catch (e) {
    const message = (e as Error).message;
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    // 401/403 — kutilgan holat (ruxsat rad etildi), shovqin qilmaymiz.
    // 400 esa haqiqiy nosozlik: noto'g'ri davr yoki hisoblash xatosi.
    if (status === 400) logServerError("api.accounting.month-summary", e, { year, month });
    return NextResponse.json({ error: message }, { status });
  }

  if (format !== "html") {
    return NextResponse.json(summary);
  }

  const s = summary;
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 14px;border-bottom:1px solid #e5e7eb">${label}</td>` +
    `<td style="padding:6px 14px;border-bottom:1px solid #e5e7eb;text-align:right;` +
    `font-weight:${strong ? 700 : 400};font-variant-numeric:tabular-nums">${value}</td></tr>`;

  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8">
<title>Oy yopilishi — ${s.period}</title>
<style>@media print { .no-print { display:none } } body { font-family: system-ui, sans-serif; max-width: 640px; margin: 32px auto; color: #111 }</style>
</head><body>
<h2 style="margin-bottom:4px">Moliyaviy xulosa — ${s.period}</h2>
<p style="color:#555;margin-top:0">Holat: <b>${s.status}</b> · Manba: ${s.source === "snapshot" ? "yakuniy snapshot" : "jonli hisob"} · Ledger: <b>${s.ledgerStatus}</b>${s.isValid ? "" : " · <b style='color:#b91c1c'>INVALID (reopen)</b>"}</p>
<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
${row("Ochilish qoldig'i (Opening)", formatNum(s.opening) + " so'm")}
${row("Kirim (Income)", formatNum(s.income) + " so'm")}
${row("Chiqim (Expense)", formatNum(s.expense) + " so'm")}
${row("Oylik to'lovlari (Payroll)", formatNum(s.payroll) + " so'm")}
${row("Kassa kirim (Cash In)", formatNum(s.cashIn) + " so'm")}
${row("Kassa chiqim (Cash Out)", formatNum(s.cashOut) + " so'm")}
${row("Foyda (Profit)", formatNum(s.profit) + " so'm")}
${row("Zarar (Loss)", formatNum(s.loss) + " so'm")}
${row("Yopilish qoldig'i (Closing)", formatNum(s.closing) + " so'm", true)}
${row("Farq (ledger ↔ agregat)", formatNum(s.difference) + " so'm")}
</table>
${s.checksum ? `<p style="color:#777;font-size:12px;word-break:break-all">Checksum: ${s.checksum}</p>` : ""}
${s.closedAt ? `<p style="color:#555;font-size:13px">Yopilgan: ${new Date(s.closedAt as unknown as string).toISOString().slice(0, 16).replace("T", " ")}</p>` : ""}
<button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 20px;font-size:14px;cursor:pointer">PDF sifatida saqlash (chop etish)</button>
</body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
