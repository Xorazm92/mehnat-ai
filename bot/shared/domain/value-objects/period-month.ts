/**
 * A KPI accounting month (YYYY-MM). Uses UTC internally so results are
 * independent of the server timezone; callers normalise wall-clock times to the
 * business timezone upstream before constructing/querying a period.
 */
export class PeriodMonth {
  /** @param year full year, @param month 1-12 */
  private constructor(
    public readonly year: number,
    public readonly month: number,
  ) {}

  static of(year: number, month: number): PeriodMonth {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`Month must be 1-12, got: ${month}`);
    }
    if (!Number.isInteger(year)) {
      throw new Error(`Year must be an integer, got: ${year}`);
    }
    return new PeriodMonth(year, month);
  }

  static fromDate(date: Date): PeriodMonth {
    return new PeriodMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  static parse(value: string): PeriodMonth {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) {
      throw new Error(`Invalid period, expected YYYY-MM, got: ${value}`);
    }
    return PeriodMonth.of(Number(match[1]), Number(match[2]));
  }

  /** Inclusive start (first instant of the month, UTC). */
  start(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, 1, 0, 0, 0, 0));
  }

  /** Exclusive end (first instant of the next month, UTC). */
  endExclusive(): Date {
    return new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0));
  }

  contains(date: Date): boolean {
    return date >= this.start() && date < this.endExclusive();
  }

  equals(other: PeriodMonth): boolean {
    return this.year === other.year && this.month === other.month;
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, "0")}`;
  }
}
