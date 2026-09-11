"use client";

// KIRIM/CHIQIM DINAMIKASI — oxirgi N haftalik taqqoslash.
//
// Haqiqiy ma'lumot (`lib/balance.ts#getWeeklyMovement`), soxta emas. Ikkita
// seriya (kirim/chiqim) — mustaqil kategorik ranglar emas, balki butun
// ilovada allaqachon o'rnatilgan semantik juftlik (`Money` komponenti bilan
// bir xil: kirim = yashil, chiqim = qizil).
//
// NEGA QO'LDA CHIZILGAN USTUNLAR ALMASHTIRILDI. Ilgari bu fayl `div` larning
// balandligini foizda hisoblab chizardi. Natijada: o'q yo'q (raqam faqat
// `title` da, ya'ni sichqonchasiz o'qib bo'lmaydi), to'r yo'q (ikki hafta
// orasidagi farqni ko'z bilan o'lchab bo'lmaydi) va eng muhimi SOF OQIM
// ko'rinmasdi — holbuki kassa uchun asosiy savol "kirim chiqimdan oshdimi"
// degan savol. `recharts` loyihada allaqachon bor (`cabinets/CashFlowChart`),
// yangi bog'liqlik qo'shilmadi.
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNum, formatUzDayShort } from "@/lib/platform/format";

interface WeekPoint {
  weekStart: string;
  income: number;
  outflow: number;
}

/**
 * O'q belgilari uchun ixcham yozuv. `Intl.NumberFormat` ATAYLAB
 * ishlatilmaydi — u server va klientda turlicha natija berib hidratsiyani
 * buzadi (loyiha qoidasi: `lib/platform/format.ts`).
 */
function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${Math.round(v / 1e8) / 10} mlrd`;
  if (a >= 1e6) return `${Math.round(v / 1e5) / 10} mln`;
  if (a >= 1e3) return `${Math.round(v / 1e2) / 10} ming`;
  return String(Math.round(v));
}

export default function WeeklyFlowChart({ weeks }: { weeks: WeekPoint[] }) {
  const data = weeks.map((w) => ({
    name: formatUzDayShort(w.weekStart),
    Kirim: w.income,
    Chiqim: w.outflow,
    "Sof oqim": w.income - w.outflow,
  }));

  const totalIn = weeks.reduce((s, w) => s + w.income, 0);
  const totalOut = weeks.reduce((s, w) => s + w.outflow, 0);
  const net = totalIn - totalOut;
  const hasData = totalIn > 0 || totalOut > 0;

  return (
    <div className="dashboard-card overflow-hidden h-full flex flex-col">
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div>
          <h3 className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>
            Kirim / chiqim dinamikasi
          </h3>
          <p className="text-micro" style={{ color: "var(--text-muted)" }}>
            Oxirgi {weeks.length} hafta · 7 kunlik oynalar
          </p>
        </div>
        {/* Legenda — rang identifikatorsiz emas: nuqta + matn birga. */}
        <div className="flex items-center gap-3 text-micro" style={{ color: "var(--text-secondary)" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--accent-green)" }} />
            Kirim
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--accent-red)" }} />
            Chiqim
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-px" style={{ background: "var(--brand)" }} />
            Sof oqim
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="px-2 pt-4 pb-1 flex-1">
          {/* `ResponsiveContainer` o'lchamni OTA elementdan o'qiydi. Ota
              `flex-1` bo'lsa birinchi o'lchovda balandlik 0 bo'lib qoladi va
              grafik BO'SH chiziladi — brauzerda aynan shunday bo'ldi. Shuning
              uchun aniq balandlikli qobiq (`cabinets/CashFlowChart` da ham
              xuddi shunday yozilgan). */}
          <div style={{ width: "100%", height: 196 }}>
            <ResponsiveContainer width="100%" height={196}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                dy={4}
              />
              <YAxis
                width={54}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                tickFormatter={compact}
              />
              {/* Nol chizig'i — sof oqim manfiyga o'tgan haftani ko'z darhol
                  topadi. Kassa uchun bu grafikning asosiy ma'nosi. */}
              <ReferenceLine y={0} stroke="var(--rule-strong)" />
              <Tooltip
                cursor={{ fill: "var(--table-row-hover)" }}
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: "var(--shadow-float)",
                }}
                labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                formatter={(v) => `${formatNum(Math.round(Number(v)))} so'm`}
              />
              {/* Kirish animatsiyasi O'CHIRILGAN. Recharts ustunlarni nol
                  balandlikdan o'stiradi va bu animatsiya HAR o'lcham
                  o'zgarishida qaytadan boshlanadi — oyna kengligi o'zgarganda
                  yoki chop etishga yuborilganda grafik bir zumga BO'SH bo'lib
                  qoladi (skrinshotda aynan shu holat tushdi). Boshqaruv
                  grafigi darhol o'qilishi kerak, o'sib chiqishi emas. */}
              <Bar dataKey="Kirim" fill="var(--accent-green)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
              <Bar dataKey="Chiqim" fill="var(--accent-red)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="Sof oqim"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "var(--brand)", strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-4">
          <p className="text-body font-medium" style={{ color: "var(--text-secondary)" }}>
            Bu davrda harakat qayd etilmagan
          </p>
          <p className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
            Kirim va chiqim kiritilgach dinamika shu yerda chiziladi
          </p>
        </div>
      )}

      {/* Grafikning yakuni — ko'z ustunlardan yig'indini o'zi hisoblamasin. */}
      <div
        className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1"
        style={{ borderTop: "1px solid var(--rule)", background: "var(--bg-sunken)" }}
      >
        <span className="text-micro" style={{ color: "var(--text-secondary)" }}>
          Jami kirim{" "}
          <b className="font-mono tabular-nums" style={{ color: "var(--success)" }}>
            {formatNum(Math.round(totalIn))}
          </b>
        </span>
        <span className="text-micro" style={{ color: "var(--text-secondary)" }}>
          Jami chiqim{" "}
          <b className="font-mono tabular-nums" style={{ color: "var(--danger)" }}>
            {formatNum(Math.round(totalOut))}
          </b>
        </span>
        <span className="text-micro ml-auto" style={{ color: "var(--text-secondary)" }}>
          Sof oqim{" "}
          <b
            className="font-mono tabular-nums"
            style={{ color: net >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {net >= 0 ? "+" : "−"}
            {formatNum(Math.abs(Math.round(net)))}
          </b>
        </span>
      </div>
    </div>
  );
}
