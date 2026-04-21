import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceChart } from '@/ui/components/PriceChart';
import type { HonestyResult } from '@/types/honesty';

type TestPoint = { price: number; date: string; oldPrice?: number | null };

function renderChart(data: TestPoint[], honesty: HonestyResult): string {
  return renderToStaticMarkup(React.createElement(PriceChart, { data, honesty }));
}

describe('PriceChart', () => {
  it('renders single-price card when honesty state is single-price', () => {
    const data = [{ price: 2550, date: '2026-04-10' }];
    const honesty: HonestyResult = {
      score: -1,
      state: 'single-price',
      message: 'Маємо перше підтвердження',
      details: {
        entryCount: 1,
        observedPrice: 2550,
        firstSeenAt: new Date('2026-04-10').getTime(),
        daysAtObservedPrice: 11,
      },
    };

    const html = renderChart(data, honesty);
    expect(html).toContain('Є перша підтверджена ціна');
    expect(html).toContain('Зафіксована ціна');
  });

  it('renders collecting preview and clarifies upper-bound current price', () => {
    const data = [
      { price: 2388, date: '2026-03-27' },
      { price: 2550, date: '2026-04-10' },
    ];
    const honesty: HonestyResult = {
      score: -1,
      state: 'collecting',
      message: 'Збираємо історію цін для аналізу...',
      details: {
        entryCount: 2,
        observedPrices: [
          { price: 2388, date: new Date('2026-03-27').getTime() },
          { price: 2550, date: new Date('2026-04-10').getTime() },
        ],
      },
    };

    const html = renderChart(data, honesty);
    expect(html).toContain('Попередній аналіз');
    expect(html).toContain('Мін (за спост.)');
    expect(html).toContain('Макс (за спост.)');
    expect(html).toContain('верхній межі зібраного діапазону');
    expect(html).toContain('не за всю історію');
  });

  it('renders collecting preview with lower-than-max message when current price is below max', () => {
    const data = [
      { price: 2550, date: '2026-04-10' },
      { price: 2450, date: '2026-04-11' },
    ];
    const honesty: HonestyResult = {
      score: -1,
      state: 'collecting',
      message: 'Збираємо історію цін для аналізу...',
      details: {
        entryCount: 2,
        observedPrices: [
          { price: 2388, date: new Date('2026-03-27').getTime() },
          { price: 2550, date: new Date('2026-04-10').getTime() },
        ],
      },
    };

    const html = renderChart(data, honesty);
    expect(html).toContain('нижча за максимум зібраних спостережень');
  });

  it('renders analyzed stats panel fields', () => {
    const data = [
      { price: 2500, date: '2026-03-01' },
      { price: 2450, date: '2026-03-10' },
      { price: 2400, date: '2026-03-20' },
      { price: 2300, date: '2026-04-01' },
      { price: 2200, date: '2026-04-10' },
    ];
    const honesty: HonestyResult = {
      score: 74,
      state: 'analyzed',
      message: 'Вигідна ціна',
      details: {
        entryCount: 5,
        min90: 2200,
        max90: 2500,
        median90: 2400,
        trend: 'falling',
        isVolatile: false,
        hasSpike: false,
      },
    };

    const html = renderChart(data, honesty);
    expect(html).toContain('Мін · 90д');
    expect(html).toContain('Медіана');
    expect(html).toContain('Макс · 90д');
    expect(html).toContain('Знижується');
    expect(html).toContain('Індекс чесності');
  });
});

