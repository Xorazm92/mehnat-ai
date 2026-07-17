import {
  DEFAULT_RESPONSIBLE_ROLE,
  type AiClassifier,
  type QuestionClassification,
} from "../domain/ai.port";

/**
 * No-AI fallback used when no Gemini key is configured. The worker only calls a
 * classifier after its `looksLikeQuestion` gate passes, so this simply affirms
 * the gate and routes to the default role. Deterministic confidence sits above
 * the open-threshold so questions still open (attributed to the default role).
 */
export class HeuristicClassifier implements AiClassifier {
  // The interface passes `text`, but the heuristic gate already ran in the
  // worker, so this implementation needs no argument.
  async classify(): Promise<QuestionClassification> {
    return {
      isQuestion: true,
      responsibleRole: DEFAULT_RESPONSIBLE_ROLE,
      confidence: 0.7,
    };
  }
}
