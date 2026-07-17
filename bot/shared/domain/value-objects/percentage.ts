/**
 * Signed percentage points of a firm's monthly salary share — the unit of the
 * KPI ledger (e.g. +0.04, -0.5). Immutable value object with float-safe math.
 */
export class Percentage {
  private static readonly PRECISION = 4;

  private constructor(public readonly value: number) {}

  private static round(v: number): number {
    const f = 10 ** Percentage.PRECISION;
    return Math.round((v + Number.EPSILON) * f) / f;
  }

  static of(value: number): Percentage {
    if (!Number.isFinite(value)) {
      throw new Error(`Percentage must be a finite number, got: ${value}`);
    }
    return new Percentage(Percentage.round(value));
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  add(other: Percentage): Percentage {
    return Percentage.of(this.value + other.value);
  }

  /** Scale by a factor (e.g. +0.04% per on-time day × number of days). */
  scale(factor: number): Percentage {
    return Percentage.of(this.value * factor);
  }

  /** Cap the value at `max` (used for the monthly arrival-bonus cap of +1%). */
  cappedAt(max: number): Percentage {
    return Percentage.of(Math.min(this.value, max));
  }

  /** Floor the value at `min`. */
  flooredAt(min: number): Percentage {
    return Percentage.of(Math.max(this.value, min));
  }

  isNegative(): boolean {
    return this.value < 0;
  }

  equals(other: Percentage): boolean {
    return this.value === other.value;
  }

  toString(): string {
    const sign = this.value > 0 ? "+" : "";
    return `${sign}${this.value}%`;
  }
}
