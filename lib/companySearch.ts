// lib/companySearch.ts
// Firmalar ro'yxatidagi qidiruv — va u NIMA BO'YICHA topganini aytish.
//
// MUAMMO: qidiruv nom, STIR va DIREKTOR ismi bo'yicha ishlaydi, lekin
// jadvalda direktor ustuni YO'Q. Natijada "fax" deb yozgan odam nomida
// "fax" bo'lmagan qatorni ko'rib, tizimni o'xshashlik (fuzzy) izlayapti deb
// o'ylardi. Hech qanday o'xshashlik yo'q — moslik aniq substring, faqat
// SABABI ekranda ko'rinmagan.
//
// Shu sabab bu modul `boolean` emas, MOS KELGAN MAYDONLARNI qaytaradi:
// jadval o'sha sababni qator ostida ko'rsata oladi.

/** Qidiruv tekshiradigan maydonlar. */
export type CompanyMatchField = "name" | "brand" | "inn" | "director";

export interface CompanySearchSubject {
  name?: string | null;
  brandName?: string | null;
  inn?: string | null;
  directorName?: string | null;
}

/** Maydonlar tartibi ATAYLAB: eng kutilgan moslik birinchi. */
const FIELD_ORDER: readonly CompanyMatchField[] = ["name", "brand", "inn", "director"];

const valueOf = (s: CompanySearchSubject, f: CompanyMatchField): string => {
  switch (f) {
    case "name": return s.name ?? "";
    case "brand": return s.brandName ?? "";
    case "inn": return s.inn ?? "";
    case "director": return s.directorName ?? "";
  }
};

/**
 * So'rov qaysi maydonlarga mos keldi.
 *
 * Bo'sh so'rov — bo'sh massiv (ya'ni "filtr yo'q", `matchesCompanySearch`
 * hammasini o'tkazadi). Registr va chetdagi bo'shliq ahamiyatsiz.
 */
export function matchedFields(
  subject: CompanySearchSubject,
  query: string,
): CompanyMatchField[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return [];
  return FIELD_ORDER.filter((f) => valueOf(subject, f).toLowerCase().includes(q));
}

/** Qator qidiruvga mos keladimi. Bo'sh so'rov — hamma qator mos. */
export function matchesCompanySearch(subject: CompanySearchSubject, query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;
  return matchedFields(subject, q).length > 0;
}

/**
 * KO'RINMAS moslik: qator faqat ekranda chizilmagan maydon bo'yicha topilgan.
 *
 * Jadvalda nom, brend va STIR bor, direktor esa YO'Q — shuning uchun faqat
 * direktorga mos kelgan qator "nega chiqdi?" degan savol tug'diradi. Bu
 * funksiya aynan shu holatni belgilaydi, jadval esa sababni yozib qo'yadi.
 */
export function hiddenMatchOnly(subject: CompanySearchSubject, query: string): boolean {
  const hits = matchedFields(subject, query);
  return hits.length > 0 && hits.every((f) => f === "director");
}
