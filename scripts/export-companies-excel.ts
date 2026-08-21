// =====================================================
// FIRMALAR — TO'LIQ EXCEL EKSPORTI
// =====================================================
//
// Bitta .xlsx faylda firma bo'yicha butun ma'lumot: pasport, mas'ullar va
// ularning ulushi, moliya (shartnoma qarzi), yoqilgan xizmatlar, joriy davr
// hisobot matritsasi, majburiyat muddatlari va to'lovlar tarixi.
//
// NEGA SKRIPT, EKRANDAGI "EXCEL" TUGMASI EMAS: matritsadagi eksport faqat
// KO'RINAYOTGAN ustunlarni va faqat bitta davrni beradi. Bu yerda esa manba
// jadvallarning o'zi o'qiladi, ya'ni fayl firma haqidagi to'liq yozuv.
//
// Ishga tushirish:
//   npx tsx scripts/export-companies-excel.ts                 # joriy davr
//   npx tsx scripts/export-companies-excel.ts --period 2026-07
//   npx tsx scripts/export-companies-excel.ts --out /tmp/x.xlsx
//   npx tsx scripts/export-companies-excel.ts --include-own   # ASRO o'z firmalari ham
//
// `--include-own` bo'lmasa, `isOwnFirm` firmalar CHIQARILMAYDI: ular mijoz
// emas, ASRO'ning o'z yuridik shaxslari (lib/... own-firm ajratmasi) va
// qarzdorlik/payroll hisobiga kirmaydi.
import "./load-env";
import { prisma } from "@/lib/prisma";
import { utils, writeFile } from "xlsx";
import { BASE_REPORT_COLUMNS, serviceEnabled } from "@/lib/reportColumns";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import { listDebtors } from "@/lib/debt";
import { normalizePeriodKey } from "@/lib/periods";
import type { OperationFieldKey } from "@/types";

const argv = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const PERIOD = normalizePeriodKey(argOf("--period") ?? new Date().toISOString().slice(0, 7));
const INCLUDE_OWN = argv.includes("--include-own");
const OUT =
  argOf("--out") ?? `firmalar-toliq-${PERIOD}-${new Date().toISOString().slice(0, 10)}.xlsx`;

// Decimal | null → number (Excel raqam sifatida o'qishi uchun; matn EMAS,
// aks holda yig'indi va saralash ishlamaydi).
const num = (v: unknown): number | "" =>
  v === null || v === undefined ? "" : Number(v);
const date = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");
const yesNo = (b: boolean | null | undefined): string => (b ? "ha" : "yo'q");

const REGIME_LABEL: Record<string, string> = {
  vat: "QQS to'lovchi",
  turnover: "Aylanma soliq",
  turnover_percent: "Aylanma (foiz)",
  turnover_fixed: "Aylanma (qat'iy)",
  fixed: "Qat'iy soliq",
  yatt_vat: "YaTT — QQS",
  yatt_turnover: "YaTT — aylanma",
  yatt_fixed: "YaTT — qat'iy",
  nonresident: "Norezident",
};

/** Varaqni ustun kengligi bilan qo'shadi (aks holda hamma ustun 8 belgilik). */
function addSheet(wb: ReturnType<typeof utils.book_new>, name: string, rows: Record<string, unknown>[]) {
  const ws = utils.json_to_sheet(rows.length ? rows : [{ "Ma'lumot yo'q": "" }]);
  const headers = Object.keys(rows[0] ?? { "Ma'lumot yo'q": "" });
  ws["!cols"] = headers.map((h) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[h] ?? "").length), h.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 45) };
  });
  ws["!autofilter"] = { ref: ws["!ref"] as string };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

