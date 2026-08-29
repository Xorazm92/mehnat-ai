// =====================================================
// ROL KONTEKSTI — bitta odam, bir necha vazifa
// =====================================================
//
// ASRO'da LAVOZIM (`User.role`) va FIRMADAGI VAZIFA bir narsa emas. Prodda
// real holat:
//
//   Go'zaloy   lavozimi nazoratchi  → 8 firmada buxgalter, 132 tasida nazoratchi
//   Ruslan     lavozimi bank-klient → 65 firmada bank klient, 10 tasida buxgalter
//   Zamira     lavozimi buxgalter   → 14 buxgalter, 16 nazoratchi, 2 bank klient
//
// Bungacha `companyScopeWhere` hamma biriktiruvni OR bilan birlashtirardi,
// ya'ni Go'zaloy 140 ta firmani ARALASH ko'rardi va qaysi biriga qaysi
// sifatda javob berishini ajrata olmasdi.
//
// Endi u kontekst tanlaydi. Kontekst — KO'RINISH filtri, huquq emas:
// tanlov faqat ro'yxatni toraytiradi, hech qachon kengaytirmaydi. Shuning
// uchun uni cookie'da saqlash xavfsiz — hujumchi cookie'ni o'zgartirib
// begona firmani ko'ra olmaydi, chunki asos baribir biriktiruv.

import type { CompanyRelation } from "@/lib/platform/access";

/** "all" — barcha biriktiruvlar birga (standart, eski xatti-harakat). */
export type RoleContext = CompanyRelation | "all";

export const ROLE_CONTEXT_COOKIE = "asro.ctx";

export const ROLE_CONTEXT_LABELS: Record<RoleContext, string> = {
  all: "Barcha firmalarim",
  accountant: "Buxgalter sifatida",
  supervisor: "Nazoratchi sifatida",
  chief_accountant: "Bosh buxgalter sifatida",
  bank_manager: "Bank klient sifatida",
};

const VALID: RoleContext[] = ["all", "accountant", "supervisor", "chief_accountant", "bank_manager"];

/** Cookie'dan kelgan (ishonchsiz) qiymatni tozalaydi. */
export function parseRoleContext(raw: string | undefined | null): RoleContext {
  return VALID.includes(raw as RoleContext) ? (raw as RoleContext) : "all";
}

export interface ContextOption {
  context: RoleContext;
  label: string;
  /** Shu kontekstda nechta firma ko'rinadi. */
  count: number;
}

/**
 * Foydalanuvchida qaysi kontekstlar bor.
 *
 * Faqat HAQIQATAN biriktiruvi bor kontekst qaytariladi — bo'sh tanlov
 * ko'rsatish foydalanuvchini chalkashtiradi. Bitta kontekst bo'lsa
 * almashtirgichni umuman ko'rsatmaslik kerak (`options.length <= 1`).
 */
export async function resolveContexts(
  db: {
    company: {
      count(args: unknown): Promise<number>;
    };
  },
  userId: string,
  isAdmin: boolean
): Promise<ContextOption[]> {
  // Admin hamma firmani ko'radi — u uchun kontekst tushunchasi yo'q.
  if (isAdmin) return [];

  const relations: CompanyRelation[] = [
    "accountant",
    "supervisor",
    "chief_accountant",
    "bank_manager",
  ];
  const field: Record<CompanyRelation, string> = {
    accountant: "accountantId",
    supervisor: "supervisorId",
    chief_accountant: "chiefAccountantId",
    bank_manager: "bankClientId",
  };

  const counts = await Promise.all(
    relations.map((r) =>
      db.company.count({ where: { isActive: true, isOwnFirm: false, [field[r]]: userId } })
    )
  );

  const options: ContextOption[] = [];
  let total = 0;
  relations.forEach((r, i) => {
    if (counts[i] > 0) {
      options.push({ context: r, label: ROLE_CONTEXT_LABELS[r], count: counts[i] });
      total += counts[i];
    }
  });

  // Bitta vazifa bo'lsa tanlashning ma'nosi yo'q.
  if (options.length <= 1) return [];
  return [{ context: "all", label: ROLE_CONTEXT_LABELS.all, count: total }, ...options];
}
