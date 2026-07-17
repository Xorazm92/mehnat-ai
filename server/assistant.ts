"use server";

import { GoogleGenAI } from "@google/genai";
import { auth } from "@/lib/auth";
import {
  ASSISTANT_SYSTEM_INSTRUCTION,
  heuristicReply,
} from "@/lib/ai/knowledge";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  ok: boolean;
  reply: string;
  /** true when the deterministic fallback answered (no Gemini key configured). */
  fallback?: boolean;
}

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
// gemini-flash-latest = always-current flash alias, which avoids the "no longer
// available to new users" 404 that pinned versions (e.g. gemini-2.5-flash) can
// return on some accounts. On a transient overload/quota error we retry once on
// the lighter, lower-demand lite model.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
const MAX_INPUT_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

/** Overload/quota errors worth one retry on the fallback model. */
function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /"code":\s*(429|503)/.test(msg) || /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
}

/**
 * ASRO Moliyachi AI — in-app (web chat only) assistant for O'zbekiston BHMS /
 * Soliq / Mehnat questions. Auth-gated Server Action called from the header
 * FinanceAssistant panel. When GEMINI_API_KEY is unset it degrades to a
 * deterministic keyword reply instead of failing, so the feature never hard-errors.
 */
export async function askFinanceAssistant(
  message: string,
  history: AssistantTurn[] = [],
): Promise<AssistantResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, reply: "Iltimos, tizimga qayta kiring." };
  }

  const question = (message ?? "").trim().slice(0, MAX_INPUT_CHARS);
  if (!question) {
    return { ok: false, reply: "Savol bo'sh bo'lishi mumkin emas." };
  }

  // No key → graceful heuristic answer.
  if (!API_KEY) {
    return { ok: true, reply: heuristicReply(question), fallback: true };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const contents = [
      ...history
        .slice(-MAX_HISTORY_TURNS)
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          parts: [{ text: m.content.slice(0, MAX_INPUT_CHARS) }],
        })),
      { role: "user" as const, parts: [{ text: question }] },
    ];

    const genConfig = {
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      maxOutputTokens: 800,
    };

    let response;
    try {
      response = await ai.models.generateContent({ model: MODEL, contents, config: genConfig });
    } catch (err) {
      if (!isTransientGeminiError(err)) throw err;
      // Primary model overloaded/quota-limited → one retry on the lite model.
      await new Promise((r) => setTimeout(r, 700));
      response = await ai.models.generateContent({ model: FALLBACK_MODEL, contents, config: genConfig });
    }

    const text = response.text?.trim();
    if (!text) {
      return { ok: false, reply: "Kechirasiz, javob hosil bo'lmadi. Savolni boshqacharoq yozib ko'ring." };
    }
    return { ok: true, reply: text };
  } catch (err) {
    console.error("[assistant] Gemini error:", (err as Error).message);
    return {
      ok: false,
      reply: "AI yordamchi bilan bog'lanishda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
    };
  }
}
