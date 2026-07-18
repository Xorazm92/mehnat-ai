/**
 * Side-effect module: load environment for a standalone CLI script.
 *
 * Import this FIRST — before `@/lib/prisma` or anything else that reads
 * process.env — so DATABASE_URL (and friends) are populated before any client
 * or config is built:
 *
 *     import "./load-env";                    // must be the first import
 *     import { prisma } from "@/lib/prisma";
 *
 * ES modules evaluate imported modules in source order, so this runs before the
 * Prisma module body — guaranteeing env is loaded before Prisma even if the
 * client were ever made eager again. It simply delegates to the shared
 * `loadEnv()` (`.env.local` then `.env`); no dotenv logic is duplicated here.
 *
 * Next.js, the bot (bot/env.ts) and vitest load env their own way, so this
 * module is only for `tsx scripts/*.ts` entrypoints.
 */
import { loadEnv } from "./_bootstrap";

loadEnv();
