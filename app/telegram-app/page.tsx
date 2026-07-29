import TelegramHandshake from "./TelegramHandshake";

export const metadata = { title: "ASRO — kirish" };

/**
 * Mini App kirish nuqtasi. Ataylab ochiq sahifa (proxy.ts): sessiya aynan shu
 * yerda `initData` orqali yaratiladi, shuning uchun uni himoyalash "kirish
 * uchun avval kiring" degan halqa hosil qilardi.
 */
export default async function TelegramAppEntry({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  // Faqat ichki yo'l qabul qilinadi — ochiq redirect himoyasi.
  const next =
    sp.next && sp.next.startsWith("/telegram-app") && !sp.next.startsWith("//")
      ? sp.next
      : "/telegram-app/dashboard";

  return <TelegramHandshake next={next} />;
}
