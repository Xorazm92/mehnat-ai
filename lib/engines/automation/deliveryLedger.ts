// =====================================================
// YETKAZISH DAFTARI — NotificationDelivery.status ning yagona egasi
// =====================================================
//
// NEGA BU MODUL BOR. `NotificationDelivery` bir vaqtda ikki ishni bajaradi:
// (1) idempotentlik daftari — @@unique([channel, dedupKey]) bir hodisani bir
// martaga qulflaydi, (2) yetkazish yozuvi — nima bo'lgani. Status esa oltita
// joyda qo'l ostidagi o'zgaruvchidan yozilardi va natijada YOLG'ON gapirardi:
//
//   obligationSweep — Telegramga urinishdan OLDIN `sent` yozardi. Yuborish
//     xato bersa faqat log qolardi, kalit esa band bo'lib turardi: xabar
//     BUTUNLAY yo'qolardi va hech qachon qayta urinilmasdi.
//   obligationSweep — `inapp` kanalida ham `sent`, holbuki u yerda hech narsa
//     yuborilmaydi; qator shunchaki dedup tokeni.
//   lib/notify.ts — BullMQ navbatiga qo'yilganda `sent`, ya'ni yetkazilgani
//     noma'lum bo'lsa ham.
//   escalation / directorReport — qabul qiluvchining Telegrami yo'q bo'lsa
//     `failed`, holbuki in-app xabar muvaffaqiyatli yozilgan. Lokal bazada
//     13 592 `failed` / 0 `sent` — statusdan hech qanday xulosa chiqmasdi.
//
// QOIDA: avval `claim` (pending) → urinish → `settle` HAQIQIY natija bilan.
// `sent` hech qachon `await` dan oldin yozilmaydi.
//
// KALITNI BO'SHATISH. `settle(..., "failed")` qatorni O'CHIRADI. Sabab: dedup
// kaliti "bu xabar allaqachon yetib bordi" degani bo'lishi kerak, "bir marta
// urinib ko'rildi" degani emas. O'tkinchi xato (tarmoq, 429, Redis) da kalit
// band qolsa, xabar abadiy yo'qoladi. `unreachable` (403 — bloklangan yoki
// /start bosilmagan) da esa kalit SAQLANADI: qayta urinishning ma'nosi yo'q va
// har sweepda 403 olishning ham.
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

/**
 * `NotificationDelivery.status` ning to'liq alifbosi. Boshqa qiymat yozilmaydi.
 *
 *  claimed     — kalit band qilindi, yuborish KO'ZDA TUTILMAGAN (dedup tokeni).
 *  pending     — kalit band qilindi, urinish oldinda.
 *  queued      — navbatga qo'yildi; yetkazilgani hali NOMA'LUM.
 *  sent        — provayder qabul qildi (faqat urinishdan keyin yoziladi).
 *  unreachable — doimiy rad: bloklangan, /start bosmagan, chat yo'q.
 *  skipped     — ataylab yuborilmadi: Telegram ulanmagan, byudjet, token yo'q.
 *  failed      — o'tkinchi xato. Bu status DISKDA QOLMAYDI: qator o'chiriladi.
 */
export type DeliveryStatus =
  | "claimed"
  | "pending"
  | "queued"
  | "sent"
  | "unreachable"
  | "skipped"
  | "failed";

/** `settle` qabul qiladigan natijalar (`pending`/`claimed` — faqat `claim` yozadi). */
export type SettleOutcome = "queued" | "sent" | "unreachable" | "skipped" | "failed";

/**
 * Bitta yuborish urinishining natijasi — `lib` va `bot` qatlamlari o'rtasidagi
 * kelishuv. Yuboruvchi adapterlar (bot/contexts/.../interface/*-sender.ts)
 * `boolean` emas, shuni qaytaradi: `false` "403 mi, tarmoq mi, tezlik chegarasi
 * mi" degan savolga javob bermasdi, holbuki uchtasi uch xil muomala talab
 * qiladi.
 */
