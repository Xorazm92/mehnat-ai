import { GoogleGenAI } from "@google/genai";
import type { AiClassifier, QuestionClassification } from "../domain/ai.port";
import { parseClassification } from "./parse-classification";

const SYSTEM_INSTRUCTION = `You classify a single Telegram group message from an Uzbek accounting-outsourcing firm (buxgalteriya autsorsing).
Decide two things:
1. Is it a QUESTION that expects a response from a responsible employee? Greetings, thanks, statements, confirmations, and file drops are NOT questions.
2. Which role should answer?
   - "accountant" (buxgalter): reports, taxes, 1C, hisobot, soliq.
   - "bank_client" (bank-klient): payments, bank operations, to'lov, bank.
   - "controller" (nazoratchi): oversight/monitoring.
Reply ONLY as JSON: {"is_question": boolean, "role": "accountant"|"bank_client"|"controller"|null, "confidence": number between 0 and 1}.`;

/**
 * Gemini implementation of the classifier port. Structured JSON output, temp 0.
 * KPI/bonus/penalty are never computed here (blueprint §7).
 */
export class GeminiClassifier implements AiClassifier {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async classify(text: string): Promise<QuestionClassification> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0,
        responseMimeType: "application/json",
      },
    });
    return parseClassification(response.text);
  }
}
