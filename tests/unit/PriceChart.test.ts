import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PriceChart } from '@/ui/components/PriceChart';
import type { HonestyResult } from '@/types/honesty';

// Mock react-i18next – returns the key itself or interpolated English value
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Simple interpolation for test readability
      if (!opts) return key;
      return Object.entries(opts).reduce<string>(
        (s, [k, v]) => s.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
        key,
      );
    },
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Mock i18n init module so it doesn't run localStorage / browser detection
vi.mock('@/utils/i18n', () => ({
  default: {},
  setLanguage: vi.fn(),
  getLanguage: () => 'en',
  initLanguage: vi.fn().mockResolvedValue(undefined),
  watchLanguage: vi.fn().mockReturnValue(() => {}),
  SUPPORTED_LANGUAGES: ['en', 'uk'],
}));

type TestPoint = { price: number; date: string; oldPrice?: number | null };

function renderChart(data: TestPoint[], honesty: HonestyResult): string {
  return renderToStaticMarkup(React.createElement(PriceChart, { data, honesty }));
}

function makeHonesty(overrides: Partial<HonestyResult>): HonestyResult {
  return {
    score: -1,
    messageKey: 'calculator.collecting',
    message: 'Collecting price history for analysis...',
    state: 'collecting',
    ...overrides,
  };
}

describe('PriceChart', () => {
  it('renders single-price card when honesty state is single-price', () => {
    const data = [{ price: 2550, date: '2026-04-10' }];
    const honesty = makeHonesty({
      state: 'single-price',
      messageKey: 'calculator.firstPriceSame',
      details: {
        entryCount: 1,
        observedPrice: 2550,
        firstSeenAt: new Date('2026-04-10').getTime(),
        daysAtObservedPrice: 11,
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('chart.singlePrice.title');
    expect(html).toContain('chart.singlePrice.observedPrice');
  });

  it('renders collecting preview and clarifies upper-bound current price', () => {
    const data = [
      { price: 2388, date: '2026-03-27' },
      { price: 2550, date: '2026-04-10' },
    ];
    const honesty = makeHonesty({
      details: {
        entryCount: 2,
        observedPrices: [
          { price: 2388, date: new Date('2026-03-27').getTime() },
          { price: 2550, date: new Date('2026-04-10').getTime() },
        ],
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('chart.preview.title');
    expect(html).toContain('chart.preview.lowestObserved');
    expect(html).toContain('chart.preview.highestObserved');
    expect(html).toContain('chart.preview.currentAtMax');
    expect(html).toContain('chart.preview.disclaimer');
  });

  it('renders collecting preview with between-range message when current price is below max', () => {
    const data = [
      { price: 2550, date: '2026-04-10' },
      { price: 2450, date: '2026-04-11' },
    ];
    const honesty = makeHonesty({
      details: {
        entryCount: 2,
        observedPrices: [
          { price: 2388, date: new Date('2026-03-27').getTime() },
          { price: 2550, date: new Date('2026-04-10').getTime() },
        ],
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('chart.preview.currentBetween');
  });

  it('renders analyzed stats panel fields', () => {
    const data = [
      { price: 2500, date: '2026-03-01' },
      { price: 2450, date: '2026-03-10' },
      { price: 2400, date: '2026-03-20' },
      { price: 2300, date: '2026-04-01' },
      { price: 2200, date: '2026-04-10' },
    ];
    const honesty = makeHonesty({
      score: 74,
      state: 'analyzed',
      messageKey: 'calculator.goodDeal',
      messageParams: { pct: 10 },
      details: {
        entryCount: 5,
        min90: 2200,
        max90: 2500,
        median90: 2400,
        trend: 'falling',
        isVolatile: false,
        hasSpike: false,
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('chart.stats.min90');
    expect(html).toContain('chart.stats.median');
    expect(html).toContain('chart.stats.max90');
    expect(html).toContain('chart.trend.falling');
    expect(html).toContain('chart.score.label');
  });

  it('renders baseline delta chip and hint for analyzed state', () => {
    const data = [
      { price: 2500, date: '2026-03-01' },
      { price: 2450, date: '2026-03-10' },
      { price: 2400, date: '2026-03-20' },
      { price: 2300, date: '2026-04-01' },
      { price: 2200, date: '2026-04-10' },
    ];
    const honesty = makeHonesty({
      score: 74,
      state: 'analyzed',
      messageKey: 'calculator.goodDeal',
      messageParams: { pct: 10 },
      reasonCodes: ['PRICE_NEAR_MIN30'],
      metrics: {
        median60: 2400,
        min30: 2200,
        spike14Pct: 0,
        penalty: 0,
      },
      details: {
        entryCount: 5,
        min30: 2200,
        median60: 2400,
        priceVsMedianPct: -8,
        trend: 'falling',
        isVolatile: false,
        hasSpike: false,
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('chart.reasonCodes.PRICE_NEAR_MIN30');
    expect(html).toContain('↓8%');
    expect(html).toContain('chart.baselineDelta.label');
    expect(html).toContain('title="chart.baselineDelta.belowHint"');
  });

  it('shows TEST MODE badge when test mode flag is enabled', () => {
    const data = [{ price: 2550, date: '2026-04-10' }];
    const honesty = makeHonesty({
      state: 'single-price',
      messageKey: 'calculator.firstPriceSame',
      details: {
        entryCount: 1,
        observedPrice: 2550,
        firstSeenAt: new Date('2026-04-10').getTime(),
        isTestMode: true,
      },
    });

    const html = renderChart(data, honesty);
    expect(html).toContain('TEST MODE');
  });
});
