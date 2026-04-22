import { describe, expect, it } from 'vitest';
import { HonestyCalculator } from '@/core/HonestyCalculator';

describe('HonestyCalculator', () => {
  const asAnalyzedDetails = (details: unknown) => details as {
    hasSpike?: boolean;
    min90?: number;
    max90?: number;
    median90?: number;
    trend?: 'rising' | 'falling' | 'stable';
    isVolatile?: boolean;
  };

  it('returns informative single-price state when there is exactly one valid history point', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const result = HonestyCalculator.calculate(1000, [{ price: 1000, date: now - 7 * day }], 'Загальна');

    expect(result.score).toBe(-1);
    expect(result.state).toBe('single-price');
    expect(result.messageKey).toBe('calculator.firstPriceSame');
    expect(result.details?.entryCount).toBe(1);
    expect(result.details?.daysAtObservedPrice).toBe(7);
  });

  it('returns collecting state with observedPrices when history has two valid points', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const result = HonestyCalculator.calculate(1000, [
      { price: 1000, date: now - 7 * day },
      { price: 980, date: now - 2 * day },
    ], 'Загальна');

    expect(result.score).toBe(-1);
    expect(result.state).toBe('collecting');
    expect(result.messageKey).toBe('calculator.collecting');
    expect(result.details?.entryCount).toBe(2);
    expect(result.details?.observedPrices).toBeDefined();
    expect(result.details?.observedPrices?.length).toBe(2);
    expect(result.details?.observedPrices?.[0].price).toBe(1000);
    expect(result.details?.observedPrices?.[1].price).toBe(980);
  });

  it('score is ~50 when currentPrice equals median (normal price)', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // All prices same → median = currentPrice = 1000
    const history = [
      { price: 1000, date: now - 30 * day },
      { price: 1000, date: now - 20 * day },
      { price: 1000, date: now - 10 * day },
    ];
    const result = HonestyCalculator.calculate(1000, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.score).toBe(50);
  });

  it('score > 50 when currentPrice is below median (good deal)', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1000, date: now - 30 * day },
      { price: 1000, date: now - 20 * day },
      { price: 1000, date: now - 10 * day },
    ];
    // currentPrice = 800 (20% below median)
    const result = HonestyCalculator.calculate(800, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('score < 50 when currentPrice is above median (overpriced)', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1000, date: now - 30 * day },
      { price: 1000, date: now - 20 * day },
      { price: 1000, date: now - 10 * day },
    ];
    // currentPrice = 1200 (20% above median)
    const result = HonestyCalculator.calculate(1200, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.score).toBeLessThan(50);
  });

  it('flags pre-inflation spike pattern with hasSpike=true', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // Stable at ~1000 for months, then spiked to 1600 recently
    const history = [
      { price: 1000, date: now - 60 * day },
      { price: 1020, date: now - 45 * day },
      { price: 980,  date: now - 30 * day },
      { price: 1600, date: now - 5  * day },  // spike
      { price: 1580, date: now - 2  * day },  // still high
    ];
    // currentPrice back to "normal" 1000, but was inflated recently
    const result = HonestyCalculator.calculate(1100, history, 'Загальна');
    const analyzed = asAnalyzedDetails(result.details);
    expect(result.state).toBe('analyzed');
    expect(analyzed.hasSpike).toBe(true);
    expect(result.messageKey).toContain('calculator.spike');
  });

  it('returns bounded score [0,100] for any valid inputs', () => {
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
    const analyzed = asAnalyzedDetails(result.details);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.state).toBe('analyzed');
    expect(analyzed.min90).toBeDefined();
    expect(analyzed.max90).toBeDefined();
    expect(analyzed.median90).toBeDefined();
    expect(analyzed.trend).toBeDefined();
  });

  it('detects volatile product when price swings are large', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 500,  date: now - 50 * day },
      { price: 900,  date: now - 40 * day },
      { price: 400,  date: now - 30 * day },
      { price: 1100, date: now - 20 * day },
      { price: 450,  date: now - 10 * day },
    ];
    const result = HonestyCalculator.calculate(700, history, 'Загальна');
    const analyzed = asAnalyzedDetails(result.details);
    expect(result.state).toBe('analyzed');
    expect(analyzed.isVolatile).toBe(true);
  });
});


