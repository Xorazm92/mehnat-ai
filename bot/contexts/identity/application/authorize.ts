import type { PrismaClient } from "@prisma/client";
import { config } from "../../../config";
import { resolveUserByTelegramId } from "./identity-service";

/** mehnat-ai roles allowed to run bot admin commands (bind/link). */
const ADMIN_ROLES = new Set(["super_admin", "admin"]);

export interface AuthzResult {
  admin: boolean;
  /** mehnat-ai user id of the caller, if linked (null for the env bootstrap admin). */
  userId: string | null;
}

/**
 * Is this Telegram caller allowed to run admin commands? True for the env
 * bootstrap admin id, or a linked, active user in an admin role. Server-side
 * role check is authoritative — the editable RBAC nav only shapes the UI.
 */
export async function authorizeAdmin(
  prisma: PrismaClient,
  callerTelegramId: bigint,
): Promise<AuthzResult> {
  if (
    config.telegram.adminTelegramId !== null &&
    callerTelegramId === config.telegram.adminTelegramId
  ) {
    return { admin: true, userId: null };
  }
  const user = await resolveUserByTelegramId(prisma, callerTelegramId);
  if (user && user.isActive && ADMIN_ROLES.has(user.role)) {
    return { admin: true, userId: user.id };
  }
  return { admin: false, userId: user?.id ?? null };
}
