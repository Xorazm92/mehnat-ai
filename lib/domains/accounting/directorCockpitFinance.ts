// =====================================================
// DIREKTOR KOKPITI — MOLIYAVIY BLOK (M4)
// =====================================================
// MUAMMO. `lib/directorReport.ts` direktorga kerak bo'lgan hamma raqamni
// allaqachon hisoblaydi — balans, qarzdorlik, kutayotgan tasdiqlar, bank
// sverkasi, reja/fakt. Lekin u FAQAT ertalabki Telegram hisobotida
// ishlatilardi (09:00). Veb-kokpit esa moliyani umuman import qilmasdi, ya'ni
// direktor bir xil savolga ikki kanaldan ikki xil to'liqlikda javob olardi:
// Telegramda pul bor, ekranda yo'q.
//
// NEGA QAYTA HISOBLAMAYMIZ. Bu fayl `buildDirectorReport` ni CHAQIRADI va
// undan oltita ko'rsatkichni proyeksiya qiladi. Ikkinchi nusxa yozilsa, ikki
// kanal albatta ajralib ketardi — va aynan shu ajralish M4 da tuzatilayotgan
// nuqson edi.
//
// AKTYOR PARAMETRI YO'Q — ATAYLAB. `buildDirectorReport` butun korxona
// bo'yicha hisoblaydi (doira filtri yo'q), va bu to'g'ri: blok FAQAT
// direktorga ko'rsatiladi, direktor esa `companyScopeWhere` bo'yicha hamma
// firmani ko'radi. Ishlatilmaydigan `actor` argumenti qo'shish "doira
// qo'llanadi" degan yolg'on va'da bo'lardi. Rol darvozasi — chaqiruvchi
// qatlamda (`server/directorCockpit.ts`).
import type { Prisma } from "@prisma/client";
import { buildDirectorReport } from "@/lib/directorReport";

type Db = Prisma.TransactionClient;

/** Modalda tasdiqlanadigan kutayotgan xarajat — bir bosishlik ish uchun. */
export interface PendingExpenseRow {
  id: string;
  category: string;
  amount: number;
  date: string;
  companyName: string | null;
  description: string | null;
}

export interface DirectorCockpitFinance {
  /** Hisobot qaysi kun uchun (kecha) — `buildDirectorReport` bilan bir xil. */
  forDate: string;
  /** Joriy mavjud mablag' (`lib/balance.ts` `getAvailableBalance`). */
  balance: number;
  yesterday: { income: number; outflow: number };
  debt: {
    /** Jami qoldiq (joriy oy ishi ham ichida). */
    total: number;
    /** Muddati o'tgan — aralashuv talab qiladigan raqam. */
    overdueTotal: number;
    /** 31-60 kun + 60+ kun bosqichlari yig'indisi. */
    over30Amount: number;
    /**
     * 30+ kunlik qarzning MUDDATI O'TGAN qarzdagi ulushi (0-100).
     *
     * Maxraj `overdueTotal`, `total` EMAS: qarilik matritsasi faqat muddati
     * o'tgan qarzni bosqichlarga ajratadi, joriy oy ishi unda umuman yo'q.
     * `total` ga bo'lish ulushni sun'iy ravishda kichraytirardi.
     * Muddati o'tgan qarz bo'lmasa — `null` (0% emas: bo'linma mavjud emas).
     */
    over30Share: number | null;
  };
  /** Kutayotgan tasdiqlar — xarajat va dalil alohida. */
  pending: { expenses: number; proofs: number };
  /** Hal qilinmagan vipiska qatorlari — ikki xil ish, alohida sanaladi. */
  unmatchedBank: { income: number; expense: number };
  /** Joriy oy tushum rejasi. Reja qo'yilmagan bo'lsa `null`. */
  plan: { period: string; plan: number; fact: number; percent: number } | null;
  /** Modalda tasdiqlash uchun — eng yirigidan. */
  pendingExpenses: PendingExpenseRow[];
}

/** Modalda ko'rsatiladigan kutayotgan xarajatlar soni. */
const PENDING_LIMIT = 8;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Kokpitning moliyaviy bloki uchun ma'lumot.
 *
 * `now` argument — testda deterministik bo'lsin; berilmasa joriy vaqt.
 */
export async function getDirectorCockpitFinance(
  db: Db,
  opts: { now?: Date } = {},
): Promise<DirectorCockpitFinance> {
  const now = opts.now ?? new Date();

  const [report, pendingExpenses] = await Promise.all([
    buildDirectorReport(db, now),
    db.kassaEntry.findMany({
      where: { type: "expense", status: "pending", deletedAt: null },
      // `KassaEntry.companyId` — oddiy ustun, bog'lanish EMAS (ofis xarajati
      // firmaga bog'lanmasligi mumkin), shuning uchun nomlar quyida alohida
      // o'qiladi. Ro'yxat 8 tagacha, ya'ni bu bitta qo'shimcha so'rov.
      select: {
        id: true,
        category: true,
        amount: true,
        date: true,
        description: true,
        companyId: true,
      },
      // Eng yirigi tepada: direktorning e'tibori shunga kerak.
      orderBy: { amount: "desc" },
      take: PENDING_LIMIT,
    }),
  ]);

  const companyIds = [...new Set(pendingExpenses.map((e) => e.companyId).filter((v): v is string => !!v))];
  const companyNames = new Map(
    companyIds.length === 0
      ? []
      : (
          await db.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, name: true },
          })
        ).map((c) => [c.id, c.name] as const),
  );

  const st = report.agingMatrix.stages;
  const over30Amount = r2(st.suspension.totalAmount + st.critical.totalAmount);
  const overdueTotal = report.debt.overdueTotal;

  return {
    forDate: report.forDate.toISOString(),
    balance: report.balance.balance,
    yesterday: report.yesterday,
    debt: {
      total: report.debt.total,
      overdueTotal,
      over30Amount,
      over30Share: overdueTotal > 0 ? Math.round((over30Amount / overdueTotal) * 100) : null,
    },
    pending: report.pending,
    unmatchedBank: report.unmatchedBank,
    plan: report.plan,
    pendingExpenses: pendingExpenses.map((e) => ({
      id: e.id,
      category: e.category,
      amount: Number(e.amount),
      date: e.date.toISOString(),
      companyName: e.companyId ? (companyNames.get(e.companyId) ?? null) : null,
      description: e.description,
    })),
  };
}
