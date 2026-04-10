import { describe, expect, it } from 'vitest';
import { HonestyCalculator } from '../../src/core/HonestyCalculator';

describe('HonestyCalculator', () => {
  it('returns collecting state when history has fewer than 3 valid points', () => {
    const result = HonestyCalculator.calculate(1000, [{ price: 1000, date: Date.now() }], 'Загальна');

    expect(result.score).toBe(-1);
    expect(result.message).toContain('Збираємо історію цін');
  });

  it('flags pre-inflation spike pattern', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const history = [
      { price: 1000, date: now - 40 * day },
      { price: 1020, date: now - 35 * day },
      { price: 980, date: now - 30 * day },
      { price: 1500, date: now - 3 * day },
      { price: 1450, date: now - 2 * day },
    ];

    const result = HonestyCalculator.calculate(1200, history, 'Загальна');

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.message).toContain('Pre-inflation Spike');
  });

  it('returns bounded score for regular history', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const history = [
      { price: 2500, date: now - 55 * day },
      { price: 2450, date: now - 35 * day },
      { price: 2400, date: now - 21 * day },
      { price: 2300, date: now - 10 * day },
      { price: 2200, date: now - 2 * day },
    ];

    const result = HonestyCalculator.calculate(2200, history, 'Загальна');

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});


