/**
 * kpi-oylik.json ni V2 formatga o'tkazish
 * Har bir firmaning eski float koeffitsiyentlarini
 * yangi "state" + "coeff" formatiga aylantiradi.
 *
 * Ishlatish: node scripts/migrate_kpi_to_v2.js
 */
import fs from 'fs';
import path from 'path';

const kpiPath  = path.join(process.cwd(), 'kpi-oylik.json');
const outPath  = path.join(process.cwd(), 'kpi-oylik.json');

// Eski float → yangi {state, coeff} mantiq
// Har bir mezon uchun bog'liq qoidaga qarab state aniqlanadi
function toState(val, greenThresh, redThresh) {
  const n = Number(val);
  if (!Number.isFinite(n)) return { state: 'yellow', coeff: 0 };
  if (n > 0)  return { state: 'green',  coeff: n };
  if (n < 0)  return { state: 'red',    coeff: n };
  return { state: 'yellow', coeff: 0 };
}

// Select qoidalar uchun: +1 → green, 0 → yellow, -1 → red
function selectState(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return { state: 'yellow', coeff: 0 };
  if (n > 0)  return { state: 'green',  coeff: n };
  if (n < 0)  return { state: 'red',    coeff: n };
  return { state: 'yellow', coeff: 0 };
}

async function run() {
  console.log('=== kpi-oylik.json → V2 formatiga o\'tkazish ===\n');

  const raw = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));
  const firms = raw.KPI || [];

  const updated = firms.map((firm, i) => {
    const base = Number(firm['Shartnoma summasi']) * 0.01;

    // ---------- BUXGALTER ----------
    const acc_1c = selectState(firm['1c'] ?? firm['1C baza3'] ?? 0);
    const acc_didox      = selectState(firm['Didox'] ?? 0);
    const acc_xatlar     = selectState(firm['xatlar'] ?? 0);
    const acc_avtokameral= selectState(firm['Avtokameral'] ?? 0);
    const acc_mehnat     = selectState(firm[' мехнат'] ?? firm['mexnat'] ?? 0);
    const acc_cashflow   = selectState(firm['Pul oqimlari'] ?? 0);
    const acc_debitor    = selectState(firm['Debitor kreditor'] ?? 0);
    const acc_taxes      = selectState(firm['Chiqadigan soliqlar'] ?? 0);
    const acc_payroll    = selectState(firm['Hisoblangan oylik'] ?? 0);
    const acc_pnl        = selectState(firm['Foyda va zarar'] ?? 0);
    const acc_group      = selectState(firm['Gruppa buxgalter'] ?? 0);

    // ---------- BANK-KLIENT ----------
    const bank_attendance= selectState(firm['Ishga kelish bank klient'] ?? 0);
    const bank_group     = selectState(firm['Gruppa bank klient '] ?? 0);

    // ---------- NAZORATCHI ----------
    const sup_group      = selectState(firm['Nazoratchi'] ?? 0);
    const sup_kelish     = selectState(firm['Ishga vaqtida kelish nazoratchi'] ?? 0);

    // ---------- Hisoblangan KPI summalari ----------
    const accKpi = (
      acc_group.coeff +
      (acc_1c.coeff) +
      (acc_didox.coeff + acc_xatlar.coeff + acc_avtokameral.coeff + acc_mehnat.coeff) +
      (acc_cashflow.coeff + acc_debitor.coeff + acc_taxes.coeff + acc_payroll.coeff + acc_pnl.coeff)
    ) * base;

    const bankKpi = (bank_attendance.coeff + bank_group.coeff) * base;
    const supKpi  = sup_group.coeff * base;

    return {
      "№": firm['№'],
      "НАИМЕНОВАНИЯ": firm['НАИМЕНОВАНИЯ'],
      "Бухгалтер": firm['Бухгалтер'],
      "bank klient": firm['bank klient'],
      "Назоратчи": firm['Назоратчи'],
      "Shartnoma summasi": firm['Shartnoma summasi'],

      // ---------- Yangi V2 tuzilma ----------
      "kpi_states": {
        // Buxgalter
        "acc_group":       acc_group,
        "acc_1c_base":     acc_1c,
        "acc_didox":       acc_didox,
        "acc_soliq_xat":   acc_xatlar,
        "acc_avtokameral": acc_avtokameral,
        "acc_mehnat":      acc_mehnat,
        "acc_cashflow":    acc_cashflow,
        "acc_debitor":     acc_debitor,
        "acc_taxes_report":acc_taxes,
        "acc_payroll_report": acc_payroll,
        "acc_pnl_report":  acc_pnl,
        "acc_attendance":  { state: "yellow", early_days: 0, late_5min: 0 },
        "acc_group_response": acc_group,
        "acc_critical_error": { state: "green", coeff: 0 },
        "acc_absence":     { state: "green", absent_days: 0 },

        // Bank-klient
        "bank_attendance": bank_attendance,
        "bank_group_response": bank_group,
        "bank_personal_resp": { state: "yellow", coeff: 0 },
        "bank_wrong_transfer": { state: "green", coeff: 0 },
        "bank_absence":    { state: "green", absent_days: 0 },

        // Nazoratchi
        "sup_group_response": sup_group,
        "sup_reports_deadline": { state: "yellow", coeff: 0 },
        "sup_tax_reports": { state: "green", coeff: 0 },
        "sup_attendance":  sup_kelish,
        "sup_unresolved":  { state: "green", coeff: 0 },
        "sup_absence":     { state: "green", absent_days: 0 }
      },

      // ---------- Hisoblangan jami ----------
      "Buxgalter KPI": Math.round(accKpi),
      "Bank klient KPI": Math.round(bankKpi),
      "NazoratchiKPI": Math.round(supKpi)
    };
  });

  fs.writeFileSync(outPath, JSON.stringify({ KPI: updated }, null, 2), 'utf8');

  const greens  = updated.reduce((s, f) => s + Object.values(f.kpi_states).filter(v => v?.state === 'green').length, 0);
  const yellows = updated.reduce((s, f) => s + Object.values(f.kpi_states).filter(v => v?.state === 'yellow').length, 0);
  const reds    = updated.reduce((s, f) => s + Object.values(f.kpi_states).filter(v => v?.state === 'red').length, 0);

  console.log(`✅ ${updated.length} ta firma yangilandi.`);
  console.log(`🟢 Yashil holatlar:  ${greens}`);
  console.log(`🟡 Neytral holatlar: ${yellows}`);
  console.log(`🔴 Qizil holatlar:   ${reds}`);
}

run().catch(console.error);
