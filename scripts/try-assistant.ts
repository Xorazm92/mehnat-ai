/**
 * Local smoke-test for the in-app "Moliyachi AI" assistant WITHOUT the Next.js
 * runtime / auth. Mirrors server/assistant.ts (same prompt + Gemini call) so you
 * can confirm your GEMINI_API_KEY works and see the grounded answers.
 *
 *   npx tsx scripts/try-assistant.ts                       # runs a few sample Qs
 *   npx tsx scripts/try-assistant.ts "QQS qanday hisoblanadi?"
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { GoogleGenAI } from "@google/genai";
import { ASSISTANT_SYSTEM_INSTRUCTION, heuristicReply } from "../lib/ai/knowledge";

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

async function ask(question: string): Promise<string> {
  if (!API_KEY) return "[fallback] " + heuristicReply(question);
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: question }] }],
    config: {
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      maxOutputTokens: 800,
    },
  });
  return response.text?.trim() || "(bo'sh javob)";
}

async function main() {
  console.log(`Model: ${MODEL} · key: ${API_KEY ? API_KEY.slice(0, 6) + "…(" + API_KEY.length + " chars)" : "NONE"}\n`);

  const argQ = process.argv.slice(2).join(" ").trim();
  const questions = argQ
    ? [argQ]
    : [
        "QQS qanday hisoblanadi va stavkasi qancha?",
        "Yillik ta'til necha kun beriladi?",
        "Bu oy bizning firma oylik fondi qancha bo'ldi?", // live-data guardrail test
      ];

  for (const q of questions) {
    console.log("❓ " + q);
    try {
      const t0 = Date.now();
      const a = await ask(q);
      console.log("🤖 " + a + `\n   ⏱ ${Date.now() - t0}ms\n`);
    } catch (e) {
      console.log("🚫 ERROR: " + (e instanceof Error ? e.message : String(e)) + "\n");
    }
  }
}

main();
