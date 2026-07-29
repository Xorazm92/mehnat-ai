import { encodeCallback } from "../../interaction/domain/callback-token";
import { ACTION } from "../../interaction/domain/actions";
import { cbButton, inlineKeyboard, type InlineKeyboardMarkup } from "../../../telegram/keyboard";
import { ESCALATION_PENALTY_PERCENT, type EscalationRecipient, type EscalationSubject } from "../../../../lib/escalation";

const LEVEL_ICON: Record<number, string> = { 0: "🟡", 1: "⚠️", 2: "🚨" };
const LEVEL_TITLE: Record<number, string> = {
  0: "Muddat eslatmasi",
  1: "SLA buzilishi",
  2: "Hal qilinmagan — eskalatsiya",
};

export interface RenderedAlert {
  text: string;
  keyboard?: InlineKeyboardMarkup;
}

/**
 * The escalation message a supervisor or chief receives.
 *
 * Buttons are attached only from L1 up: L0 is the responsible person's own
 * reminder, and nobody passes a verdict on themselves. The verdict buttons all
 * carry the entity id alone — who may press them is re-checked server-side, not
 * encoded here.
 */
export function renderAlert(
  secret: string,
  recipient: EscalationRecipient,
  subject: EscalationSubject,
  responsibleName?: string | null,
): RenderedAlert {
  const who = responsibleName ?? subject.responsibleName;
  const lines = [
    `${LEVEL_ICON[recipient.level]} ${LEVEL_TITLE[recipient.level]}`,
    "",
    `Korxona: ${subject.companyName}`,
    who ? `Mas'ul: ${who}` : "Mas'ul: biriktirilmagan",
    subject.detail,
  ];

  if (recipient.level === 0) return { text: lines.join("\n") };

  const keyboard =
    subject.kind === "question"
      ? inlineKeyboard([
          [
            cbButton(
              `🔴 Jarima −${ESCALATION_PENALTY_PERCENT}%`,
              encodeCallback(secret, ACTION.Q_PENALTY, subject.entityId),
            ),
            cbButton("🟡 Ogohlantirish", encodeCallback(secret, ACTION.Q_WARN, subject.entityId)),
          ],
          [cbButton("🟢 Sababli", encodeCallback(secret, ACTION.Q_EXCUSE, subject.entityId))],
        ])
      : inlineKeyboard([
          [cbButton("🟢 Sababli", encodeCallback(secret, ACTION.O_EXCUSE, subject.entityId))],
          [cbButton("🙋 O'zim bajaraman", encodeCallback(secret, ACTION.O_TAKE, subject.entityId))],
        ]);

  return { text: lines.join("\n"), keyboard };
}
