import type { PrismaClient } from "@prisma/client";
import { encodeCallback, packChatId, packUuid, unpackChatId, unpackUuid } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";
import { cbButton, gridKeyboard, inlineKeyboard } from "../../../telegram/keyboard";
import type { CallbackOutcome, OutboundMessage } from "../../interaction/domain/outbound";
import type { InboundChatMember } from "../../monitoring/domain/inbound-message";
import { authorizeAdmin } from "./authorize";
import { bindGroupToCompany } from "./bind-group";

/** Companies per page. Eight buttons still fit one phone screen. */
export const BIND_PAGE_SIZE = 8;

export interface UnboundCompany {
  id: string;
  name: string;
  inn: string;
}

export interface UnboundPage {
  companies: UnboundCompany[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Active companies with no live Telegram group yet — the candidates offered
 * when the bot lands in a new chat. Paginated because the firm runs hundreds of
 * companies and Telegram keyboards are not scrollable in any useful way.
 */
export async function listUnboundCompanies(
  prisma: PrismaClient,
  page = 0,
): Promise<UnboundPage> {
  const where = { isActive: true, telegramGroups: { none: { isActive: true } } };
  const total = await prisma.company.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / BIND_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, inn: true },
    orderBy: { name: "asc" },
    skip: safePage * BIND_PAGE_SIZE,
    take: BIND_PAGE_SIZE,
  });
  return { companies, page: safePage, totalPages, total };
}

/** The picker keyboard for one page of candidates. */
function pickerKeyboard(secret: string, chatId: bigint, page: UnboundPage) {
  const chat = packChatId(chatId);
  const rows = gridKeyboard(
    page.companies.map((c) =>
      cbButton(c.name, encodeCallback(secret, ACTION.BIND_PICK, `${chat}:${packUuid(c.id)}`)),
    ),
  ).inline_keyboard;

  const nav = [];
  if (page.page > 0) {
    nav.push(cbButton("◀️", encodeCallback(secret, ACTION.BIND_PAGE, `${chat}:${page.page - 1}`)));
  }
  if (page.page < page.totalPages - 1) {
    nav.push(cbButton("▶️", encodeCallback(secret, ACTION.BIND_PAGE, `${chat}:${page.page + 1}`)));
  }
  return inlineKeyboard([...rows, nav]);
}

function pickerText(title: string | undefined, page: UnboundPage): string {
  const head = `🔗 "${title ?? "Nomsiz guruh"}" guruhi qaysi korxonaga tegishli?`;
  if (page.total === 0) {
    return `${head}\n\nBiriktirilmagan korxona qolmadi. Avval ERP'da korxona qo'shing.`;
  }
  const pager = page.totalPages > 1 ? `\n\nSahifa ${page.page + 1}/${page.totalPages}` : "";
  return `${head}${pager}`;
}

/**
 * The bot was added to a chat. Instead of waiting for someone to remember
 * `/bind <INN>`, record the chat straight away and DM whoever added the bot a
 * one-tap picker of unbound companies.
 *
 * The chat row is created with `companyId: null` immediately so the group is
 * never invisible while the picker sits unanswered — and so a company can be
 * attached later without needing the original update.
 *
 * Returns the messages to deliver; the caller performs the I/O.
 */
export async function handleBotAddedToGroup(
  prisma: PrismaClient,
  ev: InboundChatMember,
  opts: { secret: string },
): Promise<OutboundMessage[]> {
  // Private chats are the user's own conversation with the bot, not a company.
  if (!ev.joined || ev.chatType === "private") return [];

  const existing = await prisma.telegramGroup.findUnique({
    where: { chatId: ev.chatId },
    select: { companyId: true, company: { select: { name: true } } },
  });

  // Register (or refresh) the chat without touching an existing binding.
  await prisma.telegramGroup.upsert({
    where: { chatId: ev.chatId },
    create: { chatId: ev.chatId, companyId: null, title: ev.chatTitle ?? null, isActive: true },
    update: { title: ev.chatTitle ?? undefined, isActive: true },
  });

  // Only admins may see the company list, so a staffer adding the bot leaks
  // nothing. They also get no prompt — silence is the designed group behaviour.
  const authz = await authorizeAdmin(prisma, ev.actorTelegramId);
  if (!authz.admin) return [];

  if (existing?.companyId) {
    return [
      {
        chatId: ev.actorTelegramId,
        text: `ℹ️ "${ev.chatTitle ?? ev.chatId}" allaqachon "${existing.company?.name}" korxonasiga bog'langan.`,
        bestEffort: true,
      },
    ];
  }

  const page = await listUnboundCompanies(prisma, 0);
  return [
    {
      chatId: ev.actorTelegramId,
      text: pickerText(ev.chatTitle, page),
      replyMarkup: page.total > 0 ? pickerKeyboard(opts.secret, ev.chatId, page) : undefined,
      bestEffort: true,
    },
  ];
}

/** Callback: the admin paged the picker. */
export async function handleBindPage(
  prisma: PrismaClient,
  id: string,
  opts: { secret: string },
): Promise<CallbackOutcome> {
  const [packedChat, rawPage] = id.split(":");
  const chatId = unpackChatId(packedChat ?? "");
  if (chatId == null) return { answer: "Bu tugma eskirgan.", alert: true };

  const group = await prisma.telegramGroup.findUnique({
    where: { chatId },
    select: { title: true },
  });
  const page = await listUnboundCompanies(prisma, Number(rawPage) || 0);
  return {
    edit: {
      text: pickerText(group?.title ?? undefined, page),
      replyMarkup: page.total > 0 ? pickerKeyboard(opts.secret, chatId, page) : undefined,
    },
  };
}

/** Callback: the admin picked the company this chat belongs to. */
export async function handleBindPick(
  prisma: PrismaClient,
  id: string,
  actor: { userId: string | null },
): Promise<CallbackOutcome> {
  const [packedChat, packedCompany] = id.split(":");
  const chatId = unpackChatId(packedChat ?? "");
  const companyId = unpackUuid(packedCompany ?? "");
  if (chatId == null || companyId == null) {
    return { answer: "Bu tugma eskirgan.", alert: true };
  }

  const group = await prisma.telegramGroup.findUnique({
    where: { chatId },
    select: { title: true },
  });

  const res = await bindGroupToCompany(prisma, {
    chatId,
    title: group?.title ?? null,
    companyRef: companyId,
    byUserId: actor.userId,
  });

  return {
    answer: res.ok ? "✅ Bog'landi" : res.message,
    alert: !res.ok,
    // Drop the keyboard either way: on success the choice is made, on failure
    // the list is stale and re-pressing the same button would fail again.
    edit: res.ok
      ? { text: `✅ "${group?.title ?? chatId}" — ${res.message}` }
      : { text: `⚠️ ${res.message}` },
  };
}
