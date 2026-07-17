import { config, hasGemini } from "../../config";
import type { AiClassifier } from "./domain/ai.port";
import { HeuristicClassifier } from "./infrastructure/heuristic.classifier";
import { GeminiClassifier } from "./infrastructure/gemini.classifier";

let instance: AiClassifier | undefined;

/**
 * The classifier singleton: Gemini when a key is configured, else the heuristic
 * fallback. Logged once at startup so it is obvious which one is live.
 */
export function getClassifier(): AiClassifier {
  if (!instance) {
    if (hasGemini()) {
      instance = new GeminiClassifier(config.ai.geminiApiKey, config.ai.geminiModel);
      console.log(`[ai] classifier: Gemini (${config.ai.geminiModel})`);
    } else {
      instance = new HeuristicClassifier();
      console.log("[ai] classifier: heuristic fallback (no GEMINI_API_KEY)");
    }
  }
  return instance;
}

export * from "./domain/ai.port";
