import { Percentage } from './percentage';

describe('Percentage', () => {
  it('accumulates on-time arrival bonuses without float drift', () => {
    // +0.04% per day for 25 days = +1.00%
    let total = Percentage.zero();
    for (let i = 0; i < 25; i++) {
      total = total.add(Percentage.of(0.04));
    }
    expect(total.value).toBe(1);
  });

  it('caps the monthly arrival bonus at +1%', () => {
    // 30 on-time days would be +1.2% but the spec caps at +1%
    const raw = Percentage.of(0.04).scale(30);
    expect(raw.value).toBeCloseTo(1.2, 5);
    expect(raw.cappedAt(1).value).toBe(1);
  });

  it('sums bonuses and penalties into a signed net', () => {
    const net = Percentage.of(1)
      .add(Percentage.of(-0.5))
      .add(Percentage.of(-0.1));
    expect(net.value).toBe(0.4);
    expect(net.isNegative()).toBe(false);
  });

  it('reports a negative net when penalties dominate', () => {
    const net = Percentage.of(0.04).add(Percentage.of(-1));
    expect(net.isNegative()).toBe(true);
    expect(net.value).toBe(-0.96);
  });

  it('formats with an explicit sign', () => {
    expect(Percentage.of(0.5).toString()).toBe('+0.5%');
    expect(Percentage.of(-0.1).toString()).toBe('-0.1%');
    expect(Percentage.zero().toString()).toBe('0%');
  });

  it('rejects non-finite values', () => {
    expect(() => Percentage.of(Infinity)).toThrow();
    expect(() => Percentage.of(NaN)).toThrow();
  });
});
