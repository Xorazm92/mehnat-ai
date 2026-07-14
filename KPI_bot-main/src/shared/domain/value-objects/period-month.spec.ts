import { PeriodMonth } from './period-month';

describe('PeriodMonth', () => {
  it('parses and formats YYYY-MM', () => {
    const p = PeriodMonth.parse('2026-07');
    expect(p.year).toBe(2026);
    expect(p.month).toBe(7);
    expect(p.toString()).toBe('2026-07');
  });

  it('pads single-digit months', () => {
    expect(PeriodMonth.of(2026, 3).toString()).toBe('2026-03');
  });

  it('derives the period from a date (UTC)', () => {
    const p = PeriodMonth.fromDate(new Date(Date.UTC(2026, 6, 15, 10, 0, 0)));
    expect(p.toString()).toBe('2026-07');
  });

  it('computes an inclusive start and exclusive end', () => {
    const p = PeriodMonth.parse('2026-07');
    expect(p.start().toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(p.endExclusive().toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('handles the December → January rollover', () => {
    const p = PeriodMonth.parse('2026-12');
    expect(p.endExclusive().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('knows whether a date falls in the period', () => {
    const p = PeriodMonth.parse('2026-07');
    expect(p.contains(new Date(Date.UTC(2026, 6, 1)))).toBe(true);
    expect(p.contains(new Date(Date.UTC(2026, 6, 31, 23, 59)))).toBe(true);
    expect(p.contains(new Date(Date.UTC(2026, 7, 1)))).toBe(false);
    expect(p.contains(new Date(Date.UTC(2026, 5, 30)))).toBe(false);
  });

  it('rejects invalid input', () => {
    expect(() => PeriodMonth.parse('2026/07')).toThrow();
    expect(() => PeriodMonth.of(2026, 13)).toThrow();
    expect(() => PeriodMonth.of(2026, 0)).toThrow();
  });
});
