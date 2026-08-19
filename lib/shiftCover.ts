// =====================================================
// YO'QLIK PULINI O'RINBOSARGA O'TKAZISH (sof mantiq)
// =====================================================
// Reglament uch joyda bir xil narsani aytadi: yo'qlik uchun yechilgan pul
// YO'QOLMAYDI — o'sha kuni ishni bajargan xodimga o'tadi.
//   - "Bir oy davomida ishga kelmagan har kun uchun -1%, o'sha kungi oylik
//      o'rniga ishlab turgan nazoratchiga beriladi" (buxgalter)
//   - bank-klient va nazoratchi uchun -0.25%
//   - mehnat ta'tili: 15 kun, maoshining 50% saqlanadi, qolgan 50% o'rinbosarga
//
// Sof va DB'siz test qilinadi; yozuv server/shiftCover.ts da.

export interface CoverInput {
  date: Date;
  absentUserId: string;
  coverUserId: string;
  /** null = xodimning BARCHA firmalari bo'yicha o'rinbosarlik. */
  companyId: string | null;
  kind: string; // 'absence' | 'vacation'
}

export interface CompanyBase {
  companyId: string;
  /** KPI foizi qo'llanadigan baza — shartnoma summasi (qaror #1). */
  contractAmount: number;
}

export interface CoverTransfer {
  coverUserId: string;
  absentUserId: string;
  companyId: string;
  amount: number;
  days: number;
  kind: string;
}

/** Ta'tilda kunlik ulushning yarmi xodimda qoladi, yarmi o'rinbosarga. */
export const VACATION_COVER_SHARE = 0.5;

/**
 * Bir xodimning bir oydagi yo'qlik kunlarini pul o'tkazmalariga aylantiradi.
 *
 * @param covers          shu xodim uchun ShiftCover qatorlari (bir kun = bir qator)
 * @param companies       xodim xizmat qiladigan firmalar va ularning shartnomasi
 * @param absencePercent  rolga mos kunlik jarima foizi, MUSBAT son (masalan 1 yoki 0.25)
 *
 * Bir kunda bir nechta firma bo'yicha yo'qlik bo'lsa, har firma alohida
 * hisoblanadi — jarima ham aynan shunday firma-bo'yicha yechiladi, ya'ni
 * o'tkazma jarimaga TENG bo'ladi va pul o'ylab topilmaydi.
 */
export function computeCoverTransfers(
  covers: CoverInput[],
  companies: CompanyBase[],
  absencePercent: number
): CoverTransfer[] {
  if (absencePercent <= 0 || companies.length === 0) return [];

  // Bitta xodim bir kunda bitta smena bajaradi.
  // companyId = null (global) yozuvi companyId = X (firma) yozuvidan ustun turadi.
  const byDate = new Map<string, CoverInput>();
  for (const c of covers) {
    const dStr = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : new Date(c.date).toISOString().slice(0, 10);
    const existing = byDate.get(dStr);
    if (!existing) {
      byDate.set(dStr, c);
    } else if (existing.companyId !== null && c.companyId === null) {
      byDate.set(dStr, c);
    }
  }
  const dedupedCovers = Array.from(byDate.values());

  const byCompany = new Map<string, CompanyBase>();
  for (const c of companies) byCompany.set(c.companyId, c);

  // (cover, company, kind) bo'yicha yig'amiz — bitta xodimga bitta qator.
  const acc = new Map<string, CoverTransfer>();

  for (const cover of dedupedCovers) {
    if (cover.coverUserId === cover.absentUserId) continue;

    const targets = cover.companyId
      ? ([byCompany.get(cover.companyId)].filter(Boolean) as CompanyBase[])
      : companies;

    const share = cover.kind === "vacation" ? VACATION_COVER_SHARE : 1;

    for (const target of targets) {
      const amount = (target.contractAmount * absencePercent) / 100 * share;
      if (amount <= 0) continue;

      const key = `${cover.coverUserId}|${target.companyId}|${cover.kind}`;
      const row =
        acc.get(key) ??
        {
          coverUserId: cover.coverUserId,
          absentUserId: cover.absentUserId,
          companyId: target.companyId,
          amount: 0,
          days: 0,
          kind: cover.kind,
        };
      row.amount += amount;
      row.days += 1;
      acc.set(key, row);
    }
  }

  // Tiyin-darajadagi suzuvchi nuqta qoldiqlarini yo'qotamiz.
  return [...acc.values()].map((t) => ({ ...t, amount: Math.round(t.amount * 100) / 100 }));
}
