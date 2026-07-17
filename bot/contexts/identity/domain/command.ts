/**
 * Pure Telegram-command parser. Framework-free and I/O-free so it is fully
 * unit-testable. Handles `/name`, `/name@BotUsername`, and trailing arguments.
 */
export interface ParsedCommand {
  /** Command name, lowercased, without the leading slash or @botname. */
  name: string;
  /** Whitespace-split arguments (empty when none). */
  args: string[];
  /** Everything after the command name, trimmed. */
  argString: string;
}

const COMMAND_RE = /^\/([A-Za-z0-9_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/;

export function parseCommand(text: string | undefined | null): ParsedCommand | null {
  if (!text) return null;
  const match = COMMAND_RE.exec(text.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const argString = (match[2] ?? "").trim();
  const args = argString.length > 0 ? argString.split(/\s+/) : [];
  return { name, args, argString };
}
