import { describe, expect, it } from 'vitest';
import { HonestyCalculator } from '@/core/HonestyCalculator';

describe('HonestyCalculator', () => {
  const asAnalyzedDetails = (details: unknown) => details as {
    hasSpike?: boolean;
    min30?: number;
    median60?: number;
    // legacy aliases (still present for backward compat)
    min90?: number;
    max90?: number;
    median90?: number;
    trend?: 'rising' | 'falling' | 'stable';
    isVolatile?: boolean;
  };

  // ── Existing tests (updated field names where needed) ────────

  it('returns informative single-price state when there is exactly one valid history point', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const result = HonestyCalculator.calculate(1000, [{ price: 1000, date: now - 7 * day }], 'Загальна');

    expect(result.score).toBe(-1);
    expect(result.state).toBe('single-price');
    expect(result.messageKey).toBe('calculator.firstPriceSame');
    expect(result.details?.entryCount).toBe(1);
    expect(result.details?.daysAtObservedPrice).toBe(7);
    expect(result.reasonCodes).toContain('INSUFFICIENT_HISTORY');
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
    expect(result.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  it('score is ~50 when currentPrice equals median (normal price)', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
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
    const result = HonestyCalculator.calculate(1200, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.score).toBeLessThan(50);
  });

  it('flags pre-inflation spike pattern with hasSpike=true', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1000, date: now - 60 * day },
      { price: 1020, date: now - 45 * day },
      { price: 980,  date: now - 30 * day },
      { price: 1600, date: now - 5  * day },  // spike
      { price: 1580, date: now - 2  * day },  // still high
    ];
    const result = HonestyCalculator.calculate(1100, history, 'Загальна');
    const analyzed = asAnalyzedDetails(result.details);
    expect(result.state).toBe('analyzed');
    expect(analyzed.hasSpike).toBe(true);
    expect(result.messageKey).toContain('calculator.spike');
    expect(result.reasonCodes).toContain('SPIKE_14D_DETECTED');
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
    expect(analyzed.min30).toBeDefined();
    expect(analyzed.median60).toBeDefined();
    expect(analyzed.trend).toBeDefined();
    // legacy aliases still present
    expect(analyzed.min90).toBeDefined();
    expect(analyzed.max90).toBeDefined();
    expect(analyzed.median90).toBeDefined();
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

  // ── V2-specific tests ────────────────────────────────────────

  it('returns verdict "fair" when score >= 65', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // price well below median → high score
    const history = [
      { price: 1000, date: now - 40 * day },
      { price: 1000, date: now - 25 * day },
      { price: 1000, date: now - 10 * day },
    ];
    const result = HonestyCalculator.calculate(600, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.verdict).toBe('fair');
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it('returns verdict "risky" when score < 40', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // price far above median + spike penalty
    const history = [
      { price: 1000, date: now - 60 * day },
      { price: 1010, date: now - 45 * day },
      { price: 990,  date: now - 30 * day },
      { price: 1600, date: now - 5  * day },
      { price: 1590, date: now - 2  * day },
    ];
    const result = HonestyCalculator.calculate(1400, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.verdict).toBe('risky');
    expect(result.score).toBeLessThan(40);
  });

  it('includes SPIKE_14D_DETECTED in reasonCodes on known spike scenario', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1000, date: now - 60 * day },
      { price: 1000, date: now - 40 * day },
      { price: 1000, date: now - 25 * day },
      { price: 1400, date: now - 7  * day },  // spike >25% above old median
    ];
    const result = HonestyCalculator.calculate(1000, history, 'tools');
    expect(result.reasonCodes).toContain('SPIKE_14D_DETECTED');
    expect(result.metrics?.spike14Pct).toBeGreaterThan(0);
    expect(result.metrics?.penalty).toBeGreaterThan(0);
  });

  it('includes PRICE_NEAR_MIN30 when current price is at or below min30 * 1.05', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1200, date: now - 55 * day },
      { price: 1150, date: now - 40 * day },
      { price: 1100, date: now - 28 * day },
      { price: 900,  date: now - 15 * day },  // low point in 30d window
      { price: 950,  date: now - 5  * day },
    ];
    // current price ≤ min30 * 1.05 → PRICE_NEAR_MIN30
    const result = HonestyCalculator.calculate(900, history, 'Загальна');
    expect(result.reasonCodes).toContain('PRICE_NEAR_MIN30');
  });

  it('includes HIGH_CATEGORY_VOLATILITY for fmcg category with wide swings', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // fmcg warningBandPct = 0.08 — even moderate swings should trigger
    const history = [
      { price: 100, date: now - 50 * day },
      { price: 200, date: now - 35 * day },
      { price: 80,  date: now - 20 * day },
      { price: 220, date: now - 10 * day },
      { price: 90,  date: now - 3  * day },
    ];
    const result = HonestyCalculator.calculate(150, history, 'fmcg');
    expect(result.reasonCodes).toContain('HIGH_CATEGORY_VOLATILITY');
    expect(result.details?.isVolatile).toBe(true);
  });

  it('INSUFFICIENT_HISTORY in reasonCodes when 60d window < 3 points', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    // All history older than 60 days
    const history = [
      { price: 1000, date: now - 90 * day },
      { price: 1050, date: now - 80 * day },
      { price: 1020, date: now - 70 * day },
    ];
    const result = HonestyCalculator.calculate(1000, history, 'Загальна');
    expect(result.state).toBe('analyzed');
    expect(result.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  it('metrics object is present and has expected shape on analyzed result', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const history = [
      { price: 1000, date: now - 50 * day },
      { price: 1000, date: now - 30 * day },
      { price: 1000, date: now - 10 * day },
    ];
    const result = HonestyCalculator.calculate(1000, history, 'Загальна');
    expect(result.metrics).toBeDefined();
    expect(typeof result.metrics?.median60).toBe('number');
    expect(typeof result.metrics?.min30).toBe('number');
    expect(typeof result.metrics?.spike14Pct).toBe('number');
    expect(typeof result.metrics?.penalty).toBe('number');
  });
});
