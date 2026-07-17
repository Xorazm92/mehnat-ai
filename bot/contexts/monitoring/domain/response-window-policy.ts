import { ResponseWindow } from "../../../shared/domain/value-objects/response-window";

/**
 * Per-role response regulament window (working minutes). Spec: accountant 10,
 * bank-client 5, controller 5-10 (we use 10). Unknown roles get the accountant
 * default. Combine with WorkingHours.addWorkingMinutes to get a wall-clock deadline.
 */
export function responseWindowForRole(role: string | null | undefined): ResponseWindow {
  switch (role) {
    case "bank_client":
      return ResponseWindow.ofMinutes(5);
    case "controller":
      return ResponseWindow.ofMinutes(10);
    case "accountant":
    default:
      return ResponseWindow.ofMinutes(10);
  }
}
