/**
 * A per-role response regulament limit, measured in *working* minutes (see
 * WorkingHours). Spec limits: accountant 10, bank-client 5, controller 5-10.
 * The task-ETA convention ("10 минутда ўтказаман") allows up to 30 min for the
 * actual task; that longer limit is modelled as a separate ResponseWindow.
 */
export class ResponseWindow {
  private constructor(public readonly limitMinutes: number) {}

  static ofMinutes(limitMinutes: number): ResponseWindow {
    if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) {
      throw new Error(`limitMinutes must be > 0, got: ${limitMinutes}`);
    }
    return new ResponseWindow(limitMinutes);
  }

  /** True when elapsed working minutes exceed the limit. */
  isBreached(elapsedWorkingMinutes: number): boolean {
    return elapsedWorkingMinutes > this.limitMinutes;
  }

  /** Working minutes past the limit (0 if within). */
  minutesOver(elapsedWorkingMinutes: number): number {
    return Math.max(0, elapsedWorkingMinutes - this.limitMinutes);
  }
}
