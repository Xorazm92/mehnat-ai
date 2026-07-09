import { Prisma } from "@prisma/client";

/**
 * Prisma Decimal obyektlari Server -> Client Component chegarasidan o'tolmaydi
 * ("Only plain objects can be passed to Client Components..." xatosi).
 * Bu funksiya har qanday qiymatni (obyekt/massiv/ichma-ich structure) chuqur
 * aylanib chiqib, Decimal'larni oddiy number'ga o'giradi. Date, string, boolean,
 * number, null va undefined o'zgarishsiz qoladi (Date RSC chegarasidan xavfsiz
 * o'tadi).
 *
 * Barcha server/*.ts eksport qilingan funksiyalar qaytarish joyida shu bilan
 * o'raladi: `return serialize(prisma.someModel.findMany(...))`.
 */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as unknown as Prisma.Decimal).toNumber() as unknown as T;
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => serialize(item)) as unknown as T;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      out[key] = serialize((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }

  return value;
}
