/**
 * MOBIL KARTOCHKA TARTIBI — ustun ta'riflaridan kartochka roli.
 *
 * `DataTable` telefonda jadval o'rniga kartochka chizadi va kartochka
 * MAZMUNI ustunlardan olinadi — shunda jadval va kartochka bir manbadan
 * oziqlanadi va vaqt o'tib ajralib keta olmaydi.
 *
 * Rol taqsimoti komponentdan ajratilgan, chunki u sof qaror: kirish —
 * ustunlar ro'yxati, chiqish — qaysi ustun qayerga tushishi. Sof bo'lgani
 * uchun uni React'siz, DOM'siz tekshirish mumkin (`mobileCardLayout.spec.ts`),
 * jadvalning o'zi esa integratsiya testiga qoladi.
 */

export type MobileRole = "title" | "meta" | "status" | "actions" | "hide" | "wide";

export interface MobileLayoutColumn {
  key: string;
  sticky?: boolean;
  numeric?: boolean;
  mobile?: MobileRole;
}

export interface MobileLayout<C> {
  title: C | null;
  meta: C | null;
  status: C | null;
  actions: C | null;
  /** Yorliqli maydonlar; `wide` — butun kenglikni egallaydi */
  fields: { column: C; wide: boolean }[];
}

/**
 * Ustunga rol beradi. Aniq `mobile` maslahati bo'lsa — o'sha; aks holda
 * oqilona taxmin: yopishqoq ustun (odatda identifikator) sarlavha,
 * `actions` kaliti amal qatori, birinchi ustun sarlavha, qolgani maydon.
 *
 * Taxmin muhim: 26 ta jadvalning har biriga qo'lda maslahat yozish kerak
 * bo'lsa, ko'pchiligi yozilmay qoladi va telefon foydalanuvchisi yana
 * gorizontal aylantiriladigan jadvalga qaytadi.
 */
export function roleOf(col: MobileLayoutColumn, index: number): MobileRole {
  if (col.mobile) return col.mobile;
  if (col.key === "actions") return "actions";
  if (col.sticky) return "title";
  if (index === 0) return "title";
  return "wide";
}

/**
 * Ustunlarni kartochka bo'laklariga taqsimlaydi.
 *
 * `constantKeys` — barcha qatorda bir xil qiymatli ustunlar. Ular jadvaldan
 * yuqoridagi chip qatoriga chiqarilgan, shuning uchun kartochkada ham
 * takrorlanmaydi.
 *
 * Har bir roldan faqat BITTASI olinadi: ikkita sarlavha yoki ikkita nishon
 * kartochkani buzardi. Ortiqchasi oddiy maydonga tushadi — ma'lumot
 * yo'qolmaydi, faqat joyi o'zgaradi.
 */
export function buildMobileLayout<C extends MobileLayoutColumn>(
  columns: C[],
  constantKeys: ReadonlySet<string> = new Set()
): MobileLayout<C> {
  const pool = columns.filter((c) => !constantKeys.has(c.key));
  const roles = pool.map((c, i) => roleOf(c, i));

  const takeFirst = (role: MobileRole): { col: C | null; index: number } => {
    const index = roles.findIndex((r) => r === role);
    return { col: index === -1 ? null : pool[index], index };
  };

  const t = takeFirst("title");
  const m = takeFirst("meta");
  const s = takeFirst("status");
  const a = takeFirst("actions");

  // Sarlavha yo'q bo'lsa (hamma ustunga aniq rol berilgan bo'lsa) birinchi
  // ustun sarlavha bo'ladi — kartochka nomsiz qolmasin.
  const titleIndex = t.index === -1 && pool.length > 0 ? 0 : t.index;
  const title = t.col ?? (pool.length > 0 ? pool[0] : null);

  const claimed = new Set([titleIndex, m.index, s.index, a.index].filter((i) => i !== -1));

  const fields = pool
    .map((column, i) => ({ column, i }))
    .filter(({ i }) => !claimed.has(i) && roles[i] !== "hide")
    .map(({ column }) => ({
      column,
      // Raqamli ustun tor (ikki ustunli grid), matnli ustun keng.
      wide: !column.numeric,
    }));

  return { title, meta: m.col, status: s.col, actions: a.col, fields };
}
