// =====================================================
// SCHYOT SATRLARINI YIG'ISH — sof mantiq
// =====================================================
//
// Ikki manba bor va tartib MUHIM:
//
//   1. `CompanyService` — mijoz aynan nima uchun to'laydi. Satrlar shundan
//      chiqadi va hujjat "buxgalteriya 2 000 000, kadrlar 500 000" deb
//      o'qiladi.
//   2. `CompanyServiceTerm.totalAmount` — hisob-kitobning yagona manbai
//      (undan oylik Payment generatsiya qilinadi).
//
// Xizmat biriktirilmagan firmada (hozircha ko'pchiligi shunday) satr yo'q,
// lekin schyot baribir yozilishi kerak — shuning uchun bitta yig'ma satr
// tushadi. Xizmatlar bor, lekin yig'indisi termdan farq qilsa, FARQ
// SATRI qo'shiladi: hujjatning jami summasi shartnoma summasidan
// og'ib ketishi mumkin emas, aks holda mijoz bir summa ko'rib, undan
// boshqasini to'lardi.

export interface BuildLineInput {
  serviceId: string;
  name: string;
  price: number;
  qty: number;
}

export interface BuiltLine {
  serviceId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface BuiltInvoice {
  lines: BuiltLine[];
  total: number;
  /** Xizmatlar yig'indisi termdan farq qilgani — chaqiruvchi ogohlantirsin. */
  adjustment: number;
}

export function buildInvoiceLines(input: {
  services: BuildLineInput[];
  termTotal: number;
  /** Yig'ma satr matni (xizmat biriktirilmagan firma uchun). */
  fallbackLabel?: string;
}): BuiltInvoice {
  const term = Number.isFinite(input.termTotal) ? input.termTotal : 0;
  const priced = input.services.filter((s) => s.price > 0 && s.qty > 0);

  if (priced.length === 0) {
    return {
      lines: [
        {
          serviceId: null,
          description: input.fallbackLabel ?? "Buxgalteriya xizmati",
          qty: 1,
          unitPrice: term,
          amount: term,
          sortOrder: 0,
        },
      ],
      total: term,
      adjustment: 0,
    };
  }

  const lines: BuiltLine[] = priced.map((s, i) => ({
    serviceId: s.serviceId,
    description: s.name,
    qty: s.qty,
    unitPrice: s.price,
    amount: s.price * s.qty,
    sortOrder: i,
  }));

  const sum = lines.reduce((a, l) => a + l.amount, 0);
  // 1 so'mgacha farq — yaxlitlash, satr qo'shishga arzimaydi.
  const adjustment = Math.abs(sum - term) < 1 ? 0 : term - sum;

  if (adjustment !== 0) {
    lines.push({
      serviceId: null,
      description: adjustment > 0 ? "Shartnoma bo'yicha qo'shimcha" : "Shartnoma bo'yicha chegirma",
      qty: 1,
      unitPrice: adjustment,
      amount: adjustment,
      sortOrder: lines.length,
    });
  }

  return { lines, total: term, adjustment };
}

/**
 * Yil ichida ketma-ket raqam: "2026-0042".
 *
 * Oxirgi raqamdan chiqariladi — alohida hisoblagich jadval qo'shilmadi,
 * chunki u ikkinchi haqiqat manbai bo'lardi va bekor qilingan schyotdan
 * keyin uzilib qolardi. Ketma-ketlik uzluksizligi Serializable
 * tranzaksiya + `Invoice.number` UNIQUE bilan ta'minlanadi.
 */
export function nextInvoiceNumber(year: number, lastNumber: string | null): string {
  const prefix = String(year);
  let seq = 0;
  if (lastNumber && lastNumber.startsWith(`${prefix}-`)) {
    const n = Number(lastNumber.slice(prefix.length + 1));
    if (Number.isFinite(n)) seq = n;
  }
  return `${prefix}-${String(seq + 1).padStart(4, "0")}`;
}
