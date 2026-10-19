import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HonestyCalculator, canShowVerdict, honestyIcon } from '@/core/HonestyCalculator';
import { confirmedDays, DAY_MS, historyPresentation } from '@/core/history';

const now = Date.parse('2026-10-19T12:00:00Z');
const point = (days: number, price = 1000) => ({ price, date: now - days * DAY_MS, source: 'system' });
const dense = (count: number, price = 1000) => Array.from({ length: count }, (_, i) => point(count - 1 - i, price));
const calculate = (price: number, history = dense(30), regularPrice?: number) => HonestyCalculator.calculate(price, history, 'unknown', { now, regularPrice });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });

describe('daily evidence and price value', () => {
  it('rejects invalid current prices and untrusted, future or invalid observations', () => {
    expect(calculate(Infinity).state).toBe('invalid');
    expect(calculate(0).state).toBe('invalid');
    expect(calculate(1000, [{ ...point(0), price: Infinity }, point(-1), { ...point(0), source: 'community' }]).state).toBe('collecting');
  });
  it('uses exactly 60 UTC dates, including the entire oldest day', () => {
    const start = Date.parse('2026-08-21T00:00:00Z');
    expect(confirmedDays([{ price: 1, date: start }, { price: 2, date: start - 1 }, point(0)], 60, now).map(p => p.price)).toEqual([1, 1000]);
  });
  it('uses the latest same-day observation without increasing evidence', () => {
    const result = calculate(1000, [point(0, 900), point(0), { ...point(0, 1100), date: now - 1 }]);
    expect(result.state).toBe('single-price');
    expect(result.details).toMatchObject({ entryCount: 1, observedPrice: 1000, daysAtObservedPrice: 0 });
  });
  it('rejects an inconsistent server day', () => {
    expect(confirmedDays([{ ...point(0), day: '2026-10-18' }], 60, now)).toEqual([]);
  });
  it('keeps zero, one and two day states distinct', () => {
    expect(calculate(1000, []).state).toBe('collecting');
    expect(calculate(1000, dense(1)).state).toBe('single-price');
    expect(calculate(1000, dense(2)).details?.observedPrices).toHaveLength(2);
  });
  it.each([[1000, 50], [600, 70], [1400, 30], [3000, 0]])('price %s gives value %s', (price, score) => {
    expect(calculate(price).score).toBe(score);
  });
  it('retains daily weights and kopecks in the median', () => {
    const result = calculate(1000.01, [point(3, 1000.01), point(2, 1000.01), point(1, 1000.01), point(0, 2000)]);
    expect(result.metrics?.median60).toBe(1000.01);
    expect(result.score).toBe(50);
  });
  it('computes min30 from exactly the last 30 UTC dates', () => {
    const result = calculate(1000, [point(30, 1), point(29, 900), point(0, 1000)]);
    expect(result.metrics?.min30).toBe(900);
    expect(calculate(1000, [point(40), point(45), point(50)]).state).toBe('collecting');
  });
  it('keeps volatility separate from economic value', () => {
    const result = calculate(1000, [point(3, 500), point(2, 1000), point(1, 1000), point(0, 1500)]);
    expect(result.details?.isVolatile).toBe(true);
    expect(result.metrics?.penalty).toBe(0);
    expect(result.score).toBe(50);
  });
  it('gates confidence at 14/30 days and the coverage thresholds', () => {
    expect(calculate(1000, dense(13)).confidence?.level).toBe('low');
    expect(calculate(1000, dense(14)).confidence?.level).toBe('medium');
    expect(calculate(1000, dense(30)).confidence?.level).toBe('high');
    const seventy = [...dense(13), point(19)];
    expect(calculate(1000, seventy).confidence).toMatchObject({ level: 'medium', coverage: .7, spanDays: 20 });
    expect(calculate(1000, [...dense(13), point(20)]).confidence?.level).toBe('low');
  });
  it('rechecks freshness independently of confidence and hides a stale verdict', () => {
    const history = dense(30).map(p => ({ ...p, date: p.date - 2 * DAY_MS }));
    expect(calculate(600, history).confidence?.stale).toBe(false);
    history.forEach(p => p.date--);
    const stale = calculate(600, history);
    expect(stale.confidence?.stale).toBe(true);
    expect(stale.verdict).toBeUndefined();
    expect(honestyIcon(stale)).toBe('inactive');
  });
  it('uses matching verdict/icon thresholds with neutral preliminary and warning states', () => {
    expect(honestyIcon(calculate(600))).toBe('success');
    expect(honestyIcon(calculate(1200))).toBe('inactive');
    expect(honestyIcon(calculate(1220))).toBe('error');
    expect(honestyIcon(calculate(600, dense(3)))).toBe('inactive');
    expect(canShowVerdict(calculate(600, dense(3)))).toBe(false);
  });
});

describe('promotion evidence', () => {
  const pattern = () => [...dense(7).map(p => ({ ...p, date: p.date - 20 * DAY_MS })), point(5, 1500), point(4, 1450), point(0)];
  it('requires an advertised discount, seven older days and adjacent raised days', () => {
    const result = calculate(1000, pattern(), 1500);
    expect(result.discount?.status).toBe('suspicious-pattern');
    expect(result.details?.hasSpike).toBe(true);
    expect(result.metrics?.penalty).toBe(0);
    expect(calculate(1000, pattern()).discount?.status).toBe('not-advertised');
    expect(calculate(1000, pattern().slice(1), 1500).discount?.status).toBe('insufficient-data');
    const gap = pattern(); gap[8] = point(2, 1450);
    expect(calculate(1000, gap, 1500).discount?.status).toBe('no-suspicious-pattern');
  });
  it('never invents an older baseline from recent points', () => {
    expect(calculate(1000, [point(5, 1500), point(4, 1500), point(0)], 1600).discount?.status).toBe('insufficient-data');
  });
});

describe('period presentation', () => {
  it('groups only adjacent identical full states, preserving every daily weight', () => {
    const history = [point(5, 300.99), point(4, 300.99), point(2, 300.99), { ...point(1, 300.99), oldPrice: 400 }, point(0, 300.99)];
    const model = historyPresentation(history, 14, now);
    expect(model.periods.map(p => p.count)).toEqual([2, 1, 1, 1]);
    expect(model.periods.reduce((sum, p) => sum + p.count, 0)).toBe(model.points.length);
    expect(model.chart.find(p => p.timestamp === now - 12 * 3600000 - 3 * DAY_MS)?.price).toBeNull();
    expect(model.points[0]?.price).toBe(300.99);
  });
  it('selects calendar windows rather than the last N observations', () => {
    expect(historyPresentation([point(40), point(20), point(0)], 14, now).points).toHaveLength(1);
    expect(historyPresentation([point(40), point(20), point(0)], 30, now).points).toHaveLength(2);
  });
});