export type SendVerdict = Extract<SettleOutcome, "sent" | "unreachable" | "failed">;

export interface ClaimInput {
  channel: string;
  dedupKey: string;
  recipientId?: string | null;
  targetChatId?: bigint | null;
  /** 'yellow' | 'orange' | 'red' — ustun NOT NULL, ma'nosi kanalga bog'liq. */
  level?: string;
  /**
   * "token"  — bu qator faqat dedup uchun, hech narsa yuborilmaydi → `claimed`.
   * "attempt" — yuborish oldinda → `pending` (default).
   */
  mode?: "token" | "attempt";
}

export function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  if (typeof e === "object" && e !== null) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") return true;
    if (typeof err.message === "string" && err.message.includes("Unique constraint failed")) return true;
  }
  return false;
}

/**
 * Kalitni band qiladi. `null` ⇒ allaqachon band (hech narsa qilinmaydi).
 *
 * Avval arzon o'qish, keyin `create`: unikal indeksga urilish Prisma'ning
 * konsolga qizil log yozishiga sabab bo'ladi, holbuki takror chaqiruv — bu
 * yerda KUTILGAN holat, hodisa emas. Poyga baribir `create` ning P2002 si
 * bilan yopiladi, o'qish faqat shovqinni kamaytiradi.
 */
export async function claim(db: Db, input: ClaimInput): Promise<string | null> {
  const existing = await db.notificationDelivery.findUnique({
    where: { channel_dedupKey: { channel: input.channel, dedupKey: input.dedupKey } },
    select: { id: true },
  });
  if (existing) return null;

  try {
    const row = await db.notificationDelivery.create({
      data: {
        channel: input.channel,
        level: input.level ?? "yellow",
        dedupKey: input.dedupKey,
        recipientId: input.recipientId ?? null,
        targetChatId: input.targetChatId ?? null,
        status: input.mode === "token" ? "claimed" : "pending",
        ...(input.mode === "token" ? { sentAt: null } : {}),
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

/**
 * Urinish natijasini yozadi.
 *
 * `failed` (o'tkinchi) — qator o'chiriladi va kalit bo'shaydi, ya'ni keyingi
 * yurish xabarni QAYTA yuboradi. Qolgan hollarda status yangilanadi va kalit
 * band bo'lib qoladi.
 *
 * `sentAt` faqat haqiqiy jo'natish vaqtida to'ldiriladi (`sent`/`queued`) —
 * `skipped`/`unreachable` da u bo'sh qoladi, chunki hech qachon jo'natilmagan.
 */
export async function settle(db: Db, deliveryId: string, outcome: SettleOutcome, now = new Date()): Promise<void> {
  if (outcome === "failed") {
    await db.notificationDelivery.delete({ where: { id: deliveryId } }).catch(() => {
      // Boshqa yurish allaqachon o'chirgan bo'lishi mumkin — maqsad "kalit
      // bo'sh bo'lsin", "aynan biz o'chirdik" emas.
    });
    return;
  }
  await db.notificationDelivery.update({
    where: { id: deliveryId },
    data: {
      status: outcome,
      sentAt: outcome === "sent" || outcome === "queued" ? now : null,
    },
  });
}

/**
 * Bir kanaldagi allaqachon band qilingan kalitlar — BITTA so'rovda.
 *
 * Soatlik sweep minglab majburiyat ustidan yuradi va ularning aksariyati
 * allaqachon qulflangan bo'ladi; har biri uchun alohida `findUnique` qilish
 * sweepni N+1 ga aylantiradi.
 */
export async function claimedKeys(db: Db, channel: string, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (keys.length === 0) return out;
  const rows = await db.notificationDelivery.findMany({
    where: { channel, dedupKey: { in: keys } },
    select: { dedupKey: true },
  });
  for (const r of rows) if (r.dedupKey) out.add(r.dedupKey);
  return out;
}
