/**
 * Loads environment for the standalone bot process (`tsx bot/main.ts`) and any
 * bot script run outside Next.js. Next.js and vitest load env themselves, so
 * this is a harmless no-op there. Import this FIRST, before anything that reads
 * `config`, so process.env is populated before config captures it.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
