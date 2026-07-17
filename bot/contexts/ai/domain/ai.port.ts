/**
 * The AI context's single responsibility (blueprint §7): decide *is this a
 * question?* and *who should answer?* — plus STT later. It NEVER computes KPI,
 * bonus, or penalty; that is the Rule Engine's job.
 */

export const RESPONSIBLE_ROLES = ["accountant", "bank_client", "controller"] as const;
export type ResponsibleRole = (typeof RESPONSIBLE_ROLES)[number];
export const DEFAULT_RESPONSIBLE_ROLE: ResponsibleRole = "accountant";

/** Minimum confidence at which the worker opens a Question. */
export const QUESTION_CONFIDENCE_THRESHOLD = 0.6;

export interface QuestionClassification {
  isQuestion: boolean;
  responsibleRole: ResponsibleRole | null;
  confidence: number; // 0..1
}

/** Port implemented by the Gemini adapter and the no-AI heuristic fallback. */
export interface AiClassifier {
  classify(text: string): Promise<QuestionClassification>;
}
