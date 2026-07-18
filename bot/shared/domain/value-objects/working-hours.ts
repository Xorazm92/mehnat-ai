/** A daily working window expressed as minutes-from-midnight [start, end). */
export interface DailyWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * The regulament working-hours calendar. Response timers only advance during
 * these windows (spec: "Reglamentlar 09.00-13.00 gacha va 14.00 dan 18.00 gacha
 * amal qiladi") — time outside them, incl. the 13:00-14:00 break, does not count.
 *
 * Dates are read via their UTC wall-clock components, so the caller passes times
 * already normalised to the business timezone (Uzbekistan, UTC+5). Keeping this
 * pure/UTC makes the arithmetic deterministic and unit-testable with no DB.
 */
export class WorkingHours {
  private constructor(private readonly windows: DailyWindow[]) {}

  /** 09:00-13:00 and 14:00-18:00. */
  static readonly DEFAULT = WorkingHours.of([
    { startMinute: 9 * 60, endMinute: 13 * 60 },
    { startMinute: 14 * 60, endMinute: 18 * 60 },
  ]);

  static of(windows: DailyWindow[]): WorkingHours {
    if (windows.length === 0) {
      throw new Error("WorkingHours needs at least one window");
    }
    const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
    let prevEnd = -1;
    for (const w of sorted) {
      if (
        w.startMinute < 0 ||
        w.endMinute > 24 * 60 ||
        w.endMinute <= w.startMinute
      ) {
        throw new Error(
          `Invalid window ${w.startMinute}-${w.endMinute} (must be within 0-1440 and non-empty)`,
        );
      }
      if (w.startMinute < prevEnd) {
        throw new Error("WorkingHours windows must not overlap");
      }
      prevEnd = w.endMinute;
    }
    return new WorkingHours(sorted);
  }

  private static utcMidnight(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  /**
   * Working minutes elapsed between two instants, counting only time inside the
   * configured windows (across day boundaries). Returns 0 if end <= start.
   */
  businessMinutesBetween(start: Date, end: Date): number {
    if (end.getTime() <= start.getTime()) return 0;

    const startMs = start.getTime();
    const endMs = end.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    let total = 0;

    for (
      let day = WorkingHours.utcMidnight(start);
      day <= WorkingHours.utcMidnight(end);
      day += dayMs
    ) {
      for (const w of this.windows) {
        const winStart = day + w.startMinute * 60_000;
        const winEnd = day + w.endMinute * 60_000;
        const overlapStart = Math.max(winStart, startMs);
        const overlapEnd = Math.min(winEnd, endMs);
        if (overlapEnd > overlapStart) {
          total += (overlapEnd - overlapStart) / 60_000;
        }
      }
    }
    return total;
  }

  /**
   * The instant that is `minutes` *working* minutes after `start`, skipping
   * time outside the windows (incl. the lunch break and overnight). Used to
   * place a response deadline. Returns a copy of `start` for minutes <= 0.
   */
  addWorkingMinutes(start: Date, minutes: number): Date {
    if (minutes <= 0) return new Date(start.getTime());

    const startMs = start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    let remaining = minutes;
    let day = WorkingHours.utcMidnight(start);

    // Cap the walk at a year so a misconfiguration can never loop forever.
    for (let d = 0; d < 366; d++, day += dayMs) {
      for (const w of this.windows) {
        const winStart = day + w.startMinute * 60_000;
        const winEnd = day + w.endMinute * 60_000;
        const from = Math.max(winStart, startMs);
        if (from >= winEnd) continue; // window already elapsed
        const available = (winEnd - from) / 60_000;
        if (available >= remaining) {
          return new Date(from + remaining * 60_000);
        }
        remaining -= available;
      }
    }
    return new Date(startMs + minutes * 60_000); // unreachable in practice
  }

  /** Whether an instant falls inside a working window. */
  isWithinWorkingHours(date: Date): boolean {
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return this.windows.some(
      (w) => minutes >= w.startMinute && minutes < w.endMinute,
    );
  }
}
