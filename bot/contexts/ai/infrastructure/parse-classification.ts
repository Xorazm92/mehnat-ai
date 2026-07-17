import {
  RESPONSIBLE_ROLES,
  type QuestionClassification,
  type ResponsibleRole,
} from "../domain/ai.port";

const EMPTY: QuestionClassification = {
  isQuestion: false,
  responsibleRole: null,
  confidence: 0,
};

/**
 * Parse the model's JSON reply into a validated QuestionClassification. Pure and
 * defensive: tolerates prose around the JSON, unknown roles, and out-of-range
 * confidence. Extracted from the network adapter so it is unit-testable.
 */
export function parseClassification(
  raw: string | undefined | null,
): QuestionClassification {
  if (!raw) return EMPTY;

  let obj: Record<string, unknown> | undefined;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) return EMPTY;
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return EMPTY;
    }
  }

  const isQuestion = obj.is_question === true;
  const role =
    typeof obj.role === "string" &&
    (RESPONSIBLE_ROLES as readonly string[]).includes(obj.role)
      ? (obj.role as ResponsibleRole)
      : null;
  const rawConfidence =
    typeof obj.confidence === "number" ? obj.confidence : isQuestion ? 0.5 : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  return {
    isQuestion,
    responsibleRole: isQuestion ? role : null,
    confidence,
  };
}