async function main() {
  console.log(`▶ Davr: ${PERIOD}   o'z firmalar: ${INCLUDE_OWN ? "kiritiladi" : "chiqarilmaydi"}`);

  const companies = await prisma.company.findMany({
    where: INCLUDE_OWN ? {} : { isOwnFirm: false },
    orderBy: { name: "asc" },
    include: {
      accountant: { select: { fullName: true, phone: true } },
      supervisor: { select: { fullName: true } },
      chiefAccountant: { select: { fullName: true } },
      bankClient: { select: { fullName: true } },
      departmentRef: { select: { name: true } },
      internalContractorFirm: { select: { name: true } },
      contractAssignments: {
        where: { isActive: true },
        include: { user: { select: { fullName: true, role: true } } },
      },
      monthlyReports: { where: { period: PERIOD } },
      obligations: {
        where: { periodKey: { startsWith: PERIOD.slice(0, 4) } },
        include: { template: { select: { code: true, name: true } } },
      },
      payments: { where: { deletedAt: null }, orderBy: { period: "desc" } },
      credentials: { select: { serviceName: true, loginId: true } },
    },
  });
  console.log(`   firma: ${companies.length} ta`);

  // Qarz — YAGONA manbadan (lib/debt.ts), skriptda qayta hisoblanmaydi:
  // audit aynan "qarz uch xil joyda uch xil hisoblanadi" deb ogohlantirgan.
  const debtors = await listDebtors(prisma as never, { scope: "all", period: PERIOD });
  const debtBy = new Map(debtors.map((d) => [d.companyId, d]));

  const wb = utils.book_new();

  // ── 1) FIRMALAR (pasport) ─────────────────────────────────
  addSheet(
    wb,
    "Firmalar",
    companies.map((c, i) => ({
      "#": i + 1,
      "Korxona nomi": c.name,
      "Brend nomi": c.brandName ?? "",
      INN: c.inn,
      "Soliq rejimi": REGIME_LABEL[c.taxRegime] ?? c.taxRegime,
      Holat: c.isActive ? "faol" : "to'xtatilgan",
      "Korxona statusi": c.companyStatus ?? "",
      "Xavf darajasi": c.riskLevel ?? "",
      "ASRO o'z firmasi": yesNo(c.isOwnFirm),
      Direktor: c.directorName ?? "",
      "Direktor tel": c.directorPhone ?? "",
      Muassis: c.founderName ?? "",
      Egasi: c.ownerName ?? "",
      "Yuridik manzil": c.legalAddress ?? "",
      "Bo'lim": c.departmentRef?.name ?? c.department ?? "",
      Buxgalter: c.accountant?.fullName ?? "",
      Nazoratchi: c.supervisor?.fullName ?? "",
      "Bosh buxgalter": c.chiefAccountant?.fullName ?? "",
      "Bank-klient": c.bankClient?.fullName ?? c.bankClientName ?? "",
      "Shartnoma raqami": c.contractNumber ?? "",
      "Shartnoma sanasi": date(c.contractDate),
      "Shartnoma summasi": num(c.contractAmount),
      "To'lov kuni": c.paymentDay ?? "",
      "Shartnoma tomoni (ASRO)": c.internalContractorFirm?.name ?? "",
      "1C holati": c.oneCStatus ?? "",
      "1C joylashuvi": c.oneCLocation ?? "",
      "1C baza nomi": c.baseName1c ?? "",
      Server: c.serverName ?? c.serverInfo ?? "",
      "Statistika turi": c.statsType ?? "",
      "IT Park rezidenti": c.itParkResident ?? "",
      "QQS guvohnoma sanasi": c.vatCertificateDate ?? "",
      "Yer solig'i": yesNo(c.hasLandTax),
      "Suv solig'i": yesNo(c.hasWaterTax),
      "Mol-mulk solig'i": yesNo(c.hasPropertyTax),
      "Aksiz solig'i": yesNo(c.hasExciseTax),
      "KPI yoqilgan": yesNo(c.kpiEnabled),
      "Soliq.uz login (vault)":
        c.credentials.find((k) => k.serviceName === "soliq")?.loginId ?? c.login ?? "",
      "Xavf izohi": c.riskNotes ?? "",
      Izoh: c.notes ?? "",
      Yaratilgan: date(c.createdAt),
    })),
  );

  // ── 2) MAS'ULLAR VA ULUSH ─────────────────────────────────
  addSheet(
    wb,
    "Mas'ullar va ulush",
    companies.map((c) => ({
      "Korxona nomi": c.name,
      INN: c.inn,
      "Shartnoma summasi": num(c.contractAmount),
      Buxgalter: c.accountant?.fullName ?? "",
      "Buxgalter %": num(c.accountantPerc),
      "Buxgalter summa": num(c.accountantSum),
      Nazoratchi: c.supervisor?.fullName ?? "",
      "Nazoratchi %": num(c.supervisorPerc),
      "Nazoratchi summa": num(c.supervisorSum),
      "Bosh buxgalter": c.chiefAccountant?.fullName ?? "",
      "Bosh bux. %": num(c.chiefAccountantPerc),
      "Bosh bux. summa": num(c.chiefAccountantSum),
      "Bank-klient": c.bankClient?.fullName ?? c.bankClientName ?? "",
      "Bank-klient %": num(c.bankClientPerc),
      "Bank-klient summa": num(c.bankClientSum),
      // Biriktiruv jadvali — lavozim ustunlaridan MUSTAQIL manba
      // (biriktiruv o'zgarishi uch joyda yoziladi, shuning uchun ikkalasi ham
      // faylda turadi va farq ko'rinadi).
      "Faol biriktiruvlar": c.contractAssignments
        .map((a) => `${a.user.fullName} (${a.role}, ${a.salaryType === "percent" ? `${a.salaryValue}%` : Number(a.salaryValue)})`)
        .join("; "),
    })),
  );

  // ── 3) MOLIYA / QARZDORLIK ────────────────────────────────
  addSheet(
    wb,
    "Moliya va qarzdorlik",
    companies.map((c) => {
      const d = debtBy.get(c.id);
      const paid = c.payments.filter((p) => p.period === PERIOD).reduce((s, p) => s + Number(p.amount), 0);
      return {
        "Korxona nomi": c.name,
        INN: c.inn,
        "Shartnoma summasi": num(c.contractAmount),
        [`To'landi (${PERIOD})`]: paid,
        "Jami hisoblangan": d ? d.charged : "",
        "Jami to'langan": d ? d.paid : "",
        "Qoldiq (avans = manfiy)": d ? d.outstanding : "",
        "Muddati o'tgan qarz": d ? d.overdue : "",
        "Shu oy yig'iladi": d ? d.dueNow : "",
        "Kechikkan oy": d ? d.monthsOverdue : "",
        "Kechikkan kun": d ? d.overdueDays : "",
        "Oxirgi to'lov davri": d?.lastPaidPeriod ?? "",
        "To'lov kuni": c.paymentDay ?? "",
        "Oxirgi aloqa": date(c.debtContactedAt),
        "Keyingi aloqa": date(c.debtNextContactAt),
        "Aloqa izohi": c.debtContactNote ?? "",
        Buxgalter: c.accountant?.fullName ?? "",
      };
    }),
  );

  // ── 4) XIZMATLAR (firma × ustun) ──────────────────────────
  // Bo'sh `activeServices` = "hammasi yoqilgan", to'lov yarmi esa hisobot
  // yarmidan meros oladi — matritsa aynan shunday o'qiydi (serviceEnabled).
  addSheet(
    wb,
    "Xizmatlar",
    companies.map((c) => {
      const row: Record<string, unknown> = {
        "Korxona nomi": c.name,
        INN: c.inn,
        "Yoqilgan xizmat soni": c.activeServices.length || "hammasi",
      };
      for (const col of BASE_REPORT_COLUMNS) {
        row[col.label] = serviceEnabled(c.activeServices, col.key) ? "✓" : "—";
        if (col.payKey) {
          row[`${col.label} — to'lov`] = serviceEnabled(c.activeServices, col.payKey, col.key) ? "✓" : "—";
        }
      }
      return row;
    }),
  );

  // ── 5) HISOBOT MATRITSASI (joriy davr) ────────────────────
  addSheet(
    wb,
    `Matritsa ${PERIOD}`,
    companies.map((c) => {
      const op = c.monthlyReports[0] as Record<string, unknown> | undefined;
      const cell = (key: string) => {
        const dbCol = FIELD_TO_DB_COLUMN[key as OperationFieldKey] ?? key;
        const v = op?.[dbCol];
        return v === null || v === undefined ? "" : String(v);
      };
      const row: Record<string, unknown> = {
        "Korxona nomi": c.name,
        INN: c.inn,
        Buxgalter: c.accountant?.fullName ?? "",
        "Soliq rejimi": REGIME_LABEL[c.taxRegime] ?? c.taxRegime,
      };
      for (const col of BASE_REPORT_COLUMNS) {
        row[col.label] = cell(col.key);
        if (col.payKey) row[`${col.label} — to'lov`] = cell(col.payKey);
      }
      row["Izoh"] = (op?.comment as string) ?? "";
      return row;
    }),
  );

  // ── 6) MAJBURIYATLAR (muddatlar) ──────────────────────────
  const obligationRows = companies.flatMap((c) =>
    c.obligations.map((o) => ({
      "Korxona nomi": c.name,
      INN: c.inn,
      "Shablon kodi": o.template.code,
      Majburiyat: o.template.name,
      Davr: o.periodKey,
      Muddat: date(o.dueAt),
      Holat: o.status,
      "Yuborilgan": date(o.sentAt),
      "Qabul qilingan": date(o.acceptedAt),
      Buxgalter: c.accountant?.fullName ?? "",
    })),
  );
  obligationRows.sort((a, b) => a["Korxona nomi"].localeCompare(b["Korxona nomi"]) || a.Muddat.localeCompare(b.Muddat));
  addSheet(wb, "Majburiyatlar", obligationRows);

  // ── 7) TO'LOVLAR TARIXI ───────────────────────────────────
  const paymentRows = companies.flatMap((c) =>
    c.payments.map((p) => ({
      "Korxona nomi": c.name,
      INN: c.inn,
      Davr: p.period,
      Summa: Number(p.amount),
      "To'lov sanasi": date(p.paymentDate),
      Holat: p.status,
      Usul: p.paymentMethod,
      Izoh: p.comment ?? "",
    })),
  );
  paymentRows.sort((a, b) => b.Davr.localeCompare(a.Davr) || a["Korxona nomi"].localeCompare(b["Korxona nomi"]));
  addSheet(wb, "To'lovlar", paymentRows);

  writeFile(wb, OUT);
  console.log(`\n✅ Tayyor: ${OUT}`);
  console.log(`   varaqlar: Firmalar(${companies.length}) · Mas'ullar · Moliya · Xizmatlar · Matritsa ${PERIOD} · Majburiyatlar(${obligationRows.length}) · To'lovlar(${paymentRows.length})`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
