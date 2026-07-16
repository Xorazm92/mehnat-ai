// Shared input helpers for the ERP UI.
import type { KeyboardEvent } from "react";

/**
 * Group an integer into 3-digit blocks with a thin space separator so long
 * amounts stay readable in inputs: 10000000 -> "10 000 000". Matches the
 * ru-RU display convention used across the money read-outs.
 */
export function groupDigits(value: string | number): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Strip grouping/formatting back to raw digits: "10 000 000" -> "10000000". */
export function ungroupDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * onKeyDown handler that submits a form/modal on Ctrl+Enter (Cmd+Enter on Mac).
 * Attach to the element wrapping the inputs; keydown bubbles up from them.
 */
export function submitOnCtrlEnter(handler: () => void) {
  return (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handler();
    }
  };
}
